"""Tests for the Alembic migrations (TS-03, AC1, AC3, AC6, FR-004, FR-011).

Offline tests render the SQL with ``--sql`` mode into a buffer; the online tests
only check the error paths with no URL or a fake engine. No test connects to a
database or uses the network; the only URL used is a placeholder.
"""

import io
import re
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import ForeignKeyConstraint
from sqlalchemy.exc import OperationalError

import app.db
from app.models import Base

ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"
FIVE_TABLES = {"users", "patients", "vital_signs", "triage_events", "alerts"}
PLACEHOLDER_SECRET = "s3cr3t-placeholder"
PLACEHOLDER_HOST = "db.example.invalid"


def make_config(buffer=None):
    """Return an Alembic config for backend/alembic.ini, optionally writing SQL to a buffer."""
    cfg = Config(str(ALEMBIC_INI))
    if buffer is not None:
        cfg.output_buffer = buffer
    return cfg


def offline_upgrade_sql():
    buffer = io.StringIO()
    command.upgrade(make_config(buffer), "head", sql=True)
    return buffer.getvalue()


def test_single_head():
    """AC2: the migration history has a single head, the initial schema."""
    script = ScriptDirectory.from_config(make_config())
    assert script.get_heads() == ["0001_initial_schema"]


def test_offline_upgrade_creates_the_five_tables():
    """AC1: upgrade SQL creates the five tables plus alembic_version, and nothing else."""
    sql = offline_upgrade_sql()
    created = re.findall(r"CREATE TABLE (\w+)", sql)
    assert sorted(created) == sorted(FIVE_TABLES | {"alembic_version"})
    assert re.search(
        r"INSERT INTO alembic_version \(version_num\) VALUES \('0001_initial_schema'\)",
        sql,
    )


def test_offline_upgrade_matches_models():
    """FR-001, research R5: every model column and named constraint is in the upgrade SQL."""
    sql = offline_upgrade_sql()
    for table in Base.metadata.tables.values():
        for column in table.columns:
            assert column.name in sql, (table.name, column.name)
        for constraint in table.constraints:
            assert constraint.name, (table.name, constraint)
            assert f"CONSTRAINT {constraint.name} " in sql, constraint.name
            if isinstance(constraint, ForeignKeyConstraint):
                fk_line = next(
                    line for line in sql.splitlines()
                    if f"CONSTRAINT {constraint.name} " in line
                )
                assert "ON DELETE RESTRICT" in fk_line, constraint.name
    fk_lines = [line for line in sql.splitlines() if "FOREIGN KEY" in line]
    assert len(fk_lines) == 5
    assert all("ON DELETE RESTRICT" in line for line in fk_lines)


def test_offline_downgrade_drops_the_five_tables():
    """AC3: downgrade SQL drops the five tables."""
    buffer = io.StringIO()
    command.downgrade(make_config(buffer), "head:base", sql=True)
    sql = buffer.getvalue()
    for name in FIVE_TABLES:
        assert f"DROP TABLE {name};" in sql, name


def test_online_without_database_url_fails_cleanly():
    """FR-004, edge case: with no DATABASE_URL an online command stops with a clear message."""
    with pytest.raises(SystemExit) as excinfo:
        command.current(make_config())
    assert str(excinfo.value.code) == "DATABASE_URL is not set"


class _FailingEngine:
    """Fake engine whose connect() fails with a driver message holding placeholders."""

    def connect(self):
        raise OperationalError(
            f"could not connect: user:{PLACEHOLDER_SECRET}@{PLACEHOLDER_HOST}",
            None,
            Exception(),
        )

    def dispose(self):
        pass


def test_connection_failure_prints_no_credentials(monkeypatch, capsys):
    """FR-004, AC6, edge case: a connection error shows only its type, never the URL or secret."""
    monkeypatch.setenv(
        "DATABASE_URL",
        f"postgresql://user:{PLACEHOLDER_SECRET}@{PLACEHOLDER_HOST}/neondb",
    )
    monkeypatch.setattr(app.db, "get_engine", lambda: _FailingEngine())

    with pytest.raises(SystemExit) as excinfo:
        command.current(make_config())

    message = str(excinfo.value.code)
    assert message == "Could not connect to the database (OperationalError)"
    captured = capsys.readouterr()
    for text in (message, captured.out, captured.err):
        assert PLACEHOLDER_SECRET not in text
        assert PLACEHOLDER_HOST not in text
