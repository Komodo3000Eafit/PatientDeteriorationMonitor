"""Tests for the re-triage suggestion API (US-04).

Covers AC6-AC13 and FR-007-FR-011 of specs/020-retriage-suggestion-alerts/spec.md.
Contract: specs/020-retriage-suggestion-alerts/contracts/retriage-api.md.

GET /api/patients/{code}/suggestions lists a patient's suggestions newest first
to any signed-in clinician; POST .../{id}/accept and .../{id}/dismiss require a
doctor. Error bodies are fixed and never echo a submitted value or an internal
id; the machine tag never reaches the client.

Synthetic data only: fictitious patients (PAT-NNN), a synthetic nurse and doctor.
No real database and no network: every test uses an in-memory SQLite engine
(StaticPool so the TestClient's thread shares it), and the autouse
``isolate_database`` fixture (conftest.py) removes ``DATABASE_URL`` so the real
database configured in backend/.env can never be reached. The stored score is
referred to as "the score"; the literal scoring-system token is deliberately
kept out of this file so the Principle V confinement guard stays green.
"""

import os
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

import app.auth
import app.main
import app.patients
from app.models import Alert, Base, Patient, TriageEvent, User
from app.retriage import build_message

NOT_FOUND = {"detail": "Patient not found"}
SUGGESTION_NOT_FOUND = {"detail": "Suggestion not found"}
ALREADY_HANDLED = {"detail": "Suggestion already handled"}
DISCHARGED = {"detail": "Patient is discharged"}
ONLY_DOCTORS = {"detail": "Only doctors can change the triage level"}
NOT_AUTHENTICATED = {"detail": "Not authenticated"}
SERVICE_UNAVAILABLE = {"detail": "Service unavailable"}

# A distinctive synthetic value stored on the patient (its name) that must never
# appear in any response body: the API returns only the suggestion fields, never
# the patient's identity or internal ids.
SECRET_NAME = "QQ-SECRET-PATIENT-NAME-marker"

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


def _patient_id(engine, code):
    with Session(engine) as session:
        return session.scalar(select(Patient.id).where(Patient.identifier == code))


def seed_suggestion(
    engine, code, *, band="medium", suggested=2, status="open",
    created_at=None, reason="respiratory_rate +3, spo2 +3",
):
    """Add one synthetic suggestion alert for a patient; return its id.

    The message carries the canonical machine tag so the API can read the
    suggested level back and strip the tag before sending the response.
    """
    pid = _patient_id(engine, code)
    with Session(engine) as session:
        alert = Alert(
            patient_id=pid,
            severity=band,
            message=build_message(band, 3, suggested, reason),
            status=status,
        )
        if created_at is not None:
            alert.created_at = created_at
        session.add(alert)
        session.commit()
        return alert.id


def _counts(engine):
    with Session(engine) as session:
        alerts = session.scalar(select(func.count()).select_from(Alert))
        events = session.scalar(select(func.count()).select_from(TriageEvent))
    return alerts, events


def _triage_level(engine, code):
    with Session(engine) as session:
        return session.scalar(select(Patient.triage_level).where(Patient.identifier == code))


def _alert_status(engine, alert_id):
    with Session(engine) as session:
        return session.scalar(select(Alert.status).where(Alert.id == alert_id))


# --- AC8: reading the suggestion alerts -----------------------------------------


def test_ac8_doctor_and_nurse_read_200(as_doctor, db):
    """AC8 (FR-007): a doctor gets the suggestions; the body omits patient_id/acknowledged_by_id and the machine tag."""
    seed_suggestion(db, "PAT-001", band="high", suggested=1)
    response = client.get("/api/patients/PAT-001/suggestions")
    assert response.status_code == 200
    suggestions = response.json()["suggestions"]
    assert len(suggestions) == 1
    item = suggestions[0]
    assert set(item) == {
        "id", "severity", "message", "reason", "current_level",
        "suggested_level", "status", "created_at",
    }
    assert "patient_id" not in item
    assert "acknowledged_by_id" not in item
    assert item["severity"] == "high"
    assert item["current_level"] == 3
    assert item["suggested_level"] == 1
    assert item["status"] == "open"
    # The machine tag never reaches the client.
    assert "[retriage" not in response.text
    assert "suggested=" not in response.text
    assert item["message"] == "Risk is high. Suggest re-triage from Triage III to Triage I."


def test_ac8_nurse_may_read(as_nurse, db):
    """AC8/AC9 (FR-007): a nurse may read a patient's suggestions (200)."""
    seed_suggestion(db, "PAT-001")
    response = client.get("/api/patients/PAT-001/suggestions")
    assert response.status_code == 200
    assert len(response.json()["suggestions"]) == 1


def test_ac8_newest_first_same_created_at_later_id_first(as_doctor, db):
    """AC8 (FR-007): suggestions are newest first; with the same created_at the later id comes first."""
    older = datetime(2026, 11, 20, 10, 0, 0)
    same = datetime(2026, 11, 20, 12, 0, 0)
    first_id = seed_suggestion(db, "PAT-001", band="medium", suggested=2, created_at=older)
    second_id = seed_suggestion(db, "PAT-001", band="medium", suggested=2, created_at=same)
    third_id = seed_suggestion(db, "PAT-001", band="high", suggested=1, created_at=same)

    ids = [s["id"] for s in client.get("/api/patients/PAT-001/suggestions").json()["suggestions"]]
    # Same created_at for the second and third: the later id (third) comes first;
    # the oldest created_at (first) comes last.
    assert ids == [third_id, second_id, first_id]


def test_ac8_no_suggestions_empty_list(as_doctor, db):
    """AC8 (FR-007): a patient with no suggestions returns an empty list, not an error."""
    response = client.get("/api/patients/PAT-001/suggestions")
    assert response.status_code == 200
    assert response.json() == {"suggestions": []}


def test_ac8_discharged_patient_still_readable(as_doctor, db):
    """AC8/AC11 (FR-007): a discharged patient's suggestions are still readable (200)."""
    seed_suggestion(db, "PAT-003", band="medium", suggested=2)
    response = client.get("/api/patients/PAT-003/suggestions")
    assert response.status_code == 200
    assert len(response.json()["suggestions"]) == 1


def test_ac8_no_token_401(db, users):
    """AC8/AC9 (FR-007): signed out -> 401."""
    assert app.auth.get_current_user not in app.main.app.dependency_overrides
    response = client.get("/api/patients/PAT-001/suggestions")
    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED


class QueryCounter:
    """Counts SQL statements sent through an engine (to prove a bad code is rejected before any query)."""

    def __init__(self, engine):
        from sqlalchemy import event
        self._event = event
        self.engine = engine
        self.statements = []

    def __enter__(self):
        self._event.listen(self.engine, "before_cursor_execute", self._record)
        return self

    def __exit__(self, *exc):
        self._event.remove(self.engine, "before_cursor_execute", self._record)

    def _record(self, conn, cursor, statement, parameters, context, executemany):
        self.statements.append(statement)


def test_ac8_unknown_code_404(as_doctor, db):
    """AC8 (FR-007): an unknown patient code -> 404 fixed message."""
    response = client.get("/api/patients/PAT-999/suggestions")
    assert response.status_code == 404
    assert response.json() == NOT_FOUND


@pytest.mark.parametrize("code", ["pat-001", "PAT_001", "A" * 21], ids=["lower", "underscore", "too-long"])
def test_ac8_malformed_code_404_without_query(as_doctor, db, code):
    """AC8/AC13 (FR-007): a code not in the patient code format -> 404 without any database query."""
    with QueryCounter(db) as counter:
        response = client.get(f"/api/patients/{code}/suggestions")
    assert response.status_code == 404
    assert response.json() == NOT_FOUND
    assert counter.statements == []


# --- AC6 / AC9: accept (doctor) -------------------------------------------------


def test_ac6_doctor_accept_200_updates_level_and_writes_one_manual_event(as_doctor, db):
    """AC6/AC9 (FR-008): a doctor accept returns 200 acknowledged, sets the level, writes one source='manual' event."""
    alert_id = seed_suggestion(db, "PAT-001", band="high", suggested=1)
    response = client.post(f"/api/patients/PAT-001/suggestions/{alert_id}/accept")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "acknowledged"
    assert body["current_level"] == 1
    assert body["suggested_level"] == 1
    assert "patient_id" not in body and "acknowledged_by_id" not in body

    assert _triage_level(db, "PAT-001") == 1
    assert _alert_status(db, alert_id) == "acknowledged"
    with Session(db) as session:
        events = session.scalars(select(TriageEvent)).all()
        assert len(events) == 1
        assert events[0].source == "manual"
        assert events[0].previous_level == 3
        assert events[0].new_level == 1
        assert events[0].score is None


def test_ac9_nurse_accept_403_nothing_changes(as_nurse, db):
    """AC9 (FR-008): a nurse accept -> 403 fixed message; the level and alert are unchanged, no event stored."""
    alert_id = seed_suggestion(db, "PAT-001", band="high", suggested=1)
    response = client.post(f"/api/patients/PAT-001/suggestions/{alert_id}/accept")
    assert response.status_code == 403
    assert response.json() == ONLY_DOCTORS
    assert _triage_level(db, "PAT-001") == 3
    assert _alert_status(db, alert_id) == "open"
    assert _counts(db)[1] == 0


def test_ac9_accept_no_token_401(db, users):
    """AC9 (FR-008): accept signed out -> 401, nothing changes."""
    alert_id = seed_suggestion(db, "PAT-001", band="high", suggested=1)
    assert app.auth.get_current_user not in app.main.app.dependency_overrides
    response = client.post(f"/api/patients/PAT-001/suggestions/{alert_id}/accept")
    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED
    assert _triage_level(db, "PAT-001") == 3
    assert _alert_status(db, alert_id) == "open"


# --- AC7 / AC9: dismiss (doctor) ------------------------------------------------


def test_ac7_doctor_dismiss_200_no_level_change_no_event(as_doctor, db):
    """AC7/AC9 (FR-009): a doctor dismiss returns 200 acknowledged, with no level change and no triage event."""
    alert_id = seed_suggestion(db, "PAT-001", band="medium", suggested=2)
    response = client.post(f"/api/patients/PAT-001/suggestions/{alert_id}/dismiss")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "acknowledged"
    assert body["current_level"] == 3   # unchanged
    assert _triage_level(db, "PAT-001") == 3
    assert _alert_status(db, alert_id) == "acknowledged"
    assert _counts(db)[1] == 0


def test_ac9_nurse_dismiss_403(as_nurse, db):
    """AC9 (FR-009): a nurse dismiss -> 403; nothing changes."""
    alert_id = seed_suggestion(db, "PAT-001", band="medium", suggested=2)
    response = client.post(f"/api/patients/PAT-001/suggestions/{alert_id}/dismiss")
    assert response.status_code == 403
    assert response.json() == ONLY_DOCTORS
    assert _alert_status(db, alert_id) == "open"


def test_ac9_dismiss_no_token_401(db, users):
    """AC9 (FR-009): dismiss signed out -> 401, nothing changes."""
    alert_id = seed_suggestion(db, "PAT-001", band="medium", suggested=2)
    assert app.auth.get_current_user not in app.main.app.dependency_overrides
    response = client.post(f"/api/patients/PAT-001/suggestions/{alert_id}/dismiss")
    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED
    assert _alert_status(db, alert_id) == "open"


# --- AC10: acting on an already acknowledged or unknown alert -------------------


def test_ac10_accept_already_acknowledged_409(as_doctor, db):
    """AC10 (FR-008): accept on an already acknowledged alert -> 409 fixed message, nothing changes."""
    alert_id = seed_suggestion(db, "PAT-001", band="high", suggested=1, status="acknowledged")
    response = client.post(f"/api/patients/PAT-001/suggestions/{alert_id}/accept")
    assert response.status_code == 409
    assert response.json() == ALREADY_HANDLED
    assert _triage_level(db, "PAT-001") == 3
    assert _counts(db)[1] == 0


def test_ac10_dismiss_already_acknowledged_409(as_doctor, db):
    """AC10 (FR-009): dismiss on an already acknowledged alert -> 409 fixed message."""
    alert_id = seed_suggestion(db, "PAT-001", band="medium", suggested=2, status="acknowledged")
    response = client.post(f"/api/patients/PAT-001/suggestions/{alert_id}/dismiss")
    assert response.status_code == 409
    assert response.json() == ALREADY_HANDLED


def test_ac10_accept_unknown_alert_404(as_doctor, db):
    """AC10 (FR-008): accept on an unknown alert_id -> 404 fixed message."""
    response = client.post("/api/patients/PAT-001/suggestions/99999/accept")
    assert response.status_code == 404
    assert response.json() == SUGGESTION_NOT_FOUND


def test_ac10_dismiss_unknown_alert_404(as_doctor, db):
    """AC10 (FR-009): dismiss on an unknown alert_id -> 404 fixed message."""
    response = client.post("/api/patients/PAT-001/suggestions/99999/dismiss")
    assert response.status_code == 404
    assert response.json() == SUGGESTION_NOT_FOUND


def test_ac10_double_accept_second_is_409(as_doctor, db):
    """AC10 (FR-008): two accepts of the same open alert -> the first 200, the second 409, nothing further changes."""
    alert_id = seed_suggestion(db, "PAT-001", band="high", suggested=1)
    first = client.post(f"/api/patients/PAT-001/suggestions/{alert_id}/accept")
    assert first.status_code == 200
    assert _triage_level(db, "PAT-001") == 1

    second = client.post(f"/api/patients/PAT-001/suggestions/{alert_id}/accept")
    assert second.status_code == 409
    assert second.json() == ALREADY_HANDLED
    assert _triage_level(db, "PAT-001") == 1
    with Session(db) as session:
        assert session.scalar(select(func.count()).select_from(TriageEvent)) == 1


# --- AC11: discharged patient ---------------------------------------------------


def test_ac11_accept_discharged_patient_409(as_doctor, db):
    """AC11 (FR-008): accept on a discharged patient -> 409 fixed message, nothing stored."""
    alert_id = seed_suggestion(db, "PAT-003", band="high", suggested=1)
    response = client.post(f"/api/patients/PAT-003/suggestions/{alert_id}/accept")
    assert response.status_code == 409
    assert response.json() == DISCHARGED
    assert _triage_level(db, "PAT-003") == 3
    assert _alert_status(db, alert_id) == "open"
    assert _counts(db)[1] == 0


# --- AC13: safe errors and the database-unavailable case ------------------------


def test_ac13_distinctive_value_never_in_any_response(as_doctor, db):
    """AC13 (FR-011): the patient's identity (a distinctive synthetic name) and the machine tag never appear in any response body."""
    alert_id = seed_suggestion(db, "PAT-001", band="medium", suggested=2)
    get = client.get("/api/patients/PAT-001/suggestions")
    accept = client.post(f"/api/patients/PAT-001/suggestions/{alert_id}/accept")
    for response in (get, accept):
        assert SECRET_NAME not in response.text
        assert "[retriage" not in response.text
        assert "suggested=" not in response.text


def test_ac13_no_database_url_503(users, monkeypatch):
    """AC13/FR-011: DATABASE_URL unset and get_session not overridden -> 503 fixed message (GET, accept, dismiss)."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    sign_in(users["doctor"])
    assert app.patients.get_session not in app.main.app.dependency_overrides

    for method, url in (
        ("get", "/api/patients/PAT-001/suggestions"),
        ("post", "/api/patients/PAT-001/suggestions/1/accept"),
        ("post", "/api/patients/PAT-001/suggestions/1/dismiss"),
    ):
        response = getattr(client, method)(url)
        assert response.status_code == 503, url
        assert response.json() == SERVICE_UNAVAILABLE
