"""Tests for the HTTP security headers middleware (TS-10 FR-010, AC9).

Contract: specs/010-backend-deployment/contracts/security-controls.md section 3.
The headers must appear on every response, including error responses. No test
uses a database or the network (the database check is overridden where needed).
"""

import pytest
from fastapi.testclient import TestClient

import app.db
import app.main

client = TestClient(app.main.app)

EXPECTED = {
    "content-security-policy": (
        "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'"
    ),
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
}


def _assert_all_headers(response):
    for name, value in EXPECTED.items():
        assert response.headers.get(name) == value


def test_headers_on_ok_response():
    """AC9: a normal 200 response (/health) carries all three headers with the exact values."""
    app.main.app.dependency_overrides[app.db.check_database] = lambda: "ok"
    response = client.get("/health")
    assert response.status_code == 200
    _assert_all_headers(response)


def test_headers_on_401_response():
    """AC9: a 401 error response (/me without a token) carries all three headers."""
    response = client.get("/me")
    assert response.status_code == 401
    _assert_all_headers(response)


def test_headers_on_422_response():
    """AC9: a 422 validation error response carries all three headers."""
    response = client.post("/auth/login", json={"username": "only-user"})
    assert response.status_code == 422
    _assert_all_headers(response)


def test_headers_on_404_response():
    """AC9: an unknown path (404) still carries all three headers."""
    response = client.get("/does-not-exist")
    assert response.status_code == 404
    _assert_all_headers(response)


@pytest.mark.parametrize("header", list(EXPECTED))
def test_frame_protection_present(header):
    """AC9: frame-ancestors 'none' in the CSP and X-Frame-Options: DENY are both present."""
    app.main.app.dependency_overrides[app.db.check_database] = lambda: "ok"
    response = client.get("/health")
    assert header in response.headers
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
