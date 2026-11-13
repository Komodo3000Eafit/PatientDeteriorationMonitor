"""FastAPI application entry point."""

from fastapi import Depends, FastAPI

from app import __version__
from app.db import check_database

app = FastAPI(title="PatientDeteriorationMonitor API", version=__version__)


@app.get("/health")
def health(database: str = Depends(check_database)) -> dict[str, str]:
    """Report that the API is running, its version and the database status.

    ``database`` is ``"ok"`` when a trivial query succeeds during this request and
    ``"unavailable"`` otherwise. The response is HTTP 200 in both cases.
    """
    return {"status": "ok", "version": __version__, "database": database}
