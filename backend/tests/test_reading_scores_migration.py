"""Tests for the 0002_reading_scores migration and its backfill (US-03).

Covers AC5 and FR-003 of specs/017-vital-signs-scoring/spec.md, following
research.md R4: the revision's ``upgrade()`` and ``downgrade()`` run online
through a bare ``MigrationContext`` on an in-memory SQLite engine that holds only
the five TS-03 tables, so the real migration code (DDL, batching and backfill) is
exercised. Readings are inserted with plain SQL. Synthetic data only; no real
database (``DATABASE_URL`` is removed by conftest) and no network.
"""

from decimal import Decimal
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory

from app.models import Base
from app.readings import score_values
from app.scoring import InvalidVitalSigns, VitalSigns, get_scoring_system

ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"
TS03_TABLES = ["users", "patients", "vital_signs", "triage_events", "alerts"]
READING_SCORES = Base.metadata.tables["reading_scores"]

# Synthetic readings: (rr, spo2, on_oxygen, sbp, hr, consciousness, temperature).
READINGS = [
    (16, 97, False, 120, 72, "A", "36.8"),
    (22, 95, False, 118, 96, "A", "38.4"),   # contract example: total 5, medium
    (8, 91, True, 90, 131, "C", "35.0"),     # open ends, high
    (21, 94, True, 220, 41, "V", "39.1"),
    (25, 92, False, 101, 111, "U", "38.1"),
]


@pytest.fixture
def migration():
    """The 0002_reading_scores revision module, loaded through Alembic."""
    script = ScriptDirectory.from_config(Config(str(ALEMBIC_INI)))
    return script.get_revision("0002_reading_scores").module


@pytest.fixture
def engine():
    """In-memory SQLite engine with only the five TS-03 tables (the state before 0002)."""
    eng = sa.create_engine("sqlite://")
    with eng.begin() as conn:
        Base.metadata.create_all(
            conn, tables=[Base.metadata.tables[name] for name in TS03_TABLES]
        )
        conn.execute(sa.text(
            "INSERT INTO patients (identifier, name, age, sex, triage_level, status) "
            "VALUES ('TST-001', 'Synthetic Test Patient', 40, 'other', 4, 'active')"
        ))
    yield eng
    eng.dispose()


def insert_readings(engine, readings):
    """Insert synthetic readings with plain SQL; return their ids in order."""
    with engine.begin() as conn:
        patient_id = conn.execute(sa.text("SELECT id FROM patients")).scalar_one()
        for rr, spo2, oxygen, sbp, hr, acvpu, temp in readings:
            conn.execute(
                sa.text(
                    "INSERT INTO vital_signs (patient_id, respiratory_rate, spo2, on_oxygen, "
                    "systolic_bp, heart_rate, consciousness, temperature) "
                    "VALUES (:p, :rr, :spo2, :oxygen, :sbp, :hr, :acvpu, :temp)"
                ),
                dict(p=patient_id, rr=rr, spo2=spo2, oxygen=oxygen, sbp=sbp, hr=hr,
                     acvpu=acvpu, temp=float(temp)),
            )
        return list(conn.execute(sa.text("SELECT id FROM vital_signs ORDER BY id")).scalars())


def run(conn, function):
    """Run a revision function in an online migration context on ``conn``."""
    with Operations.context(MigrationContext.configure(conn)):
        function()


def table_names(conn):
    return set(sa.inspect(conn).get_table_names())


def stored_scores(conn):
    """{vital_sign_id: row} for every reading_scores row."""
    rows = conn.execute(sa.select(READING_SCORES)).all()
    return {row.vital_sign_id: row for row in rows}


def expected_score(reading):
    rr, spo2, oxygen, sbp, hr, acvpu, temp = reading
    vitals = VitalSigns(rr, spo2, oxygen, sbp, hr, acvpu, Decimal(temp))
    return score_values(get_scoring_system().score(vitals))


def reading_rows(conn):
    return conn.execute(sa.text("SELECT * FROM vital_signs ORDER BY id")).all()


def test_ac5_backfill_scores_every_reading_once(engine, migration):
    """AC5, FR-003: every existing reading gets exactly one score equal to the scoring module."""
    ids = insert_readings(engine, READINGS)
    with engine.begin() as conn:
        run(conn, migration.upgrade)

    with engine.connect() as conn:
        assert "reading_scores" in table_names(conn)
        rows = conn.execute(sa.select(READING_SCORES)).all()
        assert len(rows) == len(READINGS)
        scores = stored_scores(conn)
        assert sorted(scores) == ids
        for reading_id, reading in zip(ids, READINGS):
            row = scores[reading_id]
            expected = expected_score(reading)
            assert row.system == "NEWS2"
            assert (row.total, row.band, row.entries) == (
                expected["total"], expected["band"], expected["entries"],
            ), reading
        # Contract example (second reading): total 5, band medium, temperature as "38.4".
        example = scores[ids[1]]
        assert (example.total, example.band) == (5, "medium")
        assert example.entries[-1]["value"] == "38.4"


def test_ac5_backfill_empty_table(engine, migration):
    """AC5, edge case (backfill on an empty database): the upgrade succeeds and scores nothing."""
    with engine.begin() as conn:
        run(conn, migration.upgrade)
    with engine.connect() as conn:
        assert "reading_scores" in table_names(conn)
        assert conn.execute(sa.select(sa.func.count()).select_from(READING_SCORES)).scalar() == 0


def test_ac5_backfill_in_batches(engine, migration, monkeypatch):
    """AC5, FR-003 (research R4): with BATCH_SIZE 2 and 5 readings, all 5 are scored in 3 insert batches."""
    monkeypatch.setattr(migration, "BATCH_SIZE", 2)
    ids = insert_readings(engine, READINGS)
    inserts = []

    def count_inserts(conn, clauseelement, multiparams, params, execution_options):
        if isinstance(clauseelement, sa.Insert) and clauseelement.table.name == "reading_scores":
            # A list of several rows arrives as multiparams; a single row as params.
            inserts.append(len(multiparams) if multiparams else 1)

    with engine.begin() as conn:
        sa.event.listen(conn, "before_execute", count_inserts)
        run(conn, migration.upgrade)
        sa.event.remove(conn, "before_execute", count_inserts)

    assert inserts == [2, 2, 1]
    with engine.connect() as conn:
        assert sorted(stored_scores(conn)) == ids


def test_ac5_invalid_stored_reading_stops_upgrade(engine, migration):
    """AC5, edge case: a stored reading outside the accepted limits (temperature 46.0) raises
    InvalidVitalSigns naming no value; after rollback no reading_scores rows exist."""
    insert_readings(engine, READINGS[:2] + [(16, 97, False, 120, 72, "A", "46.0")])

    with engine.connect() as conn:
        trans = conn.begin()
        with pytest.raises(InvalidVitalSigns) as info:
            run(conn, migration.upgrade)
        trans.rollback()

    message = str(info.value)
    assert "temperature" in message
    assert "46" not in message
    assert [(p.parameter, p.reason) for p in info.value.problems] == [
        ("temperature", "out_of_range")
    ]
    with engine.connect() as conn:
        # SQLite may keep the CREATE TABLE outside the transaction; either way no score rows remain.
        if "reading_scores" in table_names(conn):
            count = conn.execute(sa.select(sa.func.count()).select_from(READING_SCORES)).scalar()
            assert count == 0
        assert len(reading_rows(conn)) == 3


def test_ac5_downgrade_drops_scores_only(engine, migration):
    """AC5, FR-003: downgrade drops reading_scores and leaves the readings untouched."""
    insert_readings(engine, READINGS)
    with engine.connect() as conn:
        before = reading_rows(conn)
    with engine.begin() as conn:
        run(conn, migration.upgrade)
    with engine.begin() as conn:
        run(conn, migration.downgrade)

    with engine.connect() as conn:
        assert "reading_scores" not in table_names(conn)
        assert set(TS03_TABLES) <= table_names(conn)
        assert reading_rows(conn) == before


def test_ac5_upgrade_again_rebuilds_scores(engine, migration):
    """AC5: after a downgrade, upgrading again rebuilds one score per reading."""
    ids = insert_readings(engine, READINGS)
    for function in (migration.upgrade, migration.downgrade, migration.upgrade):
        with engine.begin() as conn:
            run(conn, function)
    with engine.connect() as conn:
        scores = stored_scores(conn)
        assert sorted(scores) == ids
        assert conn.execute(sa.select(sa.func.count()).select_from(READING_SCORES)).scalar() == len(ids)
