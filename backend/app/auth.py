"""Authentication (TS-06): settings, access tokens, user lookup, the reusable get_current_user dependency and the /auth/login and /me routes. Contract: specs/006-authentication/contracts/auth-api.md.

The username, password, token and secret are never logged, printed or returned.
"""

import functools
import logging
import os
import re
import secrets
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db import database_url, get_engine
from app.models import User
from app.passwords import hash_password, verify_password

load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)

logger = logging.getLogger(__name__)


# --- Settings -----------------------------------------------------------------


@dataclass(frozen=True)
class AuthSettings:
    """Authentication settings read from the environment."""

    secret: str
    token_minutes: int
    login_rate_limit: int
    login_rate_window_seconds: int


def _positive_int(environ, name: str, default: int) -> int:
    """Read a whole number >= 1 from ``environ``; invalid values raise a fixed message."""
    raw = (environ.get(name) or "").strip()
    if not raw:
        return default
    if not re.fullmatch(r"\d+", raw, flags=re.ASCII) or int(raw) < 1:
        raise RuntimeError(f"{name} must be a whole number of at least 1")
    return int(raw)


def load_auth_settings(environ) -> AuthSettings:
    """Read ``AUTH_SECRET``, ``ACCESS_TOKEN_MINUTES`` and the login rate-limit
    settings from ``environ``.

    Raises ``RuntimeError`` with a fixed message (never the value) when a setting
    is invalid.
    """
    secret = (environ.get("AUTH_SECRET") or "").strip()
    if len(secret) < 32:
        raise RuntimeError(
            "AUTH_SECRET must be set to a random value of at least 32 characters"
        )
    raw = (environ.get("ACCESS_TOKEN_MINUTES") or "").strip()
    if not raw:
        token_minutes = 480
    else:
        if not re.fullmatch(r"\d+", raw, flags=re.ASCII) or not 1 <= int(raw) <= 1440:
            raise RuntimeError(
                "ACCESS_TOKEN_MINUTES must be a whole number of minutes from 1 to 1440"
            )
        token_minutes = int(raw)
    login_rate_limit = _positive_int(environ, "LOGIN_RATE_LIMIT", 10)
    login_rate_window_seconds = _positive_int(
        environ, "LOGIN_RATE_WINDOW_SECONDS", 60
    )
    return AuthSettings(
        secret=secret,
        token_minutes=token_minutes,
        login_rate_limit=login_rate_limit,
        login_rate_window_seconds=login_rate_window_seconds,
    )


SETTINGS = load_auth_settings(os.environ)


# --- Tokens -------------------------------------------------------------------

_SUB_PATTERN = re.compile(r"[1-9]\d*", flags=re.ASCII)
# Postgres integer range (users.id).
_MAX_USER_ID = 2_147_483_647


def create_access_token(
    user_id: int, *, now: datetime | None = None
) -> tuple[str, int]:
    """Return a signed HS256 access token for ``user_id`` and its lifetime in seconds."""
    now = now or datetime.now(timezone.utc)
    exp = now + timedelta(minutes=SETTINGS.token_minutes)
    token = jwt.encode(
        {"sub": str(user_id), "iat": now, "exp": exp},
        SETTINGS.secret,
        algorithm="HS256",
    )
    return token, SETTINGS.token_minutes * 60


def decode_access_token(token: str) -> int | None:
    """Return the user id from a valid token, or ``None`` for any invalid token."""
    try:
        claims = jwt.decode(
            token,
            SETTINGS.secret,
            algorithms=["HS256"],
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.PyJWTError:
        return None
    sub = claims.get("sub")
    if not isinstance(sub, str) or not _SUB_PATTERN.fullmatch(sub):
        return None
    if int(sub) > _MAX_USER_ID:
        return None
    return int(sub)


# --- Errors -------------------------------------------------------------------


def _service_unavailable() -> HTTPException:
    """Return a new 503 exception (never a shared instance)."""
    return HTTPException(503, "Service unavailable")


def _unauthorized(detail: str) -> HTTPException:
    """Return a new 401 exception with the ``WWW-Authenticate: Bearer`` header."""
    return HTTPException(401, detail, headers={"WWW-Authenticate": "Bearer"})


def _too_many_login_attempts() -> HTTPException:
    """Return a new 429 exception with a fixed message (never reveals the client or user)."""
    return HTTPException(429, "Too many login attempts")


_LOGIN_FAILED = "Incorrect username or password"
_NOT_AUTHENTICATED = "Not authenticated"


# --- Login rate limiting (TS-10, FR-008, AC7) ---------------------------------


def _client_identity(request: Request) -> str:
    """Return the client identity used to key the rate limiter.

    Behind the Azure App Service front end the real client address is the first
    entry of ``X-Forwarded-For``; fall back to the direct peer address. The value
    is used only as an opaque bucket key and is never logged or returned.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    client = request.client
    return client.host if client is not None else "unknown"


class LoginRateLimiter:
    """In-memory fixed-window rate limiter, keyed per client (per worker process).

    Counts every attempt (success or failure) from a client within the current
    window; once the limit is exceeded the client is blocked until the window
    elapses. State lives in module memory, so it is per worker (research R6); no
    database and no new dependency.
    """

    def __init__(self, limit: int, window_seconds: int):
        self._limit = limit
        self._window = window_seconds
        self._buckets: dict[str, tuple[float, int]] = {}

    def allow(self, identity: str, *, now: float | None = None) -> bool:
        """Record an attempt for ``identity`` and return whether it is allowed."""
        now = time.monotonic() if now is None else now
        window_start, count = self._buckets.get(identity, (now, 0))
        if now - window_start >= self._window:
            window_start, count = now, 0
        count += 1
        self._buckets[identity] = (window_start, count)
        return count <= self._limit

    def reset(self) -> None:
        """Clear all counters (used by tests so per-worker state does not leak)."""
        self._buckets.clear()


login_rate_limiter = LoginRateLimiter(
    SETTINGS.login_rate_limit, SETTINGS.login_rate_window_seconds
)


# --- User lookup --------------------------------------------------------------


class DbUserLookup:
    """Look up users in the database; the session is opened only on first use."""

    def __init__(self, session_factory=None):
        self._session_factory = session_factory or (lambda: Session(get_engine()))
        self._session = None

    def _get_session(self):
        if database_url() is None:
            raise _service_unavailable()
        if self._session is None:
            self._session = self._session_factory()
        return self._session

    def by_username(self, username) -> User | None:
        """Return the user with exactly this username, or ``None``."""
        try:
            return self._get_session().scalars(
                select(User).where(User.username == username)
            ).first()
        except SQLAlchemyError as exc:
            logger.warning("User lookup failed (%s)", type(exc).__name__)
            raise _service_unavailable()

    def by_id(self, user_id) -> User | None:
        """Return the user with this id, or ``None``."""
        try:
            return self._get_session().get(User, user_id)
        except SQLAlchemyError as exc:
            logger.warning("User lookup failed (%s)", type(exc).__name__)
            raise _service_unavailable()

    def close(self):
        """Close the session if it was created."""
        if self._session is not None:
            self._session.close()


def get_user_lookup():
    """FastAPI dependency: yield a lazy ``DbUserLookup``; never raises or connects."""
    lookup = DbUserLookup()
    try:
        yield lookup
    finally:
        lookup.close()


# --- Protection check ---------------------------------------------------------

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    users: DbUserLookup = Depends(get_user_lookup),
) -> User:
    """Return the signed-in user or raise 401.

    Use `Depends(get_current_user)` on every clinical endpoint.

    The token is checked before any database access, so a missing or invalid
    token gives 401 even when the database is unavailable.
    """
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized(_NOT_AUTHENTICATED)
    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise _unauthorized(_NOT_AUTHENTICATED)
    user = users.by_id(user_id)
    if user is None:
        raise _unauthorized(_NOT_AUTHENTICATED)
    return user


# --- Models -------------------------------------------------------------------


class LoginRequest(BaseModel):
    """Login body; the username is matched exactly (no trimming or lower-casing)."""

    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class MeResponse(BaseModel):
    username: str
    full_name: str
    role: str


# --- Dummy hash ---------------------------------------------------------------


@functools.cache
def _dummy_hash() -> str:
    """Hash of a random value, checked for unknown usernames to even out timing."""
    return hash_password(secrets.token_urlsafe(32))


# --- Routes -------------------------------------------------------------------

router = APIRouter()


@router.post("/auth/login", response_model=TokenResponse)
def login(
    body: LoginRequest,
    request: Request,
    users: DbUserLookup = Depends(get_user_lookup),
):
    """Exchange a username and password for a short-lived access token.

    Rate limited per client (FR-008, AC7): once the configured number of attempts
    in the window is exceeded, further attempts get HTTP 429 until the window
    elapses, without revealing whether the username exists.
    """
    if not login_rate_limiter.allow(_client_identity(request)):
        raise _too_many_login_attempts()
    user = users.by_username(body.username)
    if user is None:
        verify_password(body.password, _dummy_hash())
        raise _unauthorized(_LOGIN_FAILED)
    if not verify_password(body.password, user.password_hash):
        raise _unauthorized(_LOGIN_FAILED)
    token, expires_in = create_access_token(user.id)
    return TokenResponse(access_token=token, expires_in=expires_in)


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user)):
    """Return the signed-in user's username, full name and role."""
    return MeResponse(username=user.username, full_name=user.full_name, role=user.role)
