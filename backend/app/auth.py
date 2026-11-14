"""Authentication (TS-06): settings, access tokens, user lookup, the reusable get_current_user dependency and the /auth/login and /me routes. Contract: specs/006-authentication/contracts/auth-api.md.

The username, password, token and secret are never logged, printed or returned.
"""

import functools
import logging
import os
import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
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


def load_auth_settings(environ) -> AuthSettings:
    """Read ``AUTH_SECRET`` and ``ACCESS_TOKEN_MINUTES`` from ``environ``.

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
    return AuthSettings(secret=secret, token_minutes=token_minutes)


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


_LOGIN_FAILED = "Incorrect username or password"
_NOT_AUTHENTICATED = "Not authenticated"


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
def login(body: LoginRequest, users: DbUserLookup = Depends(get_user_lookup)):
    """Exchange a username and password for a short-lived access token."""
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
