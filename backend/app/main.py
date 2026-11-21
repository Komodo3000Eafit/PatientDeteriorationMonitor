"""FastAPI application entry point."""

import os
import re

from fastapi import Depends, FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import __version__
from app import auth  # importing app.auth runs the AUTH_SECRET startup check
from app import patients
from app.db import check_database
from app.security_headers import SecurityHeadersMiddleware
from app.static_serving import build_present, build_spa_handler, mount_assets

DEFAULT_CORS_ORIGINS = ["http://localhost:5173"]


# An allowed origin is scheme://host[:port], the shape a browser sends in the
# Origin header: scheme http/https, a non-empty host, an optional numeric port,
# no path, query or fragment (TS-10 FR-009).
_ORIGIN_PATTERN = re.compile(
    r"^https?://[A-Za-z0-9.\-]+(:\d+)?$", flags=re.ASCII
)


def parse_cors_origins(value: str | None) -> list[str]:
    """Turn the ``CORS_ORIGINS`` setting into the list of allowed origins.

    The value is a comma-separated list. Each entry is stripped of surrounding
    spaces and of a trailing ``/``; empty entries (blanks between commas) are
    dropped. When nothing is left (unset or blank value), ``DEFAULT_CORS_ORIGINS``
    is returned.

    A ``*`` entry is rejected (TS-04). In addition (TS-10 FR-009), every remaining
    entry MUST be a valid ``scheme://host[:port]`` origin; ``null``, ``http://``,
    ``example.com`` and any other malformed entry cause startup to fail, with no
    silent fallback to the default. Each ``ValueError`` message is fixed text and
    never includes the configured value.
    """
    origins = [entry.strip().rstrip("/") for entry in (value or "").split(",")]
    origins = [origin for origin in origins if origin]
    if any(origin == "*" for origin in origins):
        raise ValueError(
            "CORS_ORIGINS must not contain '*'; list the allowed origins explicitly"
        )
    if not origins:
        return list(DEFAULT_CORS_ORIGINS)
    if any(not _ORIGIN_PATTERN.match(origin) for origin in origins):
        raise ValueError(
            "CORS_ORIGINS entries must be valid scheme://host[:port] origins"
        )
    return origins


app = FastAPI(title="PatientDeteriorationMonitor API", version=__version__)
app.include_router(auth.router, prefix="/api")
app.include_router(patients.router, prefix="/api")
# Security headers run on every response, including CORS preflight and errors
# (TS-10 FR-010, AC9).
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_cors_origins(os.environ.get("CORS_ORIGINS")),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    """Validation errors never echo submitted values (TS-06 research R6)."""
    return JSONResponse(
        status_code=422,
        content={
            "detail": [
                {"type": e["type"], "loc": list(e["loc"]), "msg": e["msg"]}
                for e in exc.errors()
            ]
        },
    )


@app.get("/health")
def health(database: str = Depends(check_database)) -> dict[str, str]:
    """Report that the API is running, its version and the database status.

    ``database`` is ``"ok"`` when a trivial query succeeds during this request and
    ``"unavailable"`` otherwise. The response is HTTP 200 in both cases.
    """
    return {"status": "ok", "version": __version__, "database": database}


def _is_api_path(full_path: str) -> bool:
    """Return whether ``full_path`` is owned by the API rather than the SPA.

    ``full_path`` is the catch-all capture with no leading slash (e.g.
    ``api/does-not-exist``). All API routes live under ``/api`` except
    ``/health`` (research R9), so the SPA catch-all excludes exactly those: an
    unknown path under ``/api`` (``api/does-not-exist``) or ``/health`` must
    reach the API's own JSON 404, not the SPA shell (FR-004, AC4).
    """
    return (
        full_path == "health"
        or full_path == "api"
        or full_path.startswith("api/")
    )


# Static serving (TS-11) is wired in LAST, after every API router, the
# ``/health`` route and the middleware, so API routes keep precedence over the
# SPA catch-all (contract §1). When the React build is absent (local dev, tests)
# nothing is registered and the backend starts normally (FR-010).
if build_present():
    # Hashed Vite assets: real files served with correct content types, a
    # genuine 404 for a missing asset (FR-003, FR-005).
    mount_assets(app)

    _spa_handler = build_spa_handler()

    # GET-only catch-all, registered last so it only runs for GETs that matched
    # no API route and no real asset. A POST/PUT to a non-API path is not served
    # the shell; it falls through to the default 405/404 (FR-006).
    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        # An unknown path under the API (e.g. ``api/does-not-exist``) or
        # ``/health`` returns the API's JSON 404, matching FastAPI's default
        # shape, instead of the SPA shell (FR-004, AC4).
        if _is_api_path(full_path):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
        return await _spa_handler(full_path)
