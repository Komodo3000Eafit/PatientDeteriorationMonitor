"""Tests for the read-only patient detail endpoints (US-05).

Covers AC3, AC7, AC8, AC9 and FR-001-FR-004, FR-019 of
specs/018-patient-detail/spec.md.
Contract: specs/018-patient-detail/contracts/patient-detail-api.md.

Synthetic data only: fictitious patients, a synthetic nurse and doctor, and
made-up vital signs and triage events. No real database and no network: every
test uses an in-memory SQLite engine, and the autouse ``isolate_database``
fixture (conftest.py) removes ``DATABASE_URL`` so the real database configured
in ``backend/.env`` can never be reached. The pattern (StaticPool engine shared
across threads + ``dependency_overrides``) mirrors ``test_readings_api.py``.
"""

import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

import app.auth
import app.main
import app.patients
from app.models import Base, Patient, TriageEvent, User
from app.readings import record_reading
from app.scoring import VitalSigns

NOT_FOUND = {"detail": "Patient not found"}
SERVICE_UNAVAILABLE = {"detail": "Service unavailable"}
NOT_AUTHENTICATED = {"detail": "Not authenticated"}

# Internal keys that must never appear in any response body.
PATIENT_INTERNAL_KEYS = {"id", "monitoring_status"}
EVENT_INTERNAL_KEYS = {"id", "patient_id", "created_by_id"}
EVENT_ALLOWED_KEYS = {
    "occurred_at",
    "previous_level",
    "new_level",
    "score",
    "reason",
    "source",
}

# Timestamps used to assert newest-first order.
T0 = datetime(2026, 11, 20, 14, 0, 0, tzinfo=timezone.utc)
T1 = datetime(2026, 11, 20, 14, 30, 0, tzinfo=timezone.utc)
T2 = datetime(2026, 11, 20, 15, 5, 0, tzinfo=timezone.utc)

client = TestClient(app.main.app)


# --- Fixtures -----------------------------------------------------------------


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
def seed(engine, users):
    """Seed patients, one reading (with its stored score) and triage events.

    - PAT-010: active patient with a reading at ``T2`` and three triage events
      (initial at ``T0``, automatic at ``T1``, manual at ``T2``).
    - PAT-011: active patient with no reading and only its initial event.
    Returns the patient codes keyed by role so tests can pick either.
    """
    admitted = T0
    with Session(engine) as session:
        with_reading = Patient(
            identifier="PAT-010", name="Paciente Ficticio Diez", age=64,
            sex="male", triage_level=3, status="active", admitted_at=admitted,
        )
        no_reading = Patient(
            identifier="PAT-011", name="Paciente Ficticio Once", age=30,
            sex="female", triage_level=5, status="active", admitted_at=admitted,
        )
        session.add_all([with_reading, no_reading])
        session.flush()
        pid = with_reading.id
        no_pid = no_reading.id
        nurse_id = users["nurse"].id

        # Three triage events for PAT-010 (inserted out of chronological order
        # on purpose, so the newest-first ordering is actually exercised).
        session.add_all([
            TriageEvent(
                patient_id=pid, occurred_at=T1, previous_level=3, new_level=2,
                score=7, reason="NEWS2 7 (high)", source="automatic",
                created_by_id=None,
            ),
            TriageEvent(
                patient_id=pid, occurred_at=T0, previous_level=None, new_level=3,
                score=None, reason="Initial triage at registration",
                source="initial", created_by_id=nurse_id,
            ),
            TriageEvent(
                patient_id=pid, occurred_at=T2, previous_level=2, new_level=1,
                score=9, reason="Manual re-triage", source="manual",
                created_by_id=nurse_id,
            ),
        ])
        # Only the initial event for PAT-011.
        session.add(TriageEvent(
            patient_id=no_pid, occurred_at=T0, previous_level=None, new_level=5,
            score=None, reason="Initial triage at registration",
            source="initial", created_by_id=nurse_id,
        ))
        session.commit()

        # One reading with its stored score for PAT-010, recorded at T2.
        vitals = VitalSigns(16, 97, False, 120, 72, "A", Decimal("36.8"))
        row = record_reading(session, pid, vitals)
        row.recorded_at = T2
        session.commit()

    return {"with_reading": "PAT-010", "no_reading": "PAT-011"}


@pytest.fixture
def db(engine, seed):
    """Override ``get_session`` with a session on the in-memory engine."""

    def override():
        session = Session(engine)
        try:
            yield session
        finally:
            session.close()

    app.main.app.dependency_overrides[app.patients.get_session] = override
    return engine


def sign_in(user):
    app.main.app.dependency_overrides[app.auth.get_current_user] = lambda: user


@pytest.fixture
def as_doctor(db, users):
    sign_in(users["doctor"])
    return users["doctor"]


@pytest.fixture
def as_nurse(db, users):
    sign_in(users["nurse"])
    return users["nurse"]


def patient_url(code):
    return f"/api/patients/{code}"


def events_url(code):
    return f"/api/patients/{code}/triage-events"


def _as_utc_naive(value):
    """Return a datetime as naive UTC (SQLite returns naive values in tests)."""
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


# --- AC8 / FR-001: patient-data endpoint ---------------------------------------


def test_ac8_patient_with_reading_200_shape(as_doctor):
    """AC8 (FR-001): existing patient with a reading -> 200 with the exact fields and last_reading_at set."""
    response = client.get(patient_url("PAT-010"))
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {
        "identifier", "name", "age", "sex", "triage_level", "status",
        "admitted_at", "last_reading_at",
    }
    assert body["identifier"] == "PAT-010"
    assert body["name"] == "Paciente Ficticio Diez"
    assert body["age"] == 64
    assert body["sex"] == "male"
    assert body["triage_level"] == 3
    assert body["status"] == "active"
    # last_reading_at is the recorded_at of the single reading (T2).
    assert body["last_reading_at"] is not None
    last = datetime.fromisoformat(body["last_reading_at"].replace("Z", "+00:00"))
    assert _as_utc_naive(last) == T2.replace(tzinfo=None)


def test_ac8_patient_without_reading_last_reading_at_null(as_doctor):
    """AC8 (FR-001): existing patient with no reading -> last_reading_at is null."""
    response = client.get(patient_url("PAT-011"))
    assert response.status_code == 200
    body = response.json()
    assert body["identifier"] == "PAT-011"
    assert body["last_reading_at"] is None


def test_ac8_patient_body_has_no_monitoring_status_or_id(as_doctor):
    """AC8 (FR-001): the patient body has no ``monitoring_status`` key and no ``id`` key."""
    body = client.get(patient_url("PAT-010")).json()
    assert not PATIENT_INTERNAL_KEYS & set(body)
    assert "monitoring_status" not in body
    assert "id" not in body


def test_ac8_patient_any_role_may_read(as_nurse):
    """AC8 (FR-003): a nurse (not only a doctor) may read the patient endpoint."""
    response = client.get(patient_url("PAT-010"))
    assert response.status_code == 200


def test_ac8_patient_unknown_code_404(as_doctor):
    """AC8 (FR-004): a well-formed but unknown code -> 404 fixed message."""
    response = client.get(patient_url("PAT-999"))
    assert response.status_code == 404
    assert response.json() == NOT_FOUND


@pytest.mark.parametrize("code", ["pat-010", "PAT_010!", "A" * 21])
def test_ac8_patient_malformed_code_404(as_doctor, code):
    """AC8 (FR-004): a malformed code (lowercase, bad chars, >20) -> 404, no echo."""
    response = client.get(patient_url(code))
    assert response.status_code == 404
    assert response.json() == NOT_FOUND
    # The submitted code must not be echoed in the body.
    assert code not in response.text


def test_ac8_patient_malformed_code_with_space_404(as_doctor):
    """AC8 (FR-004): a code containing a space -> 404 (does not match the format)."""
    response = client.get("/api/patients/bad code")
    assert response.status_code == 404
    assert response.json() == NOT_FOUND
    assert "bad code" not in response.text


def test_ac7_patient_no_token_401(users):
    """AC7 (FR-003): no token (real get_current_user) -> 401, nothing returned."""
    assert app.auth.get_current_user not in app.main.app.dependency_overrides
    response = client.get(patient_url("PAT-010"))
    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED
    assert response.headers["www-authenticate"] == "Bearer"


def test_ac8_patient_database_unavailable_503(users, monkeypatch):
    """AC8 (FR-004): DATABASE_URL unset and get_session not overridden -> 503 fixed message."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    sign_in(users["doctor"])
    assert app.patients.get_session not in app.main.app.dependency_overrides
    response = client.get(patient_url("PAT-010"))
    assert response.status_code == 503
    assert response.json() == SERVICE_UNAVAILABLE


# --- AC3 / AC9 / FR-002: triage-history endpoint -------------------------------


def test_ac9_triage_events_200_newest_first(as_doctor):
    """AC3/AC9 (FR-002): the events come back newest-first by occurred_at."""
    response = client.get(events_url("PAT-010"))
    assert response.status_code == 200
    events = response.json()["triage_events"]
    assert len(events) == 3
    occurred = [e["occurred_at"] for e in events]
    parsed = [datetime.fromisoformat(o.replace("Z", "+00:00")) for o in occurred]
    assert [_as_utc_naive(p) for p in parsed] == [
        T2.replace(tzinfo=None), T1.replace(tzinfo=None), T0.replace(tzinfo=None)
    ]
    # The newest event is the manual one, the oldest is the initial one.
    assert events[0]["source"] == "manual"
    assert events[-1]["source"] == "initial"


def test_ac9_triage_event_items_only_allowed_keys(as_doctor):
    """AC9 (FR-002): each item has only the six allowed keys, no id/patient_id/created_by_id."""
    events = client.get(events_url("PAT-010")).json()["triage_events"]
    for event in events:
        assert set(event) == EVENT_ALLOWED_KEYS
        assert not EVENT_INTERNAL_KEYS & set(event)


def test_ac9_triage_event_nullable_previous_level_and_score(as_doctor):
    """AC9: the initial event has null previous_level and null score."""
    events = client.get(events_url("PAT-010")).json()["triage_events"]
    initial = events[-1]
    assert initial["source"] == "initial"
    assert initial["previous_level"] is None
    assert initial["score"] is None
    assert initial["new_level"] == 3


def test_ac9_triage_events_only_initial_for_new_patient(as_doctor):
    """AC9: a patient with only its initial event returns that one event."""
    events = client.get(events_url("PAT-011")).json()["triage_events"]
    assert len(events) == 1
    assert events[0]["source"] == "initial"
    assert events[0]["previous_level"] is None
    assert events[0]["score"] is None


def test_ac9_triage_events_any_role_may_read(as_nurse):
    """AC9 (FR-003): a nurse may also read the triage-events endpoint."""
    response = client.get(events_url("PAT-010"))
    assert response.status_code == 200


def test_ac9_triage_events_unknown_code_404(as_doctor):
    """AC9 (FR-004): unknown but well-formed code -> 404 fixed message."""
    response = client.get(events_url("PAT-999"))
    assert response.status_code == 404
    assert response.json() == NOT_FOUND


@pytest.mark.parametrize("code", ["pat-010", "PAT_010!", "A" * 21])
def test_ac9_triage_events_malformed_code_404(as_doctor, code):
    """AC9 (FR-004): malformed code -> 404, submitted value not echoed."""
    response = client.get(events_url(code))
    assert response.status_code == 404
    assert response.json() == NOT_FOUND
    assert code not in response.text


def test_ac9_triage_events_malformed_code_with_space_404(as_doctor):
    """AC9 (FR-004): a code containing a space -> 404."""
    response = client.get("/api/patients/bad code/triage-events")
    assert response.status_code == 404
    assert response.json() == NOT_FOUND
    assert "bad code" not in response.text


def test_ac7_triage_events_no_token_401(users):
    """AC7 (FR-003): no token -> 401, nothing returned."""
    assert app.auth.get_current_user not in app.main.app.dependency_overrides
    response = client.get(events_url("PAT-010"))
    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED
    assert response.headers["www-authenticate"] == "Bearer"


def test_ac9_triage_events_database_unavailable_503(users, monkeypatch):
    """AC9 (FR-004): DATABASE_URL unset and get_session not overridden -> 503 fixed message."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    sign_in(users["doctor"])
    assert app.patients.get_session not in app.main.app.dependency_overrides
    response = client.get(events_url("PAT-010"))
    assert response.status_code == 503
    assert response.json() == SERVICE_UNAVAILABLE


# --- FR-004: no submitted value is echoed in an error --------------------------


def test_fr004_malformed_code_not_echoed_in_any_body(as_doctor):
    """FR-004: a distinctive malformed code never appears in either endpoint's 404 body."""
    marker = "zzEVIL-echo-marker"
    for url in (patient_url(marker), events_url(marker)):
        response = client.get(url)
        assert response.status_code == 404
        assert marker not in response.text


def test_fr004_error_logs_do_not_echo_submitted_value(as_doctor, caplog):
    """FR-004: a 503 is logged by error type only; the submitted code is not in the log."""
    import logging

    # Force a database error path on the patient endpoint by overriding
    # get_session with a session whose engine is already disposed.
    broken = create_engine(
        "sqlite://", poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(broken)
    broken.dispose()

    def override():
        session = Session(broken)
        try:
            yield session
        finally:
            session.close()

    app.main.app.dependency_overrides[app.patients.get_session] = override
    marker = "PAT-ECHO"
    with caplog.at_level(logging.WARNING):
        response = client.get(patient_url(marker))
    # Either a 404 (code rejected before any query) or a 503 (db error); in
    # neither case may the submitted code appear in the body or the logs.
    assert response.status_code in (404, 503)
    assert marker not in response.text
    assert marker not in caplog.text
