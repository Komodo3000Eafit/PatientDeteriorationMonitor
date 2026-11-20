"""Tests for static serving and the SPA fallback (TS-11).

Contract: specs/011-frontend-served-by-backend/contracts/static-serving.md
section 2 (request -> response table) and section 3 (security headers).

The React build is never committed (``backend/app/static/`` is git-ignored).
The serving wiring in ``app.main`` runs at IMPORT TIME inside ``if
build_present():`` (``build_present()`` is true only when
``backend/app/static/index.html`` exists). To exercise the build-PRESENT
behaviour these tests create a temporary ``backend/app/static/`` tree with an
``index.html`` shell and an ``assets/app.js`` file, then reload ``app.main`` so
its import-time wiring registers the asset mount and the SPA catch-all. Teardown
removes the temp tree and reloads ``app.main`` again so the module returns to the
clean build-ABSENT state and no other test (or artifact) is polluted.

No test uses a real database or the network; the database check is overridden
where ``/health`` is called, matching the other backend suites. Only synthetic
data is used.
"""

import importlib
import shutil
import subprocess

import pytest
from fastapi.testclient import TestClient

import app
import app.db
import app.main
import app.static_serving

# Recognisable SPA shell so a test can tell the index.html shell apart from any
# API JSON or a StaticFiles 404. Synthetic content only.
SHELL_MARKER = 'id="app-shell"'
INDEX_HTML = (
    '<!doctype html><html id="app-shell"><head><title>PDM</title></head>'
    "<body><div id=\"root\"></div></body></html>"
)
ASSET_JS = 'console.log("synthetic build asset");\n'

BUILD_DIR = app.static_serving.BUILD_DIR
ASSETS_DIR = app.static_serving.ASSETS_DIR
INDEX_FILE = app.static_serving.INDEX_FILE
ASSET_FILE = ASSETS_DIR / "app.js"


def _remove_build_dir():
    """Delete the temporary build directory if present (always-safe teardown)."""
    if BUILD_DIR.exists():
        shutil.rmtree(BUILD_DIR)


def _is_shell(response) -> bool:
    """Return whether a response body is the SPA index.html shell."""
    return SHELL_MARKER in response.text


@pytest.fixture
def build_present_client():
    """Create a synthetic build, reload app.main so it serves the SPA, yield a client.

    The build must exist BEFORE app.main is imported/reloaded because the static
    wiring is import-time and guarded by ``build_present()``. Teardown removes the
    temp tree and reloads app.main again so the module is back to the clean
    build-ABSENT state for every other test.
    """
    _remove_build_dir()
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    INDEX_FILE.write_text(INDEX_HTML, encoding="utf-8")
    ASSET_FILE.write_text(ASSET_JS, encoding="utf-8")
    assert app.static_serving.build_present()

    importlib.reload(app.main)
    # Database check is overridden so /health never touches a real database.
    app.main.app.dependency_overrides[app.db.check_database] = lambda: "ok"
    client = TestClient(app.main.app)
    try:
        yield client
    finally:
        app.main.app.dependency_overrides.clear()
        _remove_build_dir()
        # Restore the clean (build-absent) wiring for the rest of the suite.
        importlib.reload(app.main)


@pytest.fixture
def build_absent_client():
    """Ensure no build exists, reload app.main, yield a client (FR-010)."""
    _remove_build_dir()
    assert not app.static_serving.build_present()

    importlib.reload(app.main)
    app.main.app.dependency_overrides[app.db.check_database] = lambda: "ok"
    client = TestClient(app.main.app)
    try:
        yield client
    finally:
        app.main.app.dependency_overrides.clear()
        importlib.reload(app.main)


# --- Pre-conditions -------------------------------------------------------


def test_static_dir_is_git_ignored():
    """The temp build dir must be git-ignored so test artifacts are never committed."""
    result = subprocess.run(
        ["git", "check-ignore", str(INDEX_FILE)],
        capture_output=True,
        text=True,
    )
    # git check-ignore exits 0 and echoes the path when it is ignored.
    assert result.returncode == 0, "backend/app/static/ must be git-ignored"


# --- Build PRESENT --------------------------------------------------------


def test_root_returns_shell(build_present_client):
    """AC1 FR-002: GET / -> 200 text/html, body is the index.html shell."""
    response = build_present_client.get("/")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert _is_shell(response)


def test_client_route_returns_shell(build_present_client):
    """AC2 FR-003: GET /patients/PAT-001 (no file, not an API route) -> 200 text/html shell."""
    response = build_present_client.get("/patients/PAT-001")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert _is_shell(response)


def test_existing_asset_served_with_js_type(build_present_client):
    """AC3 FR-005: GET an existing asset -> 200 with a JS content type, the asset bytes."""
    response = build_present_client.get("/assets/app.js")

    assert response.status_code == 200
    assert response.headers["content-type"].split(";")[0] in (
        "application/javascript",
        "text/javascript",
    )
    assert "synthetic build asset" in response.text
    assert not _is_shell(response)


def test_missing_asset_returns_404_not_shell(build_present_client):
    """FR-005 edge: GET /assets/missing.js -> 404 and NOT the SPA shell."""
    response = build_present_client.get("/assets/missing.js")

    assert response.status_code == 404
    assert not _is_shell(response)


def test_health_is_json_not_shell_when_build_present(build_present_client):
    """AC4 FR-004: GET /health -> 200 JSON {status, version, database}, not the shell."""
    response = build_present_client.get("/health")

    assert response.status_code == 200
    assert not _is_shell(response)
    assert response.json() == {
        "status": "ok",
        "version": app.__version__,
        "database": "ok",
    }


def test_unknown_api_path_returns_json_404_not_shell(build_present_client):
    """AC4 FR-004: GET /api/does-not-exist (unknown path under /api) -> JSON 404
    {"detail": "Not Found"}, never the SPA shell."""
    response = build_present_client.get("/api/does-not-exist")

    assert response.status_code == 404
    assert not _is_shell(response)
    assert response.json() == {"detail": "Not Found"}


def test_old_unprefixed_paths_return_shell_not_api(build_present_client):
    """AC9 FR-004a edge: the former unprefixed /auth/login and /me are no longer API
    routes. The API now lives under /api, so a GET to the old paths is an ordinary
    non-API GET that falls through to the SPA fallback: 200 text/html shell, not the
    JSON API (contract section 2 row 'GET /auth/login or /me (old, unprefixed)')."""
    for old_path in ("/auth/login", "/me"):
        response = build_present_client.get(old_path)

        assert response.status_code == 200, old_path
        assert response.headers["content-type"].startswith("text/html"), old_path
        assert _is_shell(response), old_path


def test_post_to_non_api_path_is_not_shell(build_present_client):
    """FR-006 edge: POST to a non-API path -> 405/404, never the SPA shell."""
    response = build_present_client.post("/anything-not-an-api-path")

    assert response.status_code in (404, 405)
    assert not _is_shell(response)


def test_shell_carries_csp_header(build_present_client):
    """AC8 smoke: the shell response still carries the CSP with frame-ancestors 'none'."""
    response = build_present_client.get("/")

    csp = response.headers.get("content-security-policy")
    assert csp is not None
    assert "frame-ancestors 'none'" in csp


# --- Build ABSENT ---------------------------------------------------------


def test_health_unaffected_when_build_absent(build_absent_client):
    """FR-010: with no build, the API still works; GET /health -> 200 JSON."""
    response = build_absent_client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "version": app.__version__,
        "database": "ok",
    }


def test_root_not_shell_when_build_absent(build_absent_client):
    """FR-010 edge: with no build, GET / is a plain 404, not the SPA shell."""
    response = build_absent_client.get("/")

    assert response.status_code == 404
    assert SHELL_MARKER not in response.text
