"""Tests for the deterioration prediction API (US-08).

Covers AC1-AC4, AC6-AC8, FR-001-FR-004, FR-006-FR-008 and the edge cases of
specs/024-deterioration-prediction/spec.md.
Contract: specs/024-deterioration-prediction/contracts/prediction-api.md.

GET /api/patients/{identifier}/prediction is read-only: it returns whether a
deterioration is predicted (stored score totals of the 3 most recent readings
strictly increasing), the reason code, the readings used (oldest first, each
{total, recorded_at}) and the newest reading's risk band. It writes nothing.

Synthetic data only: fictitious patients (PAT-NNN), a synthetic nurse and doctor,
made-up vital signs and stored scores seeded directly (no ``record_reading``).
No real database and no network: every test uses an in-memory SQLite engine
(StaticPool so the TestClient's thread shares it), and the autouse
``isolate_database`` fixture (conftest.py) removes ``DATABASE_URL``. The fixture
pattern is copied (not imported) from test_retriage_api.py. The literal
scoring-system token is deliberately kept out of this file.
"""

import logging
import os
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

import app.auth
import app.main
import app.patients
from app.models import Alert, Base, Patient, ReadingScore, TriageEvent, User, VitalSign

NOT_FOUND = {"detail": "Patient not found"}
NOT_AUTHENTICATED = {"detail": "Not authenticated"}
SERVICE_UNAVAILABLE = {"detail": "Service unavailable"}

RESPONSE_KEYS = {"rising", "reason", "readings", "latest_band"}
READING_KEYS = {"total", "recorded_at"}
VITAL_FIELDS = (
    "respiratory_rate", "spo2", "on_oxygen", "systolic_bp", "heart_rate",
    "consciousness", "temperature",
)

# A distinctive synthetic patient name that must never appear in a response.
SECRET_NAME = "QQ-SECRET-PREDICTION-NAME-marker"

# Synthetic base time for seeded readings, 5 minutes apart.
T0 = datetime(2026, 11, 23, 10, 0, 0)

client = TestClient(app.main.app)


def url(code):
    return f"/api/patients/{code}/prediction"


# --- Fixtures (copied pattern from test_retriage_api.py) ------------------------


@pytest.fixture
def engine():
    """In-memory SQLite engine shared across threads (TestClient runs in another thread)."""
    assert os.environ.get("DATABASE_URL") is None  # isolate_database ran first
    eng = create_engine(
        "sqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def users(engine):
    """Save a synthetic nurse and a synthetic doctor; return them detached."""
    with Session(engine, expire_on_commit=False) as session:
        nurse = User(
            username="synthetic.nurse", password_hash="not-a-real-hash",
            full_name="Enf. Ficticia Prueba", role="nurse",
        )
        doctor = User(
            username="synthetic.doctor", password_hash="not-a-real-hash",
            full_name="Dr. Ficticio Prueba", role="doctor",
        )
        session.add_all([nurse, doctor])
        session.commit()
        return {"nurse": nurse, "doctor": doctor}


@pytest.fixture
def db(engine):
    """Override ``get_session`` with a session on the in-memory engine; add PAT-001 (active, Triage III) and PAT-003 (discharged)."""

    def override():
        session = Session(engine)
        try:
            yield session
        finally:
            session.close()

    app.main.app.dependency_overrides[app.patients.get_session] = override
    with Session(engine) as session:
        session.add(Patient(
            identifier="PAT-001", name=SECRET_NAME, age=50, sex="other",
            triage_level=3, status="active",
        ))
        session.add(Patient(
            identifier="PAT-003", name="Paciente Ficticio PAT-003", age=60, sex="other",
            triage_level=3, status="discharged",
        ))
        session.commit()
    return engine


def sign_in(user):
    app.main.app.dependency_overrides[app.auth.get_current_user] = lambda: user


@pytest.fixture
def as_nurse(db, users):
    sign_in(users["nurse"])
    return users["nurse"]


@pytest.fixture
def as_doctor(db, users):
    sign_in(users["doctor"])
    return users["doctor"]


# --- Seeding helpers --------------------------------------------------------------


def _patient_id(engine, code):
    with Session(engine) as session:
        return session.scalar(select(Patient.id).where(Patient.identifier == code))


def seed_reading(engine, code, recorded_at, total=None, band=None):
    """Add one synthetic reading (vital_signs row) with a chosen ``recorded_at``.

    When ``total`` is given, a ``reading_scores`` row with that total and ``band``
    is added for it; when ``total`` is None no score row is stored (a reading
    saved before scoring existed). Returns the reading id.
    """
    pid = _patient_id(engine, code)
    with Session(engine) as session:
        vital = VitalSign(
            patient_id=pid, recorded_at=recorded_at, respiratory_rate=25, spo2=91,
            on_oxygen=False, systolic_bp=118, heart_rate=131, consciousness="A",
            temperature=38.4,
        )
        session.add(vital)
        session.flush()
        if total is not None:
            session.add(ReadingScore(
                vital_sign_id=vital.id, system="synthetic-system", total=total,
                band=band or "low", entries=[],
            ))
        session.commit()
        return vital.id


def seed_sequence(engine, code, scored):
    """Seed readings 5 minutes apart from T0, oldest first; ``scored`` is a list of (total, band)."""
    times = []
    for index, (total, band) in enumerate(scored):
        when = T0 + timedelta(minutes=5 * index)
        seed_reading(engine, code, when, total, band)
        times.append(when)
    return times


def _naive(value):
    """Parse an ISO datetime from the response and drop any tz (SQLite stores naive values)."""
    return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)


def _totals(body):
    return [r["total"] for r in body["readings"]]


def _counts(engine):
    with Session(engine) as session:
        return {
            "alerts": session.scalar(select(func.count()).select_from(Alert)),
            "triage_events": session.scalar(select(func.count()).select_from(TriageEvent)),
            "vital_signs": session.scalar(select(func.count()).select_from(VitalSign)),
            "reading_scores": session.scalar(select(func.count()).select_from(ReadingScore)),
        }


def _triage_level(engine, code):
    with Session(engine) as session:
        return session.scalar(select(Patient.triage_level).where(Patient.identifier == code))


# --- AC7: who may read it ---------------------------------------------------------


def test_ac7_no_token_401(db, users):
    """AC7 (FR-007): signed out -> 401 with the existing auth message."""
    assert app.auth.get_current_user not in app.main.app.dependency_overrides
    response = client.get(url("PAT-001"))
    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED


def test_ac7_doctor_may_read_200(as_doctor, db):
    """AC7 (FR-007): a signed-in doctor gets 200."""
    seed_sequence(db, "PAT-001", [(2, "low"), (4, "low-medium"), (6, "medium")])
    response = client.get(url("PAT-001"))
    assert response.status_code == 200
    assert response.json()["rising"] is True


def test_ac7_nurse_may_read_200(as_nurse, db):
    """AC7 (FR-007): a signed-in nurse gets 200 (any clinician role)."""
    seed_sequence(db, "PAT-001", [(2, "low"), (4, "low-medium"), (6, "medium")])
    response = client.get(url("PAT-001"))
    assert response.status_code == 200
    assert response.json()["rising"] is True


# --- AC8: unknown or malformed patient code ---------------------------------------


def test_ac8_unknown_code_404(as_doctor, db):
    """AC8 (FR-007): an unknown patient code -> 404 "Patient not found"."""
    response = client.get(url("PAT-999"))
    assert response.status_code == 404
    assert response.json() == NOT_FOUND


@pytest.mark.parametrize("code", ["abc", "pat-001", "PAT_001", "A" * 21],
                         ids=["abc", "lower", "underscore", "too-long"])
def test_ac8_malformed_code_404(as_doctor, db, code):
    """AC8 (FR-007): a code not in the patient code format -> 404 fixed message, never echoed."""
    response = client.get(url(code))
    assert response.status_code == 404
    assert response.json() == NOT_FOUND


# --- AC1: rising score gives a deterioration prediction ---------------------------


def test_ac1_rising_2_4_6_predicts_with_readings_oldest_first(as_doctor, db):
    """AC1 (FR-002, FR-006): scores 2 -> 4 -> 6 -> rising, reason null, readings
    oldest first as {total, recorded_at}, latest_band = newest stored band."""
    times = seed_sequence(db, "PAT-001", [(2, "low"), (4, "low-medium"), (6, "medium")])
    response = client.get(url("PAT-001"))
    assert response.status_code == 200
    body = response.json()
    assert body["rising"] is True
    assert body["reason"] is None
    assert _totals(body) == [2, 4, 6]
    assert [_naive(r["recorded_at"]) for r in body["readings"]] == times
    assert body["latest_band"] == "medium"


def test_ac1_rising_with_newest_band_high_still_rising(as_doctor, db):
    """AC1, Clarifications 2026-11-23 (FR-002): the rule ignores the band; newest band high still rising."""
    seed_sequence(db, "PAT-001", [(3, "low-medium"), (5, "medium"), (8, "high")])
    body = client.get(url("PAT-001")).json()
    assert body["rising"] is True
    assert body["reason"] is None
    assert body["latest_band"] == "high"


# --- AC2: not rising gives no prediction ------------------------------------------


@pytest.mark.parametrize(
    "scored, newest_band",
    [
        ([(3, "low-medium"), (3, "low-medium"), (3, "low-medium")], "low-medium"),
        ([(6, "medium"), (4, "low-medium"), (2, "low")], "low"),
        ([(5, "medium"), (4, "low-medium"), (6, "medium")], "medium"),
        ([(2, "low"), (2, "low"), (5, "medium")], "medium"),
    ],
    ids=["flat", "falling", "mixed", "equal-step"],
)
def test_ac2_not_rising_returns_scores_and_band(as_doctor, db, scored, newest_band):
    """AC2 (FR-002): flat, falling, mixed or equal-step -> rising false, reason not_rising,
    still returns the three scores and the newest band."""
    seed_sequence(db, "PAT-001", scored)
    response = client.get(url("PAT-001"))
    assert response.status_code == 200
    body = response.json()
    assert body["rising"] is False
    assert body["reason"] == "not_rising"
    assert _totals(body) == [total for total, _ in scored]
    assert body["latest_band"] == newest_band


# --- AC3: fewer than 3 readings ---------------------------------------------------


def test_ac3_zero_readings_not_enough(as_doctor, db):
    """AC3 (FR-004, FR-006): no readings -> 200 not_enough_readings, readings [] and latest_band null."""
    response = client.get(url("PAT-001"))
    assert response.status_code == 200
    assert response.json() == {
        "rising": False, "reason": "not_enough_readings", "readings": [], "latest_band": None,
    }


def test_ac3_one_reading_not_enough(as_doctor, db):
    """AC3 (FR-004): one reading -> not_enough_readings with only that score."""
    seed_sequence(db, "PAT-001", [(4, "low-medium")])
    body = client.get(url("PAT-001")).json()
    assert body["rising"] is False
    assert body["reason"] == "not_enough_readings"
    assert _totals(body) == [4]
    assert body["latest_band"] == "low-medium"


def test_ac3_two_readings_not_enough(as_doctor, db):
    """AC3 (FR-004): two rising readings -> still not_enough_readings, returns the 2 scores oldest first."""
    seed_sequence(db, "PAT-001", [(2, "low"), (4, "low-medium")])
    response = client.get(url("PAT-001"))
    assert response.status_code == 200
    body = response.json()
    assert body["rising"] is False
    assert body["reason"] == "not_enough_readings"
    assert _totals(body) == [2, 4]
    assert body["latest_band"] == "low-medium"


# --- AC4: only the 3 most recent readings count -----------------------------------


def test_ac4_five_readings_only_three_most_recent_count(as_doctor, db):
    """AC4 (FR-003): with 5 readings, only the 3 newest count (older falling scores ignored)."""
    times = seed_sequence(db, "PAT-001", [
        (9, "high"), (8, "high"), (2, "low"), (4, "low-medium"), (6, "medium"),
    ])
    body = client.get(url("PAT-001")).json()
    assert body["rising"] is True
    assert _totals(body) == [2, 4, 6]
    assert [_naive(r["recorded_at"]) for r in body["readings"]] == times[2:]
    assert body["latest_band"] == "medium"


def test_ac4_older_rising_readings_do_not_predict(as_doctor, db):
    """AC4 (FR-003): older rising scores never change the answer when the 3 newest are flat."""
    seed_sequence(db, "PAT-001", [
        (1, "low"), (2, "low"), (3, "low-medium"), (3, "low-medium"), (3, "low-medium"),
    ])
    body = client.get(url("PAT-001")).json()
    assert body["rising"] is False
    assert body["reason"] == "not_rising"
    assert _totals(body) == [3, 3, 3]


def test_ac4_order_by_recorded_at_not_insert_order(as_doctor, db):
    """AC4 (FR-003): readings are ordered by recorded_at, not by insertion order."""
    # Inserted newest-first: ids grow while recorded_at goes back in time.
    seed_reading(db, "PAT-001", T0 + timedelta(minutes=10), 6, "medium")
    seed_reading(db, "PAT-001", T0 + timedelta(minutes=5), 4, "low-medium")
    seed_reading(db, "PAT-001", T0, 2, "low")
    body = client.get(url("PAT-001")).json()
    assert _totals(body) == [2, 4, 6]
    assert body["rising"] is True
    assert body["latest_band"] == "medium"


def test_ac4_equal_recorded_at_tie_broken_by_id_desc(as_doctor, db):
    """AC4 (FR-003): two readings with the same recorded_at are ordered by reading id, newest (higher id) last in the answer."""
    same = T0 + timedelta(minutes=5)
    seed_reading(db, "PAT-001", T0, 2, "low")
    seed_reading(db, "PAT-001", same, 6, "medium")          # lower id
    seed_reading(db, "PAT-001", same, 4, "low-medium")      # higher id -> newest
    body = client.get(url("PAT-001")).json()
    # Correct order (recorded_at desc, id desc) gives oldest first [2, 6, 4] -> not rising.
    # Ordering by id asc on the tie would wrongly give [2, 4, 6] -> rising.
    assert _totals(body) == [2, 6, 4]
    assert body["rising"] is False
    assert body["reason"] == "not_rising"
    assert body["latest_band"] == "low-medium"


# --- Edge case: a reading with no stored score ------------------------------------


def test_edge_missing_score_middle_reading(as_doctor, db):
    """Edge case (FR-004): a reading with no reading_scores row among the 3 newest ->
    missing_score, its total is null, never an error."""
    seed_sequence(db, "PAT-001", [(2, "low"), (None, None), (5, "low-medium")])
    response = client.get(url("PAT-001"))
    assert response.status_code == 200
    body = response.json()
    assert body["rising"] is False
    assert body["reason"] == "missing_score"
    assert _totals(body) == [2, None, 5]
    assert body["latest_band"] == "low-medium"


def test_edge_missing_score_newest_reading_band_null(as_doctor, db):
    """Edge case (contract): the newest reading has no score -> missing_score and latest_band null."""
    seed_sequence(db, "PAT-001", [(2, "low"), (4, "low-medium"), (None, None)])
    body = client.get(url("PAT-001")).json()
    assert body["reason"] == "missing_score"
    assert _totals(body) == [2, 4, None]
    assert body["latest_band"] is None


def test_edge_missing_score_reading_stays_in_window(as_doctor, db):
    """Edge case (research R3, FR-003): an unscored reading still counts by order, so an
    older scored reading never replaces it (outer join, not inner join)."""
    seed_sequence(db, "PAT-001", [(1, "low"), (2, "low"), (None, None), (4, "low-medium")])
    body = client.get(url("PAT-001")).json()
    assert body["reason"] == "missing_score"
    assert _totals(body) == [2, None, 4]


# --- FR-001 / Clarifications: discharged patient ----------------------------------


def test_fr001_discharged_patient_same_answer(as_doctor, db):
    """FR-001, Clarifications 2026-11-23: a discharged patient gets the same answer as an active one."""
    scored = [(2, "low"), (4, "low-medium"), (6, "medium")]
    seed_sequence(db, "PAT-001", scored)
    seed_sequence(db, "PAT-003", scored)
    active = client.get(url("PAT-001"))
    discharged = client.get(url("PAT-003"))
    assert discharged.status_code == 200
    assert discharged.json() == active.json()
    assert discharged.json()["rising"] is True


# --- FR-006: response shape, no internal ids or vital values ----------------------


def test_fr006_exact_keys_no_ids_or_vitals(as_doctor, db):
    """FR-006: response keys exactly {rising, reason, readings, latest_band}; each reading
    exactly {total, recorded_at}; no id, patient_id, vital-sign field or patient identity."""
    seed_sequence(db, "PAT-001", [(2, "low"), (4, "low-medium"), (6, "medium")])
    response = client.get(url("PAT-001"))
    body = response.json()
    assert set(body) == RESPONSE_KEYS
    for reading in body["readings"]:
        assert set(reading) == READING_KEYS
    text = response.text
    for forbidden in ("\"id\"", "patient_id", "vital_sign_id", "entries", "system", *VITAL_FIELDS):
        assert forbidden not in text, forbidden
    assert SECRET_NAME not in text


def test_fr006_exact_keys_with_no_readings(as_doctor, db):
    """FR-006: the shape is the same with no readings."""
    body = client.get(url("PAT-001")).json()
    assert set(body) == RESPONSE_KEYS


# --- AC6 / FR-008: read-only, triage level unchanged ------------------------------


class StatementRecorder:
    """Records SQL statements sent through an engine."""

    def __init__(self, engine):
        self.engine = engine
        self.statements = []

    def __enter__(self):
        event.listen(self.engine, "before_cursor_execute", self._record)
        return self

    def __exit__(self, *exc):
        event.remove(self.engine, "before_cursor_execute", self._record)

    def _record(self, conn, cursor, statement, parameters, context, executemany):
        self.statements.append(statement)


def test_ac6_repeated_reads_write_nothing_and_keep_triage_level(as_doctor, db):
    """AC6 (FR-001, FR-008): several reads of a rising prediction leave the counts of
    alerts, triage_events, vital_signs and reading_scores and the triage level unchanged;
    no INSERT, UPDATE or DELETE is sent; no re-triage suggestion appears in US-04's view."""
    seed_sequence(db, "PAT-001", [(2, "low"), (4, "low-medium"), (6, "medium")])
    before = _counts(db)
    level_before = _triage_level(db, "PAT-001")

    with StatementRecorder(db) as recorder:
        for _ in range(3):
            response = client.get(url("PAT-001"))
            assert response.status_code == 200
            assert response.json()["rising"] is True

    assert _counts(db) == before
    assert _triage_level(db, "PAT-001") == level_before == 3
    writes = [
        s for s in recorder.statements
        if s.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))
    ]
    assert writes == []
    # No false re-triage suggestion caused by the prediction (US-04 lists every alert row).
    suggestions = client.get("/api/patients/PAT-001/suggestions")
    assert suggestions.status_code == 200
    assert suggestions.json() == {"suggestions": []}


# --- AC8: database failure -> 503, logged by error type only ----------------------


DB_SECRET = "SECRET-DB-DETAIL-host.example.invalid"


class BrokenSession(Session):
    """A session whose every query raises a synthetic SQLAlchemyError carrying a secret detail."""

    def execute(self, *args, **kwargs):
        raise SQLAlchemyError(DB_SECRET)

    def scalars(self, *args, **kwargs):
        raise SQLAlchemyError(DB_SECRET)

    def scalar(self, *args, **kwargs):
        raise SQLAlchemyError(DB_SECRET)


def test_ac8_database_error_503_logged_by_type_only(as_doctor, db, caplog):
    """AC8 (FR-007): a forced SQLAlchemyError -> 503 "Service unavailable"; the log line
    holds only the error type name, never the error detail or the patient code."""

    def override():
        session = BrokenSession(db)
        try:
            yield session
        finally:
            session.close()

    app.main.app.dependency_overrides[app.patients.get_session] = override
    with caplog.at_level(logging.WARNING):
        response = client.get(url("PAT-001"))

    assert response.status_code == 503
    assert response.json() == SERVICE_UNAVAILABLE
    assert DB_SECRET not in response.text
    warnings = [r for r in caplog.records if r.levelno >= logging.WARNING]
    assert warnings, "the database failure must be logged"
    assert any("SQLAlchemyError" in r.getMessage() for r in warnings)
    for record in warnings:
        message = record.getMessage()
        assert DB_SECRET not in message
        assert "PAT-001" not in message
        assert record.exc_info is None  # no stack trace in the log
