"""Tests for authentication (TS-06).

Covers TS-06 AC2-AC6, AC11 and FR-003-FR-009.
Contract: specs/006-authentication/contracts/auth-api.md.
Synthetic data only: users live in a fake lookup, the secret is the fake test
secret from constants.py, and no test uses a database or the network (the
startup checks run in a subprocess that fails on import).
"""

import base64
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

import app.auth
import app.db
import app.main
from app.models import User
from app.passwords import hash_password
from constants import OTHER_TEST_SECRET, TEST_AUTH_SECRET

SECRET_MESSAGE = "AUTH_SECRET must be set to a random value of at least 32 characters"
MINUTES_MESSAGE = "ACCESS_TOKEN_MINUTES must be a whole number of minutes from 1 to 1440"
LOGIN_FAILED_BODY = b'{"detail":"Incorrect username or password"}'
NOT_AUTHENTICATED = {"detail": "Not authenticated"}
SERVICE_UNAVAILABLE = {"detail": "Service unavailable"}

DOCTOR_PASSWORD = "doctor-pass-1"
NURSE_PASSWORD = "nurse-pass-1"

client = TestClient(app.main.app)

# Response bodies seen by the tests, checked for the secret in test_no_secret_in_responses.
_seen_bodies: list[str] = []


def _record(response):
    _seen_bodies.append(response.text)
    return response


class FakeUserLookup:
    """In-memory replacement for DbUserLookup with two synthetic users and call counters."""

    def __init__(self):
        users = [
            User(
                id=1,
                username="demo.doctor",
                full_name="Dra. Ana Demo",
                role="doctor",
                password_hash=hash_password(DOCTOR_PASSWORD, iterations=1000),
            ),
            User(
                id=2,
                username="demo.nurse",
                full_name="Enf. Luis Demo",
                role="nurse",
                password_hash=hash_password(NURSE_PASSWORD, iterations=1000),
            ),
        ]
        self.by_id_map = {u.id: u for u in users}
        self.by_username_map = {u.username: u for u in users}
        self.by_id_calls = 0
        self.by_username_calls = 0

    def by_username(self, username):
        self.by_username_calls += 1
        return self.by_username_map.get(username)

    def by_id(self, user_id):
        self.by_id_calls += 1
        return self.by_id_map.get(user_id)


@pytest.fixture
def fake_users():
    """Replace the database user lookup with the fake one (cleared by conftest)."""
    lookup = FakeUserLookup()
    app.main.app.dependency_overrides[app.auth.get_user_lookup] = lambda: lookup
    return lookup


def _b64url(data: dict) -> str:
    raw = json.dumps(data, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _login(username, password):
    return _record(
        client.post("/auth/login", json={"username": username, "password": password})
    )


def _me(headers=None):
    return _record(client.get("/me", headers=headers or {}))


# --- Settings (FR-009, AC6) ---------------------------------------------------


@pytest.mark.parametrize(
    "environ",
    [{}, {"AUTH_SECRET": ""}, {"AUTH_SECRET": "   "}, {"AUTH_SECRET": "s" * 31}],
    ids=["missing", "empty", "blank", "31-characters"],
)
def test_bad_secret_rejected_with_fixed_message(environ):
    """FR-009, AC6: a missing, blank or short AUTH_SECRET raises the fixed message, which never contains the value."""
    with pytest.raises(RuntimeError) as excinfo:
        app.auth.load_auth_settings(environ)

    message = str(excinfo.value)
    assert message == SECRET_MESSAGE
    if environ.get("AUTH_SECRET", "").strip():
        assert environ["AUTH_SECRET"] not in message


def test_32_character_secret_accepted_with_default_minutes():
    """FR-009: a 32-character secret is accepted and the token lifetime defaults to 480 minutes."""
    settings = app.auth.load_auth_settings({"AUTH_SECRET": "k" * 32})

    assert settings.secret == "k" * 32
    assert settings.token_minutes == 480


def test_blank_minutes_default_to_480():
    """FR-009: a blank ACCESS_TOKEN_MINUTES gives the default 480."""
    settings = app.auth.load_auth_settings(
        {"AUTH_SECRET": TEST_AUTH_SECRET, "ACCESS_TOKEN_MINUTES": "  "}
    )

    assert settings.token_minutes == 480


def test_minutes_setting_used():
    """FR-009: ACCESS_TOKEN_MINUTES="60" gives 60 minutes."""
    settings = app.auth.load_auth_settings(
        {"AUTH_SECRET": TEST_AUTH_SECRET, "ACCESS_TOKEN_MINUTES": "60"}
    )

    assert settings.token_minutes == 60


@pytest.mark.parametrize("minutes", ["1", "1440"])
def test_minutes_boundaries_accepted(minutes):
    """FR-009 (edge case): the boundary values 1 and 1440 are accepted."""
    settings = app.auth.load_auth_settings(
        {"AUTH_SECRET": TEST_AUTH_SECRET, "ACCESS_TOKEN_MINUTES": minutes}
    )

    assert settings.token_minutes == int(minutes)


@pytest.mark.parametrize("minutes", ["0", "1441", "-5", "abc", "1.5"])
def test_bad_minutes_rejected_with_fixed_message(minutes):
    """FR-009: an ACCESS_TOKEN_MINUTES outside 1-1440 or not a whole number raises the fixed message without the value."""
    with pytest.raises(RuntimeError) as excinfo:
        app.auth.load_auth_settings(
            {"AUTH_SECRET": TEST_AUTH_SECRET, "ACCESS_TOKEN_MINUTES": minutes}
        )

    assert str(excinfo.value) == MINUTES_MESSAGE


# --- Startup (FR-009, AC6) ----------------------------------------------------


def _import_app_main(auth_secret):
    backend_dir = Path(__file__).resolve().parents[1]
    env = os.environ.copy()
    env["AUTH_SECRET"] = auth_secret
    env["ACCESS_TOKEN_MINUTES"] = ""
    env["CORS_ORIGINS"] = ""
    env.pop("DATABASE_URL", None)
    return subprocess.run(
        [sys.executable, "-c", "import app.main"],
        cwd=backend_dir,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )


def test_missing_secret_stops_startup():
    """FR-009, AC6: with no AUTH_SECRET the application fails to start with the fixed message."""
    result = _import_app_main("")

    assert result.returncode != 0
    assert SECRET_MESSAGE in result.stderr


def test_short_secret_value_not_printed():
    """AC6: with a short AUTH_SECRET the application fails to start and the value is never printed."""
    result = _import_app_main("short-secret-value")

    assert result.returncode != 0
    assert SECRET_MESSAGE in result.stderr
    assert "short-secret-value" not in result.stderr
    assert "short-secret-value" not in result.stdout


# --- Login (AC2, AC3, FR-003-FR-005) --------------------------------------------


def test_login_success(fake_users):
    """AC2, FR-003, FR-005: correct credentials give 200 with exactly access_token, token_type and expires_in, and an HS256 token for the user."""
    response = _login("demo.doctor", DOCTOR_PASSWORD)

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"access_token", "token_type", "expires_in"}
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 28800
    claims = jwt.decode(body["access_token"], TEST_AUTH_SECRET, algorithms=["HS256"])
    assert claims["sub"] == "1"
    assert claims["exp"] - claims["iat"] == 28800


def test_unknown_user_and_wrong_password_identical(fake_users):
    """AC3, SC-003, FR-004: an unknown username and a wrong password give byte-identical 401 responses."""
    unknown = _login("nobody.here", DOCTOR_PASSWORD)
    wrong = _login("demo.doctor", "wrong-password")

    for response in (unknown, wrong):
        assert response.status_code == 401
        assert response.content == LOGIN_FAILED_BODY
        assert response.headers.get("www-authenticate") == "Bearer"
    assert unknown.content == wrong.content


def test_unknown_user_checks_dummy_hash(fake_users, monkeypatch):
    """FR-004: an unknown username still runs one password verification (against the dummy hash)."""
    calls = []

    def spy(password, stored):
        calls.append(stored)
        return False

    monkeypatch.setattr(app.auth, "verify_password", spy)

    response = _login("nobody.here", "any-password")

    assert response.status_code == 401
    assert len(calls) == 1
    assert calls[0].startswith("pbkdf2_sha256$")


@pytest.mark.parametrize("username", ["Demo.Doctor", " demo.doctor", "demo.doctor "])
def test_username_exact_match(fake_users, username):
    """FR-003 (edge case): the username is matched exactly, with no lower-casing or trimming."""
    response = _login(username, DOCTOR_PASSWORD)

    assert response.status_code == 401
    assert response.content == LOGIN_FAILED_BODY


@pytest.mark.parametrize(
    "kwargs, secret_value",
    [
        ({"json": {"username": "demo.doctor"}}, None),
        ({"json": {"username": "", "password": "secret-value-empty-user"}}, "secret-value-empty-user"),
        ({"json": {"username": "demo.doctor", "password": ""}}, None),
        ({"json": {"username": "u" * 51, "password": "secret-value-long-user"}}, "secret-value-long-user"),
        ({"json": {"username": "demo.doctor", "password": "p" * 129}}, "p" * 129),
        ({"json": {"username": "demo.doctor", "password": 123}}, None),
        (
            {
                "content": b'{"username": "demo.doctor", "password": "secret-value-bad-json"',
                "headers": {"Content-Type": "application/json"},
            },
            "secret-value-bad-json",
        ),
    ],
    ids=[
        "missing-password",
        "empty-username",
        "empty-password",
        "username-51",
        "password-129",
        "password-number",
        "not-json",
    ],
)
def test_login_invalid_input_422(fake_users, kwargs, secret_value):
    """AC3, research R6: invalid login input gives 422 without echoing the submitted values (no "input"/"ctx")."""
    response = _record(client.post("/auth/login", **kwargs))

    assert response.status_code == 422
    if secret_value is not None:
        assert secret_value not in response.text
    assert '"input"' not in response.text
    assert '"ctx"' not in response.text
    for error in response.json()["detail"]:
        assert set(error) == {"type", "loc", "msg"}
    assert fake_users.by_username_calls == 0


def test_login_without_database_503():
    """FR-007: with no DATABASE_URL (conftest) and no override, login gives 503 "Service unavailable"."""
    response = _login("demo.doctor", DOCTOR_PASSWORD)

    assert response.status_code == 503
    assert response.json() == SERVICE_UNAVAILABLE


class FailingSession:
    """A fake session whose queries always fail like a lost connection."""

    def scalars(self, *args, **kwargs):
        raise OperationalError("x", {}, Exception())

    def get(self, *args, **kwargs):
        raise OperationalError("x", {}, Exception())

    def close(self):
        pass


def test_db_error_gives_503(monkeypatch):
    """FR-007, U3: a database error during the lookup gives 503, with a new exception object each time."""
    monkeypatch.setattr(app.auth, "database_url", lambda: "postgresql+pg8000://fake")
    lookup = app.auth.DbUserLookup(session_factory=lambda: FailingSession())

    with pytest.raises(HTTPException) as first:
        lookup.by_username("demo.doctor")
    with pytest.raises(HTTPException) as second:
        lookup.by_username("demo.doctor")
    with pytest.raises(HTTPException) as by_id:
        lookup.by_id(1)

    assert first.value.status_code == 503
    assert second.value.status_code == 503
    assert by_id.value.status_code == 503
    assert first.value.detail == "Service unavailable"
    assert first.value is not second.value


class _EmptyResult:
    def first(self):
        return None


class _EmptySession:
    def scalars(self, *args, **kwargs):
        return _EmptyResult()

    def close(self):
        pass


def test_lookup_is_lazy(monkeypatch):
    """FR-006, research R4: the lookup opens a session only on first use, and only once."""
    monkeypatch.setattr(app.auth, "database_url", lambda: "postgresql+pg8000://fake")
    calls = []

    def spy():
        calls.append(1)
        return _EmptySession()

    lookup = app.auth.DbUserLookup(session_factory=spy)
    assert calls == []

    assert lookup.by_username("demo.doctor") is None
    assert lookup.by_username("demo.nurse") is None
    assert len(calls) == 1


# --- /me (AC4, SC-002, FR-006) --------------------------------------------------


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_me_valid_token(fake_users):
    """AC4, FR-006: a valid token gives 200 with exactly username, full_name and role."""
    token, _ = app.auth.create_access_token(2)

    response = _me(_bearer(token))

    assert response.status_code == 200
    assert response.json() == {
        "username": "demo.nurse",
        "full_name": "Enf. Luis Demo",
        "role": "nurse",
    }


def test_me_with_login_token(fake_users):
    """AC2, AC4: the token returned by /auth/login is accepted by /me."""
    token = _login("demo.doctor", DOCTOR_PASSWORD).json()["access_token"]

    response = _me(_bearer(token))

    assert response.status_code == 200
    assert response.json()["username"] == "demo.doctor"


def _tampered_token():
    token, _ = app.auth.create_access_token(1)
    header, payload, signature = token.split(".")
    claims = jwt.decode(token, TEST_AUTH_SECRET, algorithms=["HS256"])
    claims["sub"] = "2"
    return ".".join([header, _b64url(claims), signature])


def _alg_none_token():
    now = int(datetime.now(timezone.utc).timestamp())
    header = _b64url({"alg": "none", "typ": "JWT"})
    payload = _b64url({"sub": "1", "iat": now, "exp": now + 3600})
    return f"{header}.{payload}."


def _rejected_headers():
    now = datetime.now(timezone.utc)
    later = now + timedelta(hours=1)
    return {
        "none": {},
        "basic-scheme": {"Authorization": "Basic abc"},
        "empty-bearer": {"Authorization": "Bearer"},
        "not-a-jwt": {"Authorization": "Bearer not-a-jwt"},
        "other-secret": _bearer(
            jwt.encode({"sub": "1", "iat": now, "exp": later}, OTHER_TEST_SECRET, algorithm="HS256")
        ),
        "tampered": _bearer(_tampered_token()),
        "expired": _bearer(app.auth.create_access_token(1, now=now - timedelta(days=2))[0]),
        "no-exp": _bearer(jwt.encode({"sub": "1", "iat": now}, TEST_AUTH_SECRET, algorithm="HS256")),
        "sub-not-integer": _bearer(
            jwt.encode({"sub": "abc", "iat": now, "exp": later}, TEST_AUTH_SECRET, algorithm="HS256")
        ),
        "alg-none": _bearer(_alg_none_token()),
    }


@pytest.mark.parametrize("case", list(_rejected_headers()))
def test_me_rejected(fake_users, case):
    """AC4, SC-002, FR-006: a missing, malformed, forged, tampered, expired or incomplete token gives 401 "Not authenticated"."""
    headers = _rejected_headers()[case]

    response = _me(headers)

    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED
    assert response.headers.get("www-authenticate") == "Bearer"


def test_me_deleted_account(fake_users):
    """AC4: a valid token for an account that no longer exists gives 401."""
    token, _ = app.auth.create_access_token(99)

    response = _me(_bearer(token))

    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED


def _signed_token_with_sub(sub):
    now = datetime.now(timezone.utc)
    claims = {"sub": sub, "iat": now, "exp": now + timedelta(hours=1)}
    return jwt.encode(claims, TEST_AUTH_SECRET, algorithm="HS256")


def test_me_oversized_sub_401(fake_users):
    """AC4, T028 low finding: a validly signed token whose sub is above the
    PostgreSQL INTEGER maximum (2147483647) gives 401, not 503, before any user lookup.
    """
    oversized = _signed_token_with_sub("2147483648")

    response = _me(_bearer(oversized))

    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED
    assert fake_users.by_id_calls == 0
    assert app.auth.decode_access_token(oversized) is None
    assert app.auth.decode_access_token(_signed_token_with_sub("2147483647")) == 2147483647


def test_me_bad_token_does_not_touch_database(fake_users):
    """FR-006, I1: an invalid token is rejected before any user lookup."""
    response = _me({"Authorization": "Bearer not-a-jwt"})

    assert response.status_code == 401
    assert fake_users.by_id_calls == 0


def test_me_valid_token_without_database_503():
    """FR-007: a valid token with no DATABASE_URL (conftest) and no override gives 503."""
    token, _ = app.auth.create_access_token(1)

    response = _me(_bearer(token))

    assert response.status_code == 503
    assert response.json() == SERVICE_UNAVAILABLE


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer not-a-jwt"}], ids=["no-token", "bad-token"])
def test_me_missing_token_without_database_401(headers):
    """AC4, I1: with no DATABASE_URL and no override, a missing or bad token still gives 401, not 503."""
    response = _me(headers)

    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED


# --- Health and leaks (AC5, AC6, AC11) -----------------------------------------


def test_health_still_public():
    """AC5: GET /health stays public and needs no token."""
    app.main.app.dependency_overrides[app.db.check_database] = lambda: "ok"

    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"


def test_no_secret_in_responses(fake_users):
    """AC6, FR-009: the secret never appears in any response body (login ok/401, /me 401 and earlier tests)."""
    _login("demo.doctor", DOCTOR_PASSWORD)
    _login("demo.doctor", "wrong-password")
    _me({"Authorization": "Bearer not-a-jwt"})

    assert _seen_bodies
    for body in _seen_bodies:
        assert TEST_AUTH_SECRET not in body
        assert DOCTOR_PASSWORD not in body
