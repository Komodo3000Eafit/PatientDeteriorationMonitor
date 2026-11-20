"""Tests for login rate limiting (TS-10 FR-008, AC7).

Contract: specs/010-backend-deployment/contracts/security-controls.md section 1.
Synthetic data only: users live in a fake lookup, the secret is the fake test
secret from constants.py, and no test uses a database or the network.

One test per acceptance-criterion behaviour:
- within the limit a valid login succeeds and a wrong one returns 401;
- the (limit + 1)-th attempt in the window returns 429;
- after the window passes the counter resets and a valid login succeeds again;
- two different client identities have independent counters.
"""

import pytest
from fastapi.testclient import TestClient

import app.auth
import app.main
from app.models import User
from app.passwords import hash_password

DOCTOR_PASSWORD = "doctor-pass-1"
TOO_MANY = {"detail": "Too many login attempts"}
LOGIN_FAILED = {"detail": "Incorrect username or password"}

client = TestClient(app.main.app)


class FakeUserLookup:
    """In-memory replacement for DbUserLookup with one synthetic user."""

    def __init__(self):
        self._user = User(
            id=1,
            username="demo.doctor",
            full_name="Dra. Ana Demo",
            role="doctor",
            password_hash=hash_password(DOCTOR_PASSWORD, iterations=1000),
        )

    def by_username(self, username):
        return self._user if username == self._user.username else None

    def by_id(self, user_id):
        return self._user if user_id == self._user.id else None


@pytest.fixture
def fake_users():
    app.main.app.dependency_overrides[app.auth.get_user_lookup] = lambda: FakeUserLookup()
    return None


@pytest.fixture
def small_limiter(monkeypatch):
    """Replace the module limiter with a small, fresh one so the test is fast and isolated."""
    limiter = app.auth.LoginRateLimiter(limit=3, window_seconds=60)
    monkeypatch.setattr(app.auth, "login_rate_limiter", limiter)
    return limiter


def _login(username, password, headers=None):
    return client.post(
        "/auth/login",
        json={"username": username, "password": password},
        headers=headers or {"X-Forwarded-For": "203.0.113.10"},
    )


def test_valid_and_wrong_login_within_limit(fake_users, small_limiter):
    """AC7: within the limit a valid login succeeds (200) and a wrong one returns 401."""
    ok = _login("demo.doctor", DOCTOR_PASSWORD)
    assert ok.status_code == 200
    assert set(ok.json()) == {"access_token", "token_type", "expires_in"}

    wrong = _login("demo.doctor", "wrong-password")
    assert wrong.status_code == 401
    assert wrong.json() == LOGIN_FAILED


def test_over_the_limit_returns_429(fake_users, small_limiter):
    """AC7, FR-008: the (limit + 1)-th attempt in the window returns 429 with a fixed body."""
    for _ in range(3):
        resp = _login("demo.doctor", "wrong-password")
        assert resp.status_code == 401

    blocked = _login("demo.doctor", "wrong-password")
    assert blocked.status_code == 429
    assert blocked.json() == TOO_MANY

    # Even correct credentials are blocked once the window limit is hit.
    blocked_valid = _login("demo.doctor", DOCTOR_PASSWORD)
    assert blocked_valid.status_code == 429


def test_window_reset_allows_login_again(fake_users, small_limiter):
    """AC7: after the window elapses the counter resets and a valid login succeeds again.

    The reset is driven deterministically through the limiter's ``now`` argument so
    the test does not sleep for a real window.
    """
    identity = "203.0.113.20"
    for _ in range(3):
        assert small_limiter.allow(identity, now=0.0) is True
    assert small_limiter.allow(identity, now=0.0) is False  # 4th in the window

    # A later attempt, after the 60 s window, is allowed again.
    assert small_limiter.allow(identity, now=61.0) is True


def test_two_clients_independent(fake_users, small_limiter):
    """AC7: the limit is per client, so one client exhausting it does not block another."""
    client_a = {"X-Forwarded-For": "203.0.113.30"}
    client_b = {"X-Forwarded-For": "203.0.113.31"}

    for _ in range(3):
        assert _login("demo.doctor", "wrong-password", client_a).status_code == 401
    assert _login("demo.doctor", "wrong-password", client_a).status_code == 429

    # A different client still has its full allowance.
    assert _login("demo.doctor", DOCTOR_PASSWORD, client_b).status_code == 200


@pytest.mark.parametrize(
    "setting",
    ["LOGIN_RATE_LIMIT", "LOGIN_RATE_WINDOW_SECONDS"],
)
@pytest.mark.parametrize("value", ["0", "-1", "abc", "1.5"])
def test_invalid_rate_settings_rejected(setting, value):
    """FR-008: an invalid rate-limit setting raises a fixed RuntimeError that never echoes the value."""
    environ = {"AUTH_SECRET": "k" * 32, setting: value}
    with pytest.raises(RuntimeError) as excinfo:
        app.auth.load_auth_settings(environ)
    message = str(excinfo.value)
    assert message == f"{setting} must be a whole number of at least 1"
    assert value not in message or value in setting


def test_default_rate_settings():
    """FR-008: the defaults are 10 attempts per 60 s when the settings are unset."""
    settings = app.auth.load_auth_settings({"AUTH_SECRET": "k" * 32})
    assert settings.login_rate_limit == 10
    assert settings.login_rate_window_seconds == 60
