"""FastAPI application entry point."""

from fastapi import FastAPI

from app import __version__

app = FastAPI(title="PatientDeteriorationMonitor API", version=__version__)


@app.get("/health")
def health() -> dict[str, str]:
    """Report that the API is running and which version it is."""
    return {"status": "ok", "version": __version__}
