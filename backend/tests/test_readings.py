"""Tests for the record-a-reading function (TS-08).

Covers FR-007, FR-008 and AC7 of specs/008-vital-signs-simulator/spec.md and
contracts/commands.md §3: record_reading validates the vital signs, adds one row
and flushes it without committing; invalid values are rejected and nothing is
added; and it is the only code in backend/app that constructs VitalSign rows or
bulk-inserts them.
US-03 (specs/017-vital-signs-scoring/spec.md AC1, AC2, AC3, FR-001, FR-002):
record_reading also stores exactly one ReadingScore per reading, equal to the
scoring module's result, in the same transaction (all or nothing).
Uses an in-memory SQLite database and synthetic data only; no real database and
no network.
"""

from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session

import app.readings
from app.models import Alert, Base, Patient, ReadingScore, VitalSign
from app.readings import record_reading, score_values
from app.scoring import PARAMETERS, InvalidVitalSigns, VitalSigns, get_scoring_system

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


def _count_scores(session) -> int:
    return session.scalar(select(func.count()).select_from(ReadingScore))


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


@pytest.mark.parametrize("model", ["VitalSign", "ReadingScore"])
def test_single_writer(model):
    """FR-008, AC7 (analyze C1, T010 finding 4); US-03 FR-002: only app/readings.py writes VitalSign and ReadingScore rows in backend/app.

    Flags, outside app/readings.py, any line that constructs a row (``VitalSign(``
    or ``ReadingScore(``, except their ``class`` definitions) or does a bulk insert
    that would bypass validation (``insert(<Model>`` or ``<Model>.__table__``).
    """
    matches = []
    bulk = []
    for path in sorted(APP_DIR.rglob("*.py")):
        name = path.relative_to(APP_DIR).as_posix()
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if f"insert({model}" in line or f"{model}.__table__" in line:
                bulk.append((name, number))
            if f"{model}(" not in line:
                continue
            if line.lstrip().startswith(f"class {model}("):
                continue
            matches.append((name, number))

    offending = sorted({name for name, _ in matches if name != "readings.py"})
    assert offending == [], f"{model}( constructed outside app/readings.py: {offending}"
    offending_bulk = sorted({name for name, _ in bulk if name != "readings.py"})
    assert offending_bulk == [], (
        f"bulk {model} insert outside app/readings.py: {offending_bulk}"
    )
    assert any(name == "readings.py" for name, _ in matches)


# --- US-03: the stored score (AC1, AC2, AC3) -----------------------------------

ENTRY_KEYS = {"parameter", "value", "points", "low", "high", "category"}


def _vitals(**changes) -> VitalSigns:
    """A synthetic valid reading (every parameter scores 0), with optional changes."""
    values = dict(
        respiratory_rate=16, spo2=97, on_oxygen=False, systolic_bp=120,
        heart_rate=72, consciousness="A", temperature=Decimal("36.8"),
    )
    values.update(changes)
    return VitalSigns(**values)


def _save(engine, vitals):
    """Save one reading through record_reading and commit; return (reading, score)."""
    with Session(engine, expire_on_commit=False) as session:
        patient_id = _add_patient(session)
        row = record_reading(session, patient_id, vitals)
        session.commit()
        scores = session.scalars(select(ReadingScore)).all()
        assert len(scores) == 1
        return row, scores[0]


def _entry(score, parameter):
    return next(e for e in score.entries if e["parameter"] == parameter)


def test_us03_ac1_ac2_valid_reading_has_one_stored_score(engine):
    """US-03 AC1, AC2, FR-001: exactly one ReadingScore for the reading, equal to the scoring module."""
    vitals = _vitals()
    row, score = _save(engine, vitals)

    assert score.vital_sign_id == row.id
    assert score.system == "NEWS2"
    expected = score_values(get_scoring_system().score(vitals))
    assert score.total == expected["total"]
    assert score.band == expected["band"]
    assert score.entries == expected["entries"]
    assert [e["parameter"] for e in score.entries] == list(PARAMETERS)
    for entry in score.entries:
        assert set(entry) == ENTRY_KEYS, entry
    temperature = _entry(score, "temperature")
    assert temperature["value"] == "36.8"
    assert (temperature["low"], temperature["high"]) == ("36.1", "38.0")
    assert _entry(score, "on_oxygen")["category"] == [False]
    assert _entry(score, "consciousness")["category"] == ["A"]
    assert _entry(score, "respiratory_rate")["category"] == []


def test_us03_ac2_contract_example(engine):
    """US-03 AC2, contracts/readings-api.md: the contract example stores total 5, band medium and its seven entries."""
    vitals = _vitals(respiratory_rate=22, spo2=95, systolic_bp=118, heart_rate=96,
                     temperature=Decimal("38.4"))
    _row, score = _save(engine, vitals)
    assert (score.system, score.total, score.band) == ("NEWS2", 5, "medium")
    assert score.entries == [
        {"parameter": "respiratory_rate", "value": 22, "points": 2, "low": 21, "high": 24, "category": []},
        {"parameter": "spo2", "value": 95, "points": 1, "low": 94, "high": 95, "category": []},
        {"parameter": "on_oxygen", "value": False, "points": 0, "low": None, "high": None, "category": [False]},
        {"parameter": "systolic_bp", "value": 118, "points": 0, "low": 111, "high": 219, "category": []},
        {"parameter": "heart_rate", "value": 96, "points": 1, "low": 91, "high": 110, "category": []},
        {"parameter": "consciousness", "value": "A", "points": 0, "low": None, "high": None, "category": ["A"]},
        {"parameter": "temperature", "value": "38.4", "points": 1, "low": "38.1", "high": "39.0", "category": []},
    ]


BOUNDARIES = [
    # (changes, parameter, expected points, low, high)
    pytest.param({"respiratory_rate": 20}, "respiratory_rate", 0, 12, 20, id="rr-20"),
    pytest.param({"respiratory_rate": 21}, "respiratory_rate", 2, 21, 24, id="rr-21"),
    pytest.param({"temperature": Decimal("38.0")}, "temperature", 0, "36.1", "38.0", id="temp-38.0"),
    pytest.param({"temperature": Decimal("38.1")}, "temperature", 1, "38.1", "39.0", id="temp-38.1"),
    pytest.param({"systolic_bp": 219}, "systolic_bp", 0, 111, 219, id="sbp-219"),
    pytest.param({"systolic_bp": 220}, "systolic_bp", 3, 220, None, id="sbp-220-open-high"),
    pytest.param({"respiratory_rate": 8}, "respiratory_rate", 3, None, 8, id="rr-8-open-low"),
    pytest.param({"heart_rate": 131}, "heart_rate", 3, 131, None, id="hr-131-open-high"),
]


@pytest.mark.parametrize("changes, parameter, points, low, high", BOUNDARIES)
def test_us03_ac2_boundaries_and_open_ends(engine, changes, parameter, points, low, high):
    """US-03 AC2, edge cases (boundary values, open ends): stored entries equal the scoring module, including the matched range."""
    vitals = _vitals(**changes)
    _row, score = _save(engine, vitals)
    expected = score_values(get_scoring_system().score(vitals))
    assert (score.total, score.band, score.entries) == (
        expected["total"], expected["band"], expected["entries"],
    )
    entry = _entry(score, parameter)
    assert (entry["points"], entry["low"], entry["high"]) == (points, low, high)
    if parameter == "temperature":
        assert entry["value"] == str(changes["temperature"])


def test_us03_ac3_invalid_values_store_nothing(engine):
    """US-03 AC3: invalid values raise InvalidVitalSigns; no reading and no score are stored."""
    with Session(engine) as session:
        patient_id = _add_patient(session)
        with pytest.raises(InvalidVitalSigns):
            record_reading(session, patient_id, _vitals(temperature=Decimal("46.0")))
        assert len(session.new) == 0
        session.commit()
        assert (_count_readings(session), _count_scores(session)) == (0, 0)


def test_us03_ac3_score_insert_failure_rolls_back_both(engine):
    """US-03 AC3, FR-001: an error while inserting the score (second flush) followed by rollback leaves neither row."""

    def fail_insert(mapper, connection, target):
        raise RuntimeError("synthetic score insert failure")

    with Session(engine) as session:
        patient_id = _add_patient(session)
        event.listen(ReadingScore, "before_insert", fail_insert)
        try:
            with pytest.raises(RuntimeError):
                record_reading(session, patient_id, _vitals())
        finally:
            event.remove(ReadingScore, "before_insert", fail_insert)
        session.rollback()
        assert (_count_readings(session), _count_scores(session)) == (0, 0)

    with Session(engine) as session:
        assert (_count_readings(session), _count_scores(session)) == (0, 0)


def test_us03_ac3_scoring_failure_stores_nothing(engine, monkeypatch):
    """US-03 AC3: a failure while scoring adds nothing to the session; no reading and no score."""

    class BrokenScoring:
        def score(self, vitals):
            raise RuntimeError("synthetic scoring failure")

    monkeypatch.setattr(app.readings, "get_scoring_system", lambda: BrokenScoring())
    with Session(engine) as session:
        patient_id = _add_patient(session)
        with pytest.raises(RuntimeError):
            record_reading(session, patient_id, _vitals())
        assert len(session.new) == 0
        session.commit()
        assert (_count_readings(session), _count_scores(session)) == (0, 0)


def test_us03_ac1_rollback_removes_reading_and_score(engine):
    """US-03 AC1, FR-002: record_reading does not commit; a rollback removes both the reading and its score."""
    with Session(engine) as session:
        patient_id = _add_patient(session)
        record_reading(session, patient_id, _vitals())
        assert (_count_readings(session), _count_scores(session)) == (1, 1)
        session.rollback()
        assert (_count_readings(session), _count_scores(session)) == (0, 0)


# --- US-04: record_reading raises a re-triage suggestion on a crossing ----------
# specs/020-retriage-suggestion-alerts/spec.md AC1, AC3. The band is read from the
# stored score; the scoring result is referred to as "the score" only, so this
# addition does not break the Principle V confinement guard.

# A reading scoring "medium" (total 5: rr +2, spo2 +1, hr +1, temp +1).
MEDIUM_VITALS = VitalSigns(22, 95, False, 118, 96, "A", Decimal("38.4"))


def _count_open_alerts(session, patient_id) -> int:
    return session.scalar(
        select(func.count())
        .select_from(Alert)
        .where(Alert.patient_id == patient_id)
        .where(Alert.status == "open")
    )


def test_us04_ac1_crossing_up_creates_one_open_alert(engine):
    """US-04 AC1 (FR-001): a reading crossing up into medium for an active patient with a less-urgent previous reading creates one open alert."""
    with Session(engine) as session:
        patient_id = _add_patient(session)   # Triage IV, active
        record_reading(session, patient_id, _vitals())          # previous: low
        assert _count_open_alerts(session, patient_id) == 0
        record_reading(session, patient_id, MEDIUM_VITALS)      # crosses up
        assert _count_open_alerts(session, patient_id) == 1
        alert = session.scalars(select(Alert)).one()
        assert alert.severity == "medium"


def test_us04_ac3_first_reading_creates_no_alert(engine):
    """US-04 AC3 (FR-001): the first reading of a patient (no previous band) creates no alert."""
    with Session(engine) as session:
        patient_id = _add_patient(session)
        record_reading(session, patient_id, MEDIUM_VITALS)
        assert _count_open_alerts(session, patient_id) == 0


def test_us04_ac3_no_crossing_creates_no_alert(engine):
    """US-04 AC3 (FR-001): a reading at the same or a less urgent band than the previous one creates no alert."""
    with Session(engine) as session:
        patient_id = _add_patient(session)
        record_reading(session, patient_id, MEDIUM_VITALS)   # first: no previous
        record_reading(session, patient_id, _vitals())       # medium -> low: no crossing
        assert _count_open_alerts(session, patient_id) == 0


def test_us04_record_reading_still_returns_the_reading_and_does_not_commit(engine):
    """US-04 (FR-001): adding the suggestion keeps record_reading's contract: it returns the reading and does not commit."""
    with Session(engine) as session:
        patient_id = _add_patient(session)
        record_reading(session, patient_id, _vitals())        # previous low
        row = record_reading(session, patient_id, MEDIUM_VITALS)
        assert isinstance(row, VitalSign)
        assert row.id is not None
        assert _count_open_alerts(session, patient_id) == 1
        # Not committed: a rollback removes the reading, its score and the alert.
        session.rollback()
        assert (_count_readings(session), _count_scores(session)) == (0, 0)
        assert _count_open_alerts(session, patient_id) == 0
