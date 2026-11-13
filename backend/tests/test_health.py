"""Tests for GET /health.

Contracts: TS-01 specs/001-fastapi-app-skeleton/contracts/health.md and
TS-02 specs/002-neon-db-connection/contracts/health.md. The database check is
replaced with a dependency override or, with no override, runs with no
DATABASE_URL (removed by conftest), so no test uses a real database.
"""

from fastapi.testclient import TestClient

import app
import app.db
import app.main

client = TestClient(app.main.app)


def test_health_returns_ok_and_version():
    """TS-01 AC1, TS-02 AC2: with a reachable database, GET /health returns 200 with status, version and database "ok"."""
    app.main.app.dependency_overrides[app.db.check_database] = lambda: "ok"

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": app.__version__, "database": "ok"}


def test_health_reports_database_unavailable():
    """TS-02 AC3 (FR-005): with an unreachable database, /health still returns 200, status "ok" and database "unavailable"."""
    app.main.app.dependency_overrides[app.db.check_database] = lambda: "unavailable"

    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "unavailable"


def test_health_without_database_url():
    """TS-02 AC4: with DATABASE_URL unset (conftest) and no override, /health returns 200 and database "unavailable"."""
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["database"] == "unavailable"


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
    """TS-02 AC5 (FR-007): /health exposes no internal details; the body has only "status", "version" and "database"."""
    response = client.get("/health")

    assert set(response.json().keys()) == {"status", "version", "database"}
