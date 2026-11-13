"""Tests for app.db (TS-02, spec: specs/002-neon-db-connection/spec.md).

No test uses the network: engines are faked with monkeypatch, and the conftest
fixture removes DATABASE_URL before each test (FR-008). Only placeholder
credentials and hosts are used (constitution VI).
"""

import logging
import ssl
from contextlib import contextmanager

import pytest
from sqlalchemy.exc import OperationalError

import app.db

PLACEHOLDER_URL = "postgresql://user:s3cr3t-placeholder@db.example.invalid/neondb"


class FakeConnection:
    """A connection whose execute() does nothing."""

    def execute(self, statement):
        return None


class FakeEngine:
    """A fake engine. ``failures`` lists, per connect() call, an exception to raise or None."""

    def __init__(self, failures=None):
        self.failures = list(failures or [])
        self.connect_calls = 0

    @contextmanager
    def connect(self):
        self.connect_calls += 1
        error = self.failures.pop(0) if self.failures else None
        if error is not None:
            raise error
        yield FakeConnection()

    def dispose(self):
        """No-op: the conftest fixture calls reset_engine(), which disposes the engine."""


def fake_create_engine_returning(engine):
    """Return a create_engine replacement that ignores its arguments and returns ``engine``."""

    def fake_create_engine(*args, **kwargs):
        return engine

    return fake_create_engine


def test_database_url_converts_postgresql_scheme(monkeypatch):
    """AC1: postgresql:// becomes postgresql+pg8000:// and sslmode/channel_binding are dropped."""
    monkeypatch.setenv(
        "DATABASE_URL", "postgresql://u:p@host/db?sslmode=require&channel_binding=require"
    )

    assert app.db.database_url() == "postgresql+pg8000://u:p@host/db"


def test_database_url_converts_postgres_scheme(monkeypatch):
    """AC1: postgres:// becomes postgresql+pg8000://."""
    monkeypatch.setenv("DATABASE_URL", "postgres://u:p@host/db")

    assert app.db.database_url() == "postgresql+pg8000://u:p@host/db"


def test_database_url_removes_libpq_params_and_keeps_others(monkeypatch):
    """AC1: sslmode and channel_binding are removed; other query parameters are kept."""
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql://u:p@host/db?sslmode=require&application_name=pdm&channel_binding=require",
    )

    assert app.db.database_url() == "postgresql+pg8000://u:p@host/db?application_name=pdm"


def test_get_engine_passes_tls_and_timeout(monkeypatch):
    """FR-006, Principle VIII: the engine gets a TLS ssl_context that verifies the
    certificate and host name, a 5 s connect timeout and a 5 s pool timeout."""
    monkeypatch.setenv("DATABASE_URL", PLACEHOLDER_URL)
    recorded = {}

    def fake_create_engine(url, **kwargs):
        recorded["url"] = url
        recorded.update(kwargs)
        return FakeEngine()

    monkeypatch.setattr(app.db, "create_engine", fake_create_engine)

    app.db.get_engine()

    connect_args = recorded["connect_args"]
    ssl_context = connect_args["ssl_context"]
    assert isinstance(ssl_context, ssl.SSLContext)
    assert ssl_context.check_hostname is True
    assert ssl_context.verify_mode == ssl.CERT_REQUIRED
    assert connect_args["timeout"] == 5
    assert recorded["pool_timeout"] == 5


def test_database_url_missing_or_empty_is_none(monkeypatch):
    """AC4: an unset or blank DATABASE_URL means "not configured" (None)."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert app.db.database_url() is None

    monkeypatch.setenv("DATABASE_URL", "   ")
    assert app.db.database_url() is None


def test_check_database_without_url_is_unavailable(monkeypatch):
    """AC4: with no DATABASE_URL, check_database() returns "unavailable" without creating an engine."""

    def failing_create_engine(*args, **kwargs):
        pytest.fail("create_engine must not be called when DATABASE_URL is missing")

    monkeypatch.setattr(app.db, "create_engine", failing_create_engine)

    assert app.db.check_database() == "unavailable"


def test_check_database_ok_when_query_succeeds(monkeypatch):
    """AC2: when the query succeeds, check_database() returns "ok"."""
    monkeypatch.setenv("DATABASE_URL", PLACEHOLDER_URL)
    monkeypatch.setattr(app.db, "create_engine", fake_create_engine_returning(FakeEngine()))

    assert app.db.check_database() == "ok"


def test_check_database_connection_error_is_unavailable_and_logs_no_credentials(
    monkeypatch, caplog
):
    """AC3, AC5: a connection error gives "unavailable" and the log has only the error type."""
    monkeypatch.setenv("DATABASE_URL", PLACEHOLDER_URL)
    error = OperationalError(
        "could not connect: user:s3cr3t-placeholder@db.example.invalid", None, Exception()
    )
    monkeypatch.setattr(
        app.db, "create_engine", fake_create_engine_returning(FakeEngine(failures=[error]))
    )
    caplog.set_level(logging.WARNING, logger="app.db")

    assert app.db.check_database() == "unavailable"
    assert "OperationalError" in caplog.text
    assert "s3cr3t-placeholder" not in caplog.text
    assert "db.example.invalid" not in caplog.text


def test_check_database_malformed_url_is_unavailable(monkeypatch):
    """Edge case (FR-002, FR-004): a malformed DATABASE_URL gives "unavailable" with the real create_engine."""
    monkeypatch.setenv("DATABASE_URL", "not a url")

    assert app.db.check_database() == "unavailable"


def test_check_database_recovers_on_next_call(monkeypatch):
    """Edge case (FR-004): a failed check is not cached; the next call can return "ok"."""
    monkeypatch.setenv("DATABASE_URL", PLACEHOLDER_URL)
    error = OperationalError("could not connect", None, Exception())
    monkeypatch.setattr(
        app.db,
        "create_engine",
        fake_create_engine_returning(FakeEngine(failures=[error, None])),
    )

    assert app.db.check_database() == "unavailable"
    assert app.db.check_database() == "ok"
