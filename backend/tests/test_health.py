"""Tests for GET /health (TS-01, contract: specs/001-fastapi-app-skeleton/contracts/health.md)."""

from fastapi.testclient import TestClient

import app
import app.main

client = TestClient(app.main.app)


def test_health_returns_ok_and_version():
    """AC1: GET /health returns 200 with exactly {"status": "ok", "version": app.__version__}."""
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": app.__version__}


def test_health_version_consistency():
    """AC4 (consistency check): /health version equals app.__version__ and the OpenAPI info.version.

    This only checks that the reported versions agree. The single-source property
    (version defined in exactly one place) is verified by T006 and code review.
    """
    health_version = client.get("/health").json()["version"]
    openapi_version = client.get("/openapi.json").json()["info"]["version"]

    assert health_version == app.__version__
    assert openapi_version == app.__version__


def test_unknown_path_returns_404():
    """Edge case: a path that does not exist returns 404 "Not Found", not a server error."""
    response = client.get("/does-not-exist")

    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}


def test_health_rejects_post():
    """Edge case: a method other than GET on /health is rejected with 405 Method Not Allowed."""
    response = client.post("/health")

    assert response.status_code == 405


def test_health_exposes_no_internal_details():
    """Edge case: /health exposes no internal details; the body has only "status" and "version"."""
    response = client.get("/health")

    assert set(response.json().keys()) == {"status", "version"}
