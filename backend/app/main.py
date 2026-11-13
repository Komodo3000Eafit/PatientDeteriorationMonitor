"""FastAPI application entry point."""

import os

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.db import check_database

DEFAULT_CORS_ORIGINS = ["http://localhost:5173"]


def parse_cors_origins(value: str | None) -> list[str]:
    """Turn the ``CORS_ORIGINS`` setting into the list of allowed origins.

    The value is a comma-separated list. Each entry is stripped of surrounding
    spaces and of a trailing ``/``; empty entries are dropped. When nothing is
    left (unset or blank value), ``DEFAULT_CORS_ORIGINS`` is returned. A ``*``
    entry is rejected with a ``ValueError`` whose message is fixed text and never
    includes the configured value.
    """
    origins = [entry.strip().rstrip("/") for entry in (value or "").split(",")]
    origins = [origin for origin in origins if origin]
    if any(origin == "*" for origin in origins):
        raise ValueError(
            "CORS_ORIGINS must not contain '*'; list the allowed origins explicitly"
        )
    if not origins:
        return list(DEFAULT_CORS_ORIGINS)
    return origins


app = FastAPI(title="PatientDeteriorationMonitor API", version=__version__)
app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_cors_origins(os.environ.get("CORS_ORIGINS")),
    allow_credentials=False,
    allow_methods=["GET"],
)


@app.get("/health")
def health(database: str = Depends(check_database)) -> dict[str, str]:
    """Report that the API is running, its version and the database status.

    ``database`` is ``"ok"`` when a trivial query succeeds during this request and
    ``"unavailable"`` otherwise. The response is HTTP 200 in both cases.
    """
    return {"status": "ok", "version": __version__, "database": database}
