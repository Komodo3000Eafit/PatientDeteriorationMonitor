"""Serve the React production build from the backend (TS-11).

The frontend and backend deploy together on one Azure App Service: FastAPI
serves the Vite build, so both share one origin (constitution v1.2.0,
DECISIONS D-39). This module is the static-serving helper that ``main.py``
wires in (T003). It stays a no-op when the build is absent, so the backend
still starts in local dev and under the test suite (FR-010).

Design for the ``main.py`` wiring (T003):

- Call :func:`build_present` to decide whether to serve the SPA at all.
- When the build is present, mount the hashed assets with
  :func:`mount_assets` (Vite emits ``assets/`` under the build; real assets get
  correct content types and a genuine 404 for a missing asset, not the shell)
  — FR-003, FR-005.
- Register a GET-only catch-all ``/{full_path:path}`` whose handler is
  :func:`build_spa_handler`; it returns ``index.html`` for paths with no real
  file match, with HTTP 200 and an HTML content type (FR-002).

No new dependency: only ``starlette.staticfiles.StaticFiles`` and
``starlette.responses.FileResponse`` are used, both already available via
FastAPI.
"""

from collections.abc import Awaitable, Callable
from pathlib import Path

from starlette.responses import FileResponse
from starlette.staticfiles import StaticFiles

# Resolved relative to the ``app`` package at import time, never hard-coded
# (research R1). The build lands in ``backend/app/static/`` and ``index.html``
# is the SPA shell (FR-002).
BUILD_DIR: Path = Path(__file__).resolve().parent / "static"
INDEX_FILE: Path = BUILD_DIR / "index.html"

# Vite emits hashed, immutable files under ``assets/`` in the build (research
# R2). Mounted with StaticFiles so each asset is served with the right content
# type and a real 404 when missing (FR-003, FR-005).
ASSETS_DIR: Path = BUILD_DIR / "assets"
ASSETS_MOUNT: str = "/assets"


def build_present() -> bool:
    """Return whether the React build is available to serve.

    True only when the static directory exists and contains ``index.html``;
    this is the single check ``main.py`` uses before mounting assets or
    registering the SPA catch-all (FR-010).
    """
    return BUILD_DIR.is_dir() and INDEX_FILE.is_file()


def assets_present() -> bool:
    """Return whether the hashed-assets directory exists.

    ``StaticFiles(directory=...)`` raises at construction when the directory is
    missing, so the assets mount is guarded by this check (FR-010).
    """
    return ASSETS_DIR.is_dir()


def mount_assets(app) -> bool:
    """Mount the Vite ``assets/`` directory on ``app`` if it exists.

    Real assets are served with correct content types; a request for a missing
    asset returns a genuine 404 from StaticFiles rather than the SPA shell
    (FR-003, FR-005). Returns True when the mount was added, False when the
    directory is absent (no-op, FR-010).

    Called by ``main.py`` (T003); kept here so the wiring stays a one-liner.
    """
    if not assets_present():
        return False
    app.mount(ASSETS_MOUNT, StaticFiles(directory=ASSETS_DIR), name="assets")
    return True


def build_spa_handler() -> Callable[..., Awaitable[FileResponse]]:
    """Build the GET-only SPA catch-all handler that returns the shell.

    ``main.py`` (T003) registers the returned coroutine on a GET
    ``/{full_path:path}`` route. It returns ``index.html`` via ``FileResponse``
    with HTTP 200 and an HTML content type for any path that did not match a
    real file or route (FR-002). This must only be registered when
    :func:`build_present` is True; for the no-build case ``main.py`` returns its
    own small 404/placeholder instead of calling this.
    """

    async def spa_catch_all(full_path: str) -> FileResponse:
        # ``full_path`` is captured by the route for completeness; the SPA does
        # its own client-side routing, so every unmatched GET returns the shell.
        return FileResponse(INDEX_FILE, media_type="text/html")

    return spa_catch_all
