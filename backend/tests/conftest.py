"""Shared test fixtures (TS-02).

The autouse fixture guarantees that no test reaches a real database, even if a
developer's ``backend/.env`` was loaded when ``app.db`` was imported: it removes
``DATABASE_URL`` and drops any cached engine before each test, and after each test
it drops the engine again and clears FastAPI dependency overrides
(FR-008, AC6; research R8).
"""

import os

# TS-04: build the app with the default CORS origin during tests; python-dotenv
# (override=False) won't replace a variable that already exists, so a developer's
# backend/.env can't change it (research R7).
os.environ["CORS_ORIGINS"] = ""

import pytest

import app.db
import app.main


@pytest.fixture(autouse=True)
def isolate_database(monkeypatch):
    """FR-008, AC6: run every test with no DATABASE_URL, no cached engine and no overrides."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    app.db.reset_engine()
    yield
    app.db.reset_engine()
    app.main.app.dependency_overrides.clear()
