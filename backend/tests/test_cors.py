"""Tests for the CORS configuration of the API (TS-04).

Covers TS-04 AC6, AC7, AC9 and FR-005, FR-006, FR-009.
Contract: specs/004-react-app-skeleton/contracts/cors-config.md.
No test uses a database or the network: the database check is overridden and the
wildcard startup check runs in a subprocess that fails on import, before any
connection is attempted.
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.db
import app.main
from constants import TEST_AUTH_SECRET

DEFAULT_ORIGIN = "http://localhost:5173"
WILDCARD_MESSAGE = "CORS_ORIGINS must not contain '*'; list the allowed origins explicitly"

client = TestClient(app.main.app)


@pytest.mark.parametrize("value", [None, "", " ", ",", " , "])
def test_parse_default_when_unset_or_blank(value):
    """AC6, FR-005: an unset or blank CORS_ORIGINS falls back to the local frontend origin."""
    assert app.main.parse_cors_origins(value) == [DEFAULT_ORIGIN]


def test_parse_trims_spaces_and_trailing_slash():
    """FR-005 (contract normalisation): a trailing "/" is removed from an origin."""
    assert app.main.parse_cors_origins("http://localhost:5173/") == [DEFAULT_ORIGIN]


def test_parse_configured_list_replaces_default():
    """AC7: a configured comma-separated list replaces the default; entries are trimmed."""
    assert app.main.parse_cors_origins(" http://a.example , http://b.example/ ") == [
        "http://a.example",
        "http://b.example",
    ]


@pytest.mark.parametrize("value", ["*", "http://a.example,*", " * "])
def test_parse_rejects_wildcard(value):
    """FR-006, FR-009: a "*" entry is rejected with a fixed message that never echoes the value."""
    with pytest.raises(ValueError) as excinfo:
        app.main.parse_cors_origins(value)

    message = str(excinfo.value)
    assert message == WILDCARD_MESSAGE
    assert "a.example" not in message


def test_default_origin_is_allowed():
    """AC6: a request from the default frontend origin gets the allow-origin header."""
    app.main.app.dependency_overrides[app.db.check_database] = lambda: "ok"

    response = client.get("/health", headers={"Origin": DEFAULT_ORIGIN})

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == DEFAULT_ORIGIN


def test_other_origin_is_not_allowed():
    """AC6, SC-005: a request from an origin not on the list gets no allow-origin header."""
    app.main.app.dependency_overrides[app.db.check_database] = lambda: "ok"

    response = client.get("/health", headers={"Origin": "http://evil.example"})

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


def test_credentials_not_allowed_and_no_wildcard():
    """FR-006: credentials are not allowed and the allow-origin header is never "*"."""
    app.main.app.dependency_overrides[app.db.check_database] = lambda: "ok"

    response = client.get("/health", headers={"Origin": DEFAULT_ORIGIN})

    assert response.headers.get("access-control-allow-credentials", "").lower() != "true"
    assert response.headers.get("access-control-allow-origin") != "*"


def test_wildcard_stops_startup():
    """AC7, FR-006: with CORS_ORIGINS="*" the application fails to start with the fixed message.

    TS-06 FR-018: the subprocess gets the fake test secret, so it still fails only because of "*".
    """
    backend_dir = Path(__file__).resolve().parents[1]
    env = os.environ.copy()
    env["CORS_ORIGINS"] = "*"
    env["AUTH_SECRET"] = TEST_AUTH_SECRET
    env["ACCESS_TOKEN_MINUTES"] = ""
    env.pop("DATABASE_URL", None)

    result = subprocess.run(
        [sys.executable, "-c", "import app.main"],
        cwd=backend_dir,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )

    assert result.returncode != 0
    assert WILDCARD_MESSAGE in result.stderr


PREFLIGHT_POST_HEADERS = {
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "authorization, content-type",
}


def test_preflight_post_with_authorization_allowed():
    """TS-06 AC10, FR-010: a POST preflight with Authorization and Content-Type from the default origin is allowed, without credentials."""
    response = client.options(
        "/auth/login", headers={"Origin": DEFAULT_ORIGIN, **PREFLIGHT_POST_HEADERS}
    )

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == DEFAULT_ORIGIN
    allowed_headers = response.headers.get("access-control-allow-headers", "").lower()
    assert "authorization" in allowed_headers
    assert "content-type" in allowed_headers
    assert response.headers.get("access-control-allow-credentials", "").lower() != "true"


def test_preflight_other_origin_not_allowed():
    """TS-06 AC10, FR-010: the same preflight from an origin not on the list gets no allow-origin header."""
    response = client.options(
        "/auth/login", headers={"Origin": "http://evil.example", **PREFLIGHT_POST_HEADERS}
    )

    assert "access-control-allow-origin" not in response.headers


def test_preflight_delete_not_allowed():
    """TS-06 AC10, FR-010: only GET and POST are allowed; a DELETE preflight is rejected."""
    response = client.options(
        "/auth/login",
        headers={"Origin": DEFAULT_ORIGIN, "Access-Control-Request-Method": "DELETE"},
    )

    assert response.status_code == 400
    assert "DELETE" not in response.headers.get("access-control-allow-methods", "")
