"""Tests for the record-a-reading function (TS-08).

Covers FR-007, FR-008 and AC7 of specs/008-vital-signs-simulator/spec.md and
contracts/commands.md §3: record_reading validates the vital signs, adds one row
and flushes it without committing; invalid values are rejected and nothing is
added; and it is the only code in backend/app that constructs VitalSign rows or
bulk-inserts them.
Uses an in-memory SQLite database and synthetic data only; no real database and
no network.
"""

from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.models import Base, Patient, VitalSign
from app.readings import record_reading
from app.scoring import PARAMETERS, InvalidVitalSigns, VitalSigns

APP_DIR = Path(__file__).resolve().parent.parent / "app"


@pytest.fixture
def engine():
    """An in-memory SQLite engine with all the tables."""
    eng = create_engine("sqlite://")
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


def _add_patient(session) -> int:
    """Add and commit one synthetic patient; return its id."""
    patient = Patient(
        identifier="TST-001", name="Synthetic Test Patient", age=40, sex="other",
        triage_level=4, status="active",
    )
    session.add(patient)
    session.commit()
    return patient.id


def _count_readings(session) -> int:
    return session.scalar(select(func.count()).select_from(VitalSign))


def test_record_valid_reading(engine):
    """AC7, FR-007: a valid reading is saved for the patient and returned with an id; the function does not commit."""
    vitals = VitalSigns(16, 97, False, 120, 72, "A", Decimal("36.8"))
    with Session(engine) as session:
        patient_id = _add_patient(session)

        row = record_reading(session, patient_id, vitals)

        assert isinstance(row, VitalSign)
        assert row.id is not None
        assert row.patient_id == patient_id
        for name in PARAMETERS:
            assert getattr(row, name) == getattr(vitals, name), name
        assert _count_readings(session) == 1

        # No commit inside record_reading: a rollback removes the row.
        session.rollback()
        assert _count_readings(session) == 0

    with Session(engine) as session:
        assert _count_readings(session) == 0


def test_record_invalid_reading_saves_nothing(engine):
    """AC7, FR-007: invalid values raise InvalidVitalSigns before anything is added; nothing is saved."""
    vitals = VitalSigns(16, 101, False, 120, 72, "X", Decimal("36.8"))
    with Session(engine) as session:
        patient_id = _add_patient(session)

        with pytest.raises(InvalidVitalSigns) as info:
            record_reading(session, patient_id, vitals)

        problems = [(p.parameter, p.reason) for p in info.value.problems]
        assert problems == [("spo2", "out_of_range"), ("consciousness", "not_allowed")]
        assert len(session.new) == 0
        session.commit()
        assert _count_readings(session) == 0


def test_single_writer():
    """FR-008, AC7 (analyze C1, T010 finding 4): only app/readings.py writes VitalSign rows in backend/app.

    Flags, outside app/readings.py, any line that constructs a row (``VitalSign(``,
    except the ``class VitalSign(`` definition) or does a bulk insert that would
    bypass validation (``insert(VitalSign`` or ``VitalSign.__table__``).
    """
    matches = []
    bulk = []
    for path in sorted(APP_DIR.rglob("*.py")):
        name = path.relative_to(APP_DIR).as_posix()
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if "insert(VitalSign" in line or "VitalSign.__table__" in line:
                bulk.append((name, number))
            if "VitalSign(" not in line:
                continue
            if line.lstrip().startswith("class VitalSign("):
                continue
            matches.append((name, number))

    offending = sorted({name for name, _ in matches if name != "readings.py"})
    assert offending == [], f"VitalSign( constructed outside app/readings.py: {offending}"
    offending_bulk = sorted({name for name, _ in bulk if name != "readings.py"})
    assert offending_bulk == [], (
        f"bulk VitalSign insert outside app/readings.py: {offending_bulk}"
    )
    assert any(name == "readings.py" for name, _ in matches)
