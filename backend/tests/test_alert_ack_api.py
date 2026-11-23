"""Tests for the alert acknowledgement API (US-07, "seen" marker).

Covers AC1-AC10, FR-001-FR-007 and the backend edge cases of
specs/023-alert-acknowledgement/spec.md.
Contract: specs/023-alert-acknowledgement/contracts/alert-ack-api.md.

POST /api/patients/{identifier}/alerts/{alert_id}/seen lets a nurse mark an open
alert as seen: it stores the nurse and the time in ``acknowledged_by_id`` /
``acknowledged_at`` and keeps ``status = 'open'``; first nurse wins (409 after).
GET /api/patients/{identifier}/alerts/acknowledgement returns the shown alert
(newest open alert, else newest alert) as {id, status, state, by, at}, or null.

Synthetic data only: fictitious patients (PAT-NNN), two synthetic nurses and a
synthetic doctor, alerts seeded directly with the US-04 machine-tag message
format. No real database and no network: every test uses an in-memory SQLite
engine (StaticPool so the TestClient's thread shares it), and the autouse
``isolate_database`` fixture (conftest.py) removes ``DATABASE_URL``. The fixture
pattern is copied (not imported) from test_retriage_api.py. The literal
scoring-system token is deliberately kept out of this file.
"""

import logging
import os
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

import app.auth
import app.main
import app.patients
from app.models import Alert, Base, Patient, TriageEvent, User

NOT_FOUND = {"detail": "Patient not found"}
ALERT_NOT_FOUND = {"detail": "Alert not found"}
ALREADY_HANDLED = {"detail": "Alert already handled"}
ONLY_NURSES = {"detail": "Only nurses can mark alerts as seen"}
NOT_AUTHENTICATED = {"detail": "Not authenticated"}
SERVICE_UNAVAILABLE = {"detail": "Service unavailable"}

TOP_KEYS = {"alert"}
ALERT_KEYS = {"id", "status", "state", "by", "at"}

NURSE_NAME = "Enf. Ficticia Prueba"
NURSE2_NAME = "Enf. Segunda Ficticia"
DOCTOR_NAME = "Dr. Ficticio Prueba"
USERNAMES = ("synthetic.nurse", "synthetic.nurse2", "synthetic.doctor", "demo.doctor", "demo.nurse")

# A distinctive synthetic patient name that must never appear in a response.
SECRET_NAME = "QQ-SECRET-ACK-PATIENT-NAME-marker"

# The stored alert message as US-04 writes it: machine tag + fixed human sentence
# (format copied from test_retriage_api.py / retriage.build_message).
TAGGED_MESSAGE = "[retriage band=medium;suggested=2] Risk is medium. Suggest re-triage from Triage III to Triage II."

# Synthetic base time for seeded alerts.
T0 = datetime(2026, 11, 23, 10, 0, 0)

client = TestClient(app.main.app)


def seen_url(code, alert_id):
    return f"/api/patients/{code}/alerts/{alert_id}/seen"


def ack_url(code):
    return f"/api/patients/{code}/alerts/acknowledgement"


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
    """Save two synthetic nurses and a synthetic doctor; return them detached."""
    with Session(engine, expire_on_commit=False) as session:
        nurse = User(
            username="synthetic.nurse", password_hash="not-a-real-hash",
            full_name=NURSE_NAME, role="nurse",
        )
        nurse2 = User(
            username="synthetic.nurse2", password_hash="not-a-real-hash",
            full_name=NURSE2_NAME, role="nurse",
        )
        doctor = User(
            username="synthetic.doctor", password_hash="not-a-real-hash",
            full_name=DOCTOR_NAME, role="doctor",
        )
        session.add_all([nurse, nurse2, doctor])
        session.commit()
        return {"nurse": nurse, "nurse2": nurse2, "doctor": doctor}


@pytest.fixture
def db(engine):
    """Override ``get_session``; add PAT-001 and PAT-002 (active, Triage III) and PAT-003 (discharged)."""

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
            identifier="PAT-002", name="Paciente Ficticio PAT-002", age=40, sex="other",
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


# --- Seeding and reading helpers --------------------------------------------------


def _patient_id(engine, code):
    with Session(engine) as session:
        return session.scalar(select(Patient.id).where(Patient.identifier == code))


def seed_alert(engine, code, *, status="open", created_at=T0, by=None, at=None, severity="medium"):
    """Add one synthetic re-triage suggestion alert with chosen fields; return its id."""
    pid = _patient_id(engine, code)
    with Session(engine) as session:
        alert = Alert(
            patient_id=pid, severity=severity, message=TAGGED_MESSAGE, status=status,
            created_at=created_at, acknowledged_by_id=by, acknowledged_at=at,
        )
        session.add(alert)
        session.commit()
        return alert.id


def _row(engine, alert_id):
    """Return the stored alert columns as a dict (naive datetimes, as SQLite keeps them)."""
    with Session(engine) as session:
        alert = session.get(Alert, alert_id)
        return {
            "patient_id": alert.patient_id,
            "severity": alert.severity,
            "message": alert.message,
            "status": alert.status,
            "created_at": alert.created_at.replace(tzinfo=None),
            "acknowledged_by_id": alert.acknowledged_by_id,
            "acknowledged_at": (
                alert.acknowledged_at.replace(tzinfo=None) if alert.acknowledged_at else None
            ),
        }


def _counts(engine):
    with Session(engine) as session:
        return {
            "alerts": session.scalar(select(func.count()).select_from(Alert)),
            "triage_events": session.scalar(select(func.count()).select_from(TriageEvent)),
        }


def _triage_level(engine, code):
    with Session(engine) as session:
        return session.scalar(select(Patient.triage_level).where(Patient.identifier == code))


def _utc_now():
    """Current UTC time without tzinfo (SQLite returns naive values)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _naive(value):
    """Parse an ISO datetime from the response and drop any tz (SQLite stores naive values)."""
    return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)


def _assert_safe_body(text):
    """AC10 / FR-006: no user id field, username, patient internal id, machine tag or patient name."""
    for forbidden in (
        "acknowledged_by_id", "user_id", "patient_id", "username", "severity", "message",
        "[retriage", "suggested=", "band=", SECRET_NAME, *USERNAMES,
    ):
        assert forbidden not in text, forbidden


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


def _writes(statements):
    return [s for s in statements if s.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))]


# =================================================================================
# POST /api/patients/{identifier}/alerts/{alert_id}/seen
# =================================================================================


# --- AC1: a nurse marks an open suggestion as seen --------------------------------


def test_ac1_nurse_marks_open_alert_seen_200(as_nurse, db):
    """AC1 (FR-001, FR-002): 200; the row stores the nurse and a time, status stays open;
    the answer is {"alert": {id, status "open", state "seen", by = nurse full name, at}}."""
    alert_id = seed_alert(db, "PAT-001")
    before = _utc_now() - timedelta(minutes=1)

    response = client.post(seen_url("PAT-001", alert_id))

    assert response.status_code == 200
    body = response.json()
    assert set(body) == TOP_KEYS
    assert set(body["alert"]) == ALERT_KEYS
    assert body["alert"]["id"] == alert_id
    assert body["alert"]["status"] == "open"
    assert body["alert"]["state"] == "seen"
    assert body["alert"]["by"] == NURSE_NAME
    assert body["alert"]["at"] is not None

    row = _row(db, alert_id)
    assert row["acknowledged_by_id"] == as_nurse.id
    assert row["acknowledged_at"] is not None
    assert before <= row["acknowledged_at"] <= _utc_now() + timedelta(minutes=1)
    assert _naive(body["alert"]["at"]) == row["acknowledged_at"]
    assert row["status"] == "open"


def test_ac1_ac10_post_answer_is_safe(as_nurse, db):
    """AC1/AC10 (FR-006): the POST answer has no user id, username, patient id or machine tag."""
    alert_id = seed_alert(db, "PAT-001")
    response = client.post(seen_url("PAT-001", alert_id))
    assert response.status_code == 200
    _assert_safe_body(response.text)


# --- AC4: only nurses may mark as seen --------------------------------------------


def test_ac4_post_no_token_401(db, users):
    """AC4 (FR-001): signed out -> 401 with the existing auth message; nothing stored."""
    alert_id = seed_alert(db, "PAT-001")
    assert app.auth.get_current_user not in app.main.app.dependency_overrides
    response = client.post(seen_url("PAT-001", alert_id))
    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED
    row = _row(db, alert_id)
    assert row["acknowledged_by_id"] is None
    assert row["acknowledged_at"] is None


def test_ac4_doctor_403_exact_message_nothing_stored(as_doctor, db):
    """AC4 (FR-001): a doctor -> 403 "Only nurses can mark alerts as seen"; nothing stored."""
    alert_id = seed_alert(db, "PAT-001")
    response = client.post(seen_url("PAT-001", alert_id))
    assert response.status_code == 403
    assert response.json() == ONLY_NURSES
    row = _row(db, alert_id)
    assert row["acknowledged_by_id"] is None
    assert row["acknowledged_at"] is None
    assert row["status"] == "open"


# --- AC5: unknown patient or alert ------------------------------------------------


def test_ac5_unknown_patient_code_404(as_nurse, db):
    """AC5 (FR-003): an unknown patient code -> 404 "Patient not found"."""
    response = client.post(seen_url("PAT-999", 1))
    assert response.status_code == 404
    assert response.json() == NOT_FOUND


@pytest.mark.parametrize("code", ["abc", "pat-001", "PAT_001", "A" * 21],
                         ids=["abc", "lower", "underscore", "too-long"])
def test_ac5_malformed_patient_code_404(as_nurse, db, code):
    """AC5 (FR-003): a code not in the patient code format -> 404 "Patient not found"; nothing stored."""
    alert_id = seed_alert(db, "PAT-001")
    response = client.post(seen_url(code, alert_id))
    assert response.status_code == 404
    assert response.json() == NOT_FOUND
    assert _row(db, alert_id)["acknowledged_by_id"] is None


def test_ac5_unknown_alert_id_404(as_nurse, db):
    """AC5 (FR-003): an unknown alert id -> 404 "Alert not found"."""
    seed_alert(db, "PAT-001")
    response = client.post(seen_url("PAT-001", 99999))
    assert response.status_code == 404
    assert response.json() == ALERT_NOT_FOUND


def test_ac5_cross_patient_alert_404_and_other_row_unchanged(as_nurse, db):
    """AC5 (FR-003): patient B's alert id sent on patient A's path -> 404 "Alert not found";
    patient B's alert row keeps acknowledged_by_id and acknowledged_at null."""
    seed_alert(db, "PAT-001")
    other_id = seed_alert(db, "PAT-002")
    before = _row(db, other_id)

    response = client.post(seen_url("PAT-001", other_id))

    assert response.status_code == 404
    assert response.json() == ALERT_NOT_FOUND
    after = _row(db, other_id)
    assert after["acknowledged_by_id"] is None
    assert after["acknowledged_at"] is None
    assert after == before


# --- AC6: first nurse wins --------------------------------------------------------


def test_ac6_second_nurse_409_first_marker_kept(db, users):
    """AC6 (FR-003, FR-004): nurse 1 marks (200); nurse 2 then gets 409 "Alert already handled";
    the stored person and time stay nurse 1's."""
    alert_id = seed_alert(db, "PAT-001")
    sign_in(users["nurse"])
    first = client.post(seen_url("PAT-001", alert_id))
    assert first.status_code == 200
    stored = _row(db, alert_id)
    assert stored["acknowledged_by_id"] == users["nurse"].id

    sign_in(users["nurse2"])
    second = client.post(seen_url("PAT-001", alert_id))
    assert second.status_code == 409
    assert second.json() == ALREADY_HANDLED
    assert _row(db, alert_id) == stored


def test_ac6_already_seen_seeded_409_unchanged(db, users):
    """AC6 (FR-003): an alert seeded as seen by nurse 1 -> nurse 2 gets 409; person and time unchanged."""
    alert_id = seed_alert(db, "PAT-001", by=users["nurse"].id, at=T0 + timedelta(minutes=1))
    before = _row(db, alert_id)
    sign_in(users["nurse2"])
    response = client.post(seen_url("PAT-001", alert_id))
    assert response.status_code == 409
    assert response.json() == ALREADY_HANDLED
    assert _row(db, alert_id) == before


def test_ac6_acknowledged_alert_409(as_nurse, db, users):
    """AC6 (FR-003): an acknowledged alert (handled by a doctor) -> 409; nothing changes."""
    alert_id = seed_alert(
        db, "PAT-001", status="acknowledged", by=users["doctor"].id, at=T0 + timedelta(minutes=2),
    )
    before = _row(db, alert_id)
    response = client.post(seen_url("PAT-001", alert_id))
    assert response.status_code == 409
    assert response.json() == ALREADY_HANDLED
    assert _row(db, alert_id) == before


def test_ac6_acknowledged_without_person_409(as_nurse, db):
    """AC6 (FR-003), edge case: an acknowledged alert with no stored person still gets 409."""
    alert_id = seed_alert(db, "PAT-001", status="acknowledged")
    response = client.post(seen_url("PAT-001", alert_id))
    assert response.status_code == 409
    assert response.json() == ALREADY_HANDLED
    row = _row(db, alert_id)
    assert row["acknowledged_by_id"] is None
    assert row["status"] == "acknowledged"


# --- AC7: check order 401 -> 403 -> 404 -> 409 -> 200 -----------------------------


def test_ac7_401_before_404(db, users):
    """AC7: signed out on an unknown patient -> 401 (not 404)."""
    response = client.post(seen_url("PAT-999", 99999))
    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED


def test_ac7_403_before_404_doctor_unknown_patient(as_doctor, db):
    """AC7: a doctor on an unknown patient code -> 403 (not 404)."""
    response = client.post(seen_url("PAT-999", 99999))
    assert response.status_code == 403
    assert response.json() == ONLY_NURSES


def test_ac7_403_before_409_doctor_acknowledged_alert(as_doctor, db):
    """AC7: a doctor on an already acknowledged alert -> 403 (not 409)."""
    alert_id = seed_alert(db, "PAT-001", status="acknowledged")
    response = client.post(seen_url("PAT-001", alert_id))
    assert response.status_code == 403
    assert response.json() == ONLY_NURSES


def test_ac7_404_before_409_unknown_alert_on_patient_with_acknowledged_alert(as_nurse, db, users):
    """AC7: an unknown alert id on a patient whose other alert is acknowledged -> 404 (not 409)."""
    seed_alert(db, "PAT-001", status="acknowledged", by=users["doctor"].id, at=T0)
    response = client.post(seen_url("PAT-001", 99999))
    assert response.status_code == 404
    assert response.json() == ALERT_NOT_FOUND


# --- AC8: nothing else changes ----------------------------------------------------


def test_ac8_nothing_else_changes_after_200(as_nurse, db):
    """AC8 (FR-002): after a 200 the triage level, triage_events count, alerts count and the
    alert's severity, message, status and created_at are unchanged."""
    alert_id = seed_alert(db, "PAT-001", severity="high", created_at=T0 + timedelta(minutes=5))
    seed_alert(db, "PAT-002")
    before_row = _row(db, alert_id)
    before_counts = _counts(db)
    before_levels = {code: _triage_level(db, code) for code in ("PAT-001", "PAT-002", "PAT-003")}

    response = client.post(seen_url("PAT-001", alert_id))
    assert response.status_code == 200

    after_row = _row(db, alert_id)
    for column in ("patient_id", "severity", "message", "status", "created_at"):
        assert after_row[column] == before_row[column], column
    assert after_row["message"] == TAGGED_MESSAGE
    assert _counts(db) == before_counts
    assert {code: _triage_level(db, code) for code in before_levels} == before_levels


# --- Edge case: discharged patient ------------------------------------------------


def test_edge_discharged_patient_mark_seen_200(as_nurse, db):
    """Edge case (research R6): marking an alert of a discharged patient works like an active one."""
    alert_id = seed_alert(db, "PAT-003")
    response = client.post(seen_url("PAT-003", alert_id))
    assert response.status_code == 200
    assert response.json()["alert"]["state"] == "seen"
    assert response.json()["alert"]["by"] == NURSE_NAME
    row = _row(db, alert_id)
    assert row["acknowledged_by_id"] == as_nurse.id
    assert row["status"] == "open"
    assert _triage_level(db, "PAT-003") == 3


# --- AC10: database failure -> 503, logged by error type only ---------------------


DB_SECRET = "SECRET-DB-DETAIL-host.example.invalid"


class BrokenSession(Session):
    """A session whose every query raises a synthetic SQLAlchemyError carrying a secret detail."""

    def execute(self, *args, **kwargs):
        raise SQLAlchemyError(DB_SECRET)

    def scalars(self, *args, **kwargs):
        raise SQLAlchemyError(DB_SECRET)

    def scalar(self, *args, **kwargs):
        raise SQLAlchemyError(DB_SECRET)


class CommitFailingSession(Session):
    """A session that reads and writes normally but whose commit raises a synthetic SQLAlchemyError."""

    def commit(self):
        raise SQLAlchemyError(DB_SECRET)


def _use_session(engine, session_class):
    def override():
        session = session_class(engine)
        try:
            yield session
        finally:
            session.close()

    app.main.app.dependency_overrides[app.patients.get_session] = override


def _assert_logged_by_type_only(caplog):
    warnings = [r for r in caplog.records if r.levelno >= logging.WARNING]
    assert warnings, "the database failure must be logged"
    assert any("SQLAlchemyError" in r.getMessage() for r in warnings)
    for record in warnings:
        message = record.getMessage()
        assert DB_SECRET not in message
        assert "PAT-001" not in message
        assert record.exc_info is None  # no stack trace in the log


def test_ac10_post_database_error_503_logged_by_type_only(as_nurse, db, caplog):
    """AC10 (FR-006): a forced SQLAlchemyError on the POST -> 503 "Service unavailable";
    nothing stored; the log line holds only the error type name."""
    alert_id = seed_alert(db, "PAT-001")
    _use_session(db, BrokenSession)
    with caplog.at_level(logging.WARNING):
        response = client.post(seen_url("PAT-001", alert_id))

    assert response.status_code == 503
    assert response.json() == SERVICE_UNAVAILABLE
    assert DB_SECRET not in response.text
    _assert_logged_by_type_only(caplog)
    row = _row(db, alert_id)
    assert row["acknowledged_by_id"] is None
    assert row["acknowledged_at"] is None


def test_ac10_post_commit_failure_503_rolled_back(as_nurse, db, caplog):
    """AC10 (FR-003, FR-006): the commit fails after the update -> 503, rolled back, nothing stored."""
    alert_id = seed_alert(db, "PAT-001")
    _use_session(db, CommitFailingSession)
    with caplog.at_level(logging.WARNING):
        response = client.post(seen_url("PAT-001", alert_id))

    assert response.status_code == 503
    assert response.json() == SERVICE_UNAVAILABLE
    assert DB_SECRET not in response.text
    _assert_logged_by_type_only(caplog)
    row = _row(db, alert_id)
    assert row["acknowledged_by_id"] is None
    assert row["acknowledged_at"] is None
    assert row["status"] == "open"


def test_ac10_post_no_database_url_503(users, monkeypatch):
    """AC10: DATABASE_URL unset and get_session not overridden -> 503 fixed message."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    sign_in(users["nurse"])
    assert app.patients.get_session not in app.main.app.dependency_overrides
    response = client.post(seen_url("PAT-001", 1))
    assert response.status_code == 503
    assert response.json() == SERVICE_UNAVAILABLE


# =================================================================================
# US-04 interaction (US-04 code unchanged)
# =================================================================================


def test_ac2_seen_alert_still_listed_open_in_suggestions(as_nurse, db, users):
    """AC2 (FR-007): after a nurse's seen marker, GET .../suggestions still lists the alert as open,
    for the nurse and for a doctor."""
    alert_id = seed_alert(db, "PAT-001")
    assert client.post(seen_url("PAT-001", alert_id)).status_code == 200

    for user in (users["nurse"], users["doctor"]):
        sign_in(user)
        response = client.get("/api/patients/PAT-001/suggestions")
        assert response.status_code == 200
        suggestions = response.json()["suggestions"]
        assert [s["id"] for s in suggestions] == [alert_id]
        assert suggestions[0]["status"] == "open"


def test_ac2_seen_alert_still_in_open_suggestions_banner(as_nurse, db, users):
    """AC2 (FR-007): after a seen marker, GET /api/suggestions (all open) still includes the alert."""
    alert_id = seed_alert(db, "PAT-001")
    assert client.post(seen_url("PAT-001", alert_id)).status_code == 200
    sign_in(users["doctor"])
    response = client.get("/api/suggestions")
    assert response.status_code == 200
    assert [s["id"] for s in response.json()["suggestions"]] == [alert_id]


def test_ac3_doctor_dismiss_overwrites_seen_marker(db, users):
    """AC3 (FR-007, D-56): on a seen alert, a doctor's dismiss returns 200; the row becomes
    acknowledged with acknowledged_by_id = doctor and a new acknowledged_at; the GET shows handled."""
    seen_at = T0 + timedelta(minutes=1)
    alert_id = seed_alert(db, "PAT-001", by=users["nurse"].id, at=seen_at)
    sign_in(users["doctor"])

    response = client.post(f"/api/patients/PAT-001/suggestions/{alert_id}/dismiss")

    assert response.status_code == 200
    row = _row(db, alert_id)
    assert row["status"] == "acknowledged"
    assert row["acknowledged_by_id"] == users["doctor"].id
    assert row["acknowledged_at"] is not None
    assert row["acknowledged_at"] != seen_at
    assert row["acknowledged_at"] > seen_at

    ack = client.get(ack_url("PAT-001"))
    assert ack.status_code == 200
    assert ack.json()["alert"]["state"] == "handled"
    assert ack.json()["alert"]["by"] == DOCTOR_NAME


def test_ac3_doctor_accept_overwrites_seen_marker_second_patient(db, users):
    """AC3 (FR-007, D-56): on a seen alert of a second (active) patient, a doctor's accept returns
    200; the row becomes acknowledged with the doctor's id and a new acknowledged_at."""
    seen_at = T0 + timedelta(minutes=1)
    alert_id = seed_alert(db, "PAT-002", by=users["nurse"].id, at=seen_at)
    sign_in(users["doctor"])

    response = client.post(f"/api/patients/PAT-002/suggestions/{alert_id}/accept")

    assert response.status_code == 200
    row = _row(db, alert_id)
    assert row["status"] == "acknowledged"
    assert row["acknowledged_by_id"] == users["doctor"].id
    assert row["acknowledged_at"] is not None
    assert row["acknowledged_at"] > seen_at

    ack = client.get(ack_url("PAT-002"))
    assert ack.status_code == 200
    assert ack.json()["alert"]["state"] == "handled"
    assert ack.json()["alert"]["by"] == DOCTOR_NAME


# =================================================================================
# GET /api/patients/{identifier}/alerts/acknowledgement
# =================================================================================


# --- AC9: states ------------------------------------------------------------------


def test_ac9_no_alert_returns_exactly_null(as_doctor, db):
    """AC9 (FR-005): a patient with no alert -> exactly {"alert": null}."""
    response = client.get(ack_url("PAT-001"))
    assert response.status_code == 200
    assert response.json() == {"alert": None}


def test_ac9_open_not_seen(as_doctor, db):
    """AC9 (FR-005): an open alert no one has seen -> state not_seen, by null, at null."""
    alert_id = seed_alert(db, "PAT-001")
    response = client.get(ack_url("PAT-001"))
    assert response.status_code == 200
    assert response.json() == {
        "alert": {"id": alert_id, "status": "open", "state": "not_seen", "by": None, "at": None},
    }


def test_ac9_open_seen_by_nurse(as_doctor, db, users):
    """AC9 (FR-005): an open alert with a stored nurse -> state seen, by = nurse full name, at = stored time."""
    seen_at = T0 + timedelta(minutes=3)
    alert_id = seed_alert(db, "PAT-001", by=users["nurse"].id, at=seen_at)
    body = client.get(ack_url("PAT-001")).json()
    assert body["alert"]["id"] == alert_id
    assert body["alert"]["status"] == "open"
    assert body["alert"]["state"] == "seen"
    assert body["alert"]["by"] == NURSE_NAME
    assert _naive(body["alert"]["at"]) == seen_at


def test_ac9_acknowledged_handled_by_doctor(as_nurse, db, users):
    """AC9 (FR-005): an acknowledged alert -> state handled, by = doctor full name, at = stored time."""
    handled_at = T0 + timedelta(minutes=4)
    alert_id = seed_alert(db, "PAT-001", status="acknowledged", by=users["doctor"].id, at=handled_at)
    body = client.get(ack_url("PAT-001")).json()
    assert body["alert"]["id"] == alert_id
    assert body["alert"]["status"] == "acknowledged"
    assert body["alert"]["state"] == "handled"
    assert body["alert"]["by"] == DOCTOR_NAME
    assert _naive(body["alert"]["at"]) == handled_at


def test_ac9_edge_acknowledged_without_person(as_doctor, db):
    """AC9 edge case: acknowledged with acknowledged_by_id null -> state handled, by null; never an error."""
    alert_id = seed_alert(db, "PAT-001", status="acknowledged")
    response = client.get(ack_url("PAT-001"))
    assert response.status_code == 200
    body = response.json()
    assert body["alert"]["id"] == alert_id
    assert body["alert"]["state"] == "handled"
    assert body["alert"]["by"] is None


# --- AC9 / FR-005: which alert is shown -------------------------------------------


def test_ac9_older_open_shown_before_newer_acknowledged(as_doctor, db, users):
    """AC9 (FR-005): an older open alert is shown before a newer acknowledged one."""
    open_id = seed_alert(db, "PAT-001", created_at=T0)
    seed_alert(
        db, "PAT-001", status="acknowledged", created_at=T0 + timedelta(hours=1),
        by=users["doctor"].id, at=T0 + timedelta(hours=1, minutes=5),
    )
    body = client.get(ack_url("PAT-001")).json()
    assert body["alert"]["id"] == open_id
    assert body["alert"]["state"] == "not_seen"


def test_ac9_newest_open_shown_among_open(as_doctor, db):
    """AC9 (FR-005): with several open alerts the newest by created_at is shown (not insertion order)."""
    newer = seed_alert(db, "PAT-001", created_at=T0 + timedelta(hours=2))
    seed_alert(db, "PAT-001", created_at=T0)
    body = client.get(ack_url("PAT-001")).json()
    assert body["alert"]["id"] == newer


def test_ac9_newest_shown_when_none_open(as_doctor, db, users):
    """AC9 (FR-005): when no alert is open, the newest alert is shown."""
    newer = seed_alert(
        db, "PAT-001", status="acknowledged", created_at=T0 + timedelta(hours=1),
        by=users["doctor"].id, at=T0 + timedelta(hours=1, minutes=1),
    )
    seed_alert(
        db, "PAT-001", status="acknowledged", created_at=T0,
        by=users["doctor"].id, at=T0 + timedelta(minutes=1),
    )
    body = client.get(ack_url("PAT-001")).json()
    assert body["alert"]["id"] == newer
    assert body["alert"]["state"] == "handled"


def test_ac9_equal_created_at_broken_by_id_desc(as_doctor, db):
    """AC9 (FR-005): two open alerts with the same created_at -> the higher id is shown."""
    lower = seed_alert(db, "PAT-001", created_at=T0)
    higher = seed_alert(db, "PAT-001", created_at=T0)
    assert higher > lower
    body = client.get(ack_url("PAT-001")).json()
    assert body["alert"]["id"] == higher


def test_ac9_only_this_patients_alerts(as_doctor, db):
    """AC9 (FR-005): another patient's alert is never shown for this patient."""
    seed_alert(db, "PAT-002")
    response = client.get(ack_url("PAT-001"))
    assert response.json() == {"alert": None}


# --- AC9: who may read, unknown patient -------------------------------------------


def test_ac9_doctor_and_nurse_may_read_200(db, users):
    """AC9 (FR-005): both a doctor and a nurse get 200."""
    seed_alert(db, "PAT-001")
    for user in (users["doctor"], users["nurse"]):
        sign_in(user)
        response = client.get(ack_url("PAT-001"))
        assert response.status_code == 200, user.role
        assert response.json()["alert"]["state"] == "not_seen"


def test_ac9_get_no_token_401(db, users):
    """AC9 (FR-005): signed out -> 401 with the existing auth message."""
    assert app.auth.get_current_user not in app.main.app.dependency_overrides
    response = client.get(ack_url("PAT-001"))
    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED


def test_ac9_get_unknown_code_404(as_doctor, db):
    """AC9 (FR-005): an unknown patient code -> 404 "Patient not found"."""
    response = client.get(ack_url("PAT-999"))
    assert response.status_code == 404
    assert response.json() == NOT_FOUND


@pytest.mark.parametrize("code", ["abc", "pat-001"], ids=["abc", "lower"])
def test_ac9_get_malformed_code_404(as_doctor, db, code):
    """AC9 (FR-005): a code not in the patient code format -> 404 "Patient not found"."""
    response = client.get(ack_url(code))
    assert response.status_code == 404
    assert response.json() == NOT_FOUND


def test_edge_discharged_patient_get_200(as_doctor, db, users):
    """Edge case: reading the state of a discharged patient works like an active one."""
    alert_id = seed_alert(db, "PAT-003", by=users["nurse"].id, at=T0)
    body = client.get(ack_url("PAT-003")).json()
    assert body["alert"]["id"] == alert_id
    assert body["alert"]["state"] == "seen"


# --- AC10: response shape and safe body -------------------------------------------


@pytest.mark.parametrize("state", ["not_seen", "seen", "handled"])
def test_ac10_exact_keys_and_safe_body(as_doctor, db, users, state):
    """AC10 (FR-006): top-level keys exactly {alert}; alert keys exactly {id, status, state, by, at};
    the raw body holds no user id field, no username of any user and not the machine tag."""
    if state == "not_seen":
        seed_alert(db, "PAT-001")
    elif state == "seen":
        seed_alert(db, "PAT-001", by=users["nurse"].id, at=T0)
    else:
        seed_alert(db, "PAT-001", status="acknowledged", by=users["doctor"].id, at=T0)
    response = client.get(ack_url("PAT-001"))
    assert response.status_code == 200
    body = response.json()
    assert set(body) == TOP_KEYS
    assert set(body["alert"]) == ALERT_KEYS
    assert body["alert"]["state"] == state
    _assert_safe_body(response.text)


def test_ac10_exact_keys_with_no_alert(as_doctor, db):
    """AC10 (FR-006): the top-level shape is the same with no alert."""
    response = client.get(ack_url("PAT-001"))
    assert set(response.json()) == TOP_KEYS
    _assert_safe_body(response.text)


def test_ac10_get_database_error_503_logged_by_type_only(as_doctor, db, caplog):
    """AC10 (FR-006): a forced SQLAlchemyError on the GET -> 503 "Service unavailable";
    the log line holds only the error type name."""
    seed_alert(db, "PAT-001")
    _use_session(db, BrokenSession)
    with caplog.at_level(logging.WARNING):
        response = client.get(ack_url("PAT-001"))
    assert response.status_code == 503
    assert response.json() == SERVICE_UNAVAILABLE
    assert DB_SECRET not in response.text
    _assert_logged_by_type_only(caplog)


def test_ac10_get_no_database_url_503(users, monkeypatch):
    """AC10: DATABASE_URL unset and get_session not overridden -> 503 fixed message."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    sign_in(users["doctor"])
    assert app.patients.get_session not in app.main.app.dependency_overrides
    response = client.get(ack_url("PAT-001"))
    assert response.status_code == 503
    assert response.json() == SERVICE_UNAVAILABLE


# --- FR-005: GET writes nothing ---------------------------------------------------


def test_fr005_get_writes_nothing(db, users):
    """FR-005 (AC9): repeated GETs by doctor and nurse send no INSERT/UPDATE/DELETE and leave
    every alert row, the counts and the triage level unchanged."""
    open_id = seed_alert(db, "PAT-001")
    acked_id = seed_alert(
        db, "PAT-001", status="acknowledged", created_at=T0 + timedelta(hours=1),
        by=users["doctor"].id, at=T0 + timedelta(hours=1, minutes=1),
    )
    rows_before = {i: _row(db, i) for i in (open_id, acked_id)}
    counts_before = _counts(db)

    with StatementRecorder(db) as recorder:
        for user in (users["doctor"], users["nurse"], users["doctor"]):
            sign_in(user)
            response = client.get(ack_url("PAT-001"))
            assert response.status_code == 200

    assert _writes(recorder.statements) == []
    assert {i: _row(db, i) for i in rows_before} == rows_before
    assert _counts(db) == counts_before
    assert _triage_level(db, "PAT-001") == 3
