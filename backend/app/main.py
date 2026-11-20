"""FastAPI application entry point."""

import os
import re

from fastapi import Depends, FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import __version__
from app import auth  # importing app.auth runs the AUTH_SECRET startup check
from app.db import check_database
from app.security_headers import SecurityHeadersMiddleware

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
app.include_router(auth.router)
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
