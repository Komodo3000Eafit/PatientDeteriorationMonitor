"""Tests for the demo-patient command (TS-08).

Covers FR-001, FR-002, FR-013, FR-017, AC1, AC11 and SC-005 of
specs/008-vital-signs-simulator/spec.md and contracts/commands.md §1: the command
creates the six synthetic demo patients PAT-001 to PAT-006 with one initial
triage event each, leaves existing ones unchanged on a re-run, and --reset
(confirmed) touches only those six exact identifiers; an unconfirmed reset
changes nothing and never opens the database. Uses an in-memory SQLite database
and synthetic data only; no real database and no network.
"""

import re
import sqlite3
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

import app.demo_patients as demo
from app.models import Alert, Base, Patient, TriageEvent, VitalSign
from app.simulator import SCENARIOS


@pytest.fixture
def engine():
    """An in-memory SQLite engine with all the tables."""
    eng = create_engine("sqlite://")
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def use_engine(engine, monkeypatch):
    """Point the command at the SQLite engine."""
    monkeypatch.setattr(demo, "database_url", lambda: "sqlite://")
    monkeypatch.setattr(demo, "get_engine", lambda: engine)
    return engine


def _count(session, model, patient_id=None) -> int:
    query = select(func.count()).select_from(model)
    if patient_id is not None:
        query = query.where(model.patient_id == patient_id)
    return session.scalar(query)


def _patient(session, identifier) -> Patient:
    return session.scalars(select(Patient).where(Patient.identifier == identifier)).one()


def _reading(patient_id) -> VitalSign:
    """A synthetic valid reading row (test data only)."""
    return VitalSign(
        patient_id=patient_id, respiratory_rate=18, spo2=95, on_oxygen=False,
        systolic_bp=118, heart_rate=88, consciousness="A", temperature=Decimal("37.2"),
    )


def _event(patient_id, source="manual") -> TriageEvent:
    return TriageEvent(
        patient_id=patient_id, previous_level=4, new_level=2, score=6,
        reason="Synthetic test change", source=source, created_by_id=None,
    )


def _alert(patient_id) -> Alert:
    return Alert(patient_id=patient_id, severity="high", message="Synthetic test alert")


def _lines(text):
    return [line for line in text.splitlines() if line]


def _expected_lines(action):
    return [
        f"{action}: {identifier} ({scenario}, triage {level})"
        for identifier, _name, _age, _sex, scenario, level in demo.DEMO_PATIENTS
    ]


def _check_demo_patients(session):
    """The six demo patients have exactly their DEMO_PATIENTS values and are active."""
    patients = session.scalars(
        select(Patient).where(Patient.identifier.in_(demo.DEMO_IDENTIFIERS)).order_by(Patient.identifier)
    ).all()
    assert len(patients) == 6
    for patient, row in zip(patients, demo.DEMO_PATIENTS):
        identifier, name, age, sex, _scenario, level = row
        assert re.fullmatch(r"PAT-\d{3}", patient.identifier)
        assert (patient.identifier, patient.name, patient.age, patient.sex, patient.triage_level) == (
            identifier, name, age, sex, level,
        )
        assert patient.status == "active"
    return patients


def _check_initial_event(event, level):
    assert event.source == "initial"
    assert event.previous_level is None
    assert event.new_level == level
    assert event.score is None
    assert event.reason == demo.INITIAL_REASON
    assert event.created_by_id is None


def test_first_run_creates_six(use_engine, capsys):
    """AC1, FR-001, FR-002: the first run creates PAT-001 to PAT-006, each with one initial triage event, and lists them."""
    code = demo.main([])

    out, err = capsys.readouterr()
    assert code == 0
    assert err == ""
    assert _lines(out) == _expected_lines("created")

    with Session(use_engine) as session:
        patients = _check_demo_patients(session)
        assert _count(session, Patient) == 6
        events = session.scalars(select(TriageEvent)).all()
        assert len(events) == 6
        level_by_id = {p.id: p.triage_level for p in patients}
        assert sorted(e.patient_id for e in events) == sorted(level_by_id)
        for event in events:
            _check_initial_event(event, level_by_id[event.patient_id])
    # Synthetic names are never printed.
    for row in demo.DEMO_PATIENTS:
        assert row[1] not in out


def test_rerun_leaves_existing_unchanged(use_engine, capsys):
    """AC1, FR-002, SC-005: a re-run reports the six as existing and changes nothing, with no duplicates."""
    assert demo.main([]) == 0
    capsys.readouterr()
    with Session(use_engine) as session:
        pat3 = _patient(session, "PAT-003")
        pat3.triage_level = 1
        pat3.status = "discharged"
        session.add(_reading(pat3.id))
        session.commit()

    code = demo.main([])

    out, _ = capsys.readouterr()
    assert code == 0
    assert _lines(out) == [f"exists: {identifier}" for identifier in demo.DEMO_IDENTIFIERS]
    with Session(use_engine) as session:
        pat3 = _patient(session, "PAT-003")
        assert pat3.triage_level == 1
        assert pat3.status == "discharged"
        assert _count(session, Patient) == 6
        assert _count(session, TriageEvent) == 6
        assert _count(session, VitalSign) == 1


def _snapshot(session, patient_id):
    """Every column of a patient's rows, to prove they did not change."""
    patient = session.get(Patient, patient_id)
    readings = [
        (r.id, r.respiratory_rate, r.spo2, r.on_oxygen, r.systolic_bp, r.heart_rate, r.consciousness, r.temperature)
        for r in session.scalars(select(VitalSign).where(VitalSign.patient_id == patient_id).order_by(VitalSign.id))
    ]
    events = [
        (e.id, e.previous_level, e.new_level, e.score, e.reason, e.source)
        for e in session.scalars(select(TriageEvent).where(TriageEvent.patient_id == patient_id).order_by(TriageEvent.id))
    ]
    alerts = [
        (a.id, a.severity, a.message, a.status)
        for a in session.scalars(select(Alert).where(Alert.patient_id == patient_id).order_by(Alert.id))
    ]
    return (patient.identifier, patient.name, patient.triage_level, patient.status), readings, events, alerts


def test_reset_only_the_six(use_engine, capsys):
    """AC11, FR-013, SC-005: a confirmed reset clears only PAT-001 to PAT-006 (exact identifiers, not the PAT- prefix)."""
    with Session(use_engine) as session:
        demo.ensure_demo_patients(session)
        others = []
        for identifier in ("PAT-100", "XYZ-1"):
            other = Patient(
                identifier=identifier, name="Synthetic Other Patient", age=30, sex="other",
                triage_level=2, status="active",
            )
            session.add(other)
            session.flush()
            others.append(other.id)
        session.flush()
        all_ids = [p.id for p in session.scalars(select(Patient))]
        for patient_id in all_ids:
            session.add(_reading(patient_id))
            session.add(_event(patient_id))
            session.add(_alert(patient_id))
        pat5 = _patient(session, "PAT-005")
        session.add_all([_reading(pat5.id), _reading(pat5.id), _alert(pat5.id), _event(pat5.id, "automatic")])
        pat5.triage_level = 1
        pat5.status = "discharged"
        session.commit()
        before = {pid: _snapshot(session, pid) for pid in others}

    code = demo.main(["--reset", "--yes"])

    out, err = capsys.readouterr()
    assert code == 0
    assert err == ""
    assert _lines(out) == _expected_lines("reset")
    with Session(use_engine) as session:
        patients = _check_demo_patients(session)
        for patient in patients:
            assert _count(session, VitalSign, patient.id) == 0
            assert _count(session, Alert, patient.id) == 0
            events = session.scalars(select(TriageEvent).where(TriageEvent.patient_id == patient.id)).all()
            assert len(events) == 1
            _check_initial_event(events[0], patient.triage_level)
        for pid in others:
            assert _snapshot(session, pid) == before[pid]
            assert _count(session, VitalSign, pid) == 1
            assert _count(session, TriageEvent, pid) == 1
            assert _count(session, Alert, pid) == 1
        assert _count(session, Patient) == 8


def test_reset_creates_missing(use_engine, capsys):
    """AC11, SC-005: a reset on an empty database creates the six demo patients."""
    code = demo.main(["--reset", "--yes"])

    out, _ = capsys.readouterr()
    assert code == 0
    assert _lines(out) == _expected_lines("created")
    with Session(use_engine) as session:
        _check_demo_patients(session)
        assert _count(session, TriageEvent) == 6


def _raise_eof(prompt):
    raise EOFError


@pytest.mark.parametrize(
    ("input_fn", "is_interactive"),
    [
        (lambda prompt: "no", lambda: True),
        (_raise_eof, lambda: True),
        (lambda prompt: "yes", lambda: False),
    ],
    ids=["answer-no", "eof", "not-interactive"],
)
def test_reset_not_confirmed(input_fn, is_interactive, monkeypatch, capsys):
    """AC11, FR-013: without confirmation the reset returns 1 and never touches the database."""

    def no_engine():
        raise AssertionError("the database must not be touched")

    monkeypatch.setattr(demo, "database_url", lambda: "sqlite://")
    monkeypatch.setattr(demo, "get_engine", no_engine)

    code = demo.main(["--reset"], input_fn=input_fn, is_interactive=is_interactive)

    out, err = capsys.readouterr()
    assert code == 1
    assert "Reset cancelled: nothing was changed" in err
    assert out == ""


def test_reset_confirmed_interactively(use_engine, capsys):
    """AC11, FR-013: answering " yes " at the prompt proceeds with the reset."""
    prompts = []

    def answer_yes(prompt):
        prompts.append(prompt)
        return " yes \n"

    code = demo.main(["--reset"], input_fn=answer_yes, is_interactive=lambda: True)

    out, _ = capsys.readouterr()
    assert code == 0
    assert len(prompts) == 1 and "yes" in prompts[0]
    assert _lines(out) == _expected_lines("created")


def test_errors(monkeypatch, capsys):
    """AC9, FR-017: no DATABASE_URL or an unreachable database returns 1 with a clear error and no connection details."""
    code = demo.main([])
    out, err = capsys.readouterr()
    assert code == 1
    assert "DATABASE_URL is not set" in err
    assert out == ""

    def refuse_connection():
        raise sqlite3.OperationalError("synthetic failure at no/such/dir")

    failing = create_engine("sqlite://", creator=refuse_connection)
    monkeypatch.setattr(demo, "database_url", lambda: "sqlite://")
    monkeypatch.setattr(demo, "get_engine", lambda: failing)

    code = demo.main([])

    out, err = capsys.readouterr()
    failing.dispose()
    assert code == 1
    assert "Could not update the demo patients (" in err
    for text in (out, err):
        assert "no/such/dir" not in text
        assert "sqlite://" not in text


def test_errors_non_database_exception(monkeypatch, capsys):
    """AC9, FR-017 (T010 finding 2): a non-SQLAlchemy error (e.g. a malformed DATABASE_URL) returns 1 without echoing the URL."""

    def bad_engine():
        raise ValueError(
            "invalid port in postgresql://synthetic-user:synthetic-pass@no/such/dir"
        )

    monkeypatch.setattr(demo, "database_url", lambda: "postgresql://synthetic")
    monkeypatch.setattr(demo, "get_engine", bad_engine)

    code = demo.main([])

    out, err = capsys.readouterr()
    assert code == 1
    assert "Could not update the demo patients (ValueError)" in err
    assert out == ""
    for text in (out, err):
        assert "synthetic-pass" not in text
        assert "no/such/dir" not in text
        assert "postgresql://" not in text


def test_scenarios_known():
    """FR-001, FR-002: every demo scenario exists in the simulator, and the initial triage levels are 3 to 5."""
    assert len(demo.DEMO_PATIENTS) == 6
    assert demo.DEMO_IDENTIFIERS == tuple(f"PAT-00{n}" for n in range(1, 7))
    for _identifier, _name, _age, _sex, scenario, level in demo.DEMO_PATIENTS:
        assert scenario in SCENARIOS
        assert 3 <= level <= 5
