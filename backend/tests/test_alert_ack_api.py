"""Tests for the alert acknowledgement API (US-07, task T002).

Covers AC1-AC10, FR-002, FR-003, FR-005 and FR-006 of
specs/023-alert-acknowledgement/spec.md.
Contract: specs/023-alert-acknowledgement/contracts/alert-ack-api.md.

POST /api/patients/{identifier}/alerts/{alert_id}/seen lets a nurse mark an open
alert as seen (stores who and when, ``status`` stays ``open``; first nurse
wins). GET /api/patients/{identifier}/alerts/acknowledgement returns the
patient's shown alert (newest open alert, else newest alert) to any signed-in
clinician. Answers never carry user ids, usernames, the patient's internal id or
the alert's machine tag.

Synthetic data only: fictitious patients (PAT-NNN), two synthetic nurses and a
synthetic doctor. No real database and no network: every test uses an in-memory
SQLite engine (StaticPool so the TestClient's thread shares it), and the autouse
``isolate_database`` fixture (conftest.py) removes ``DATABASE_URL`` and clears
the dependency overrides after each test. The fixture pattern is copied (not
imported) from test_retriage_api.py. The literal scoring-system token is kept
out of this file so the Principle V confinement guard stays green.
"""

import logging
import os
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

import app.alert_ack_api
import app.auth
import app.main
import app.patients
from app.models import Alert, Base, Patient, TriageEvent, User

PATIENT_NOT_FOUND = {"detail": "Patient not found"}
ALERT_NOT_FOUND = {"detail": "Alert not found"}
ALREADY_HANDLED = {"detail": "Alert already handled"}
ONLY_NURSES = {"detail": "Only nurses can mark alerts as seen"}
NOT_AUTHENTICATED = {"detail": "Not authenticated"}
SERVICE_UNAVAILABLE = {"detail": "Service unavailable"}

# Stored message as US-04 writes it: the leading machine tag, then the human
# sentence (format copied from app.retriage.build_message via test_retriage_api.py).
MACHINE_TAG = "[retriage band=high;suggested=1]"
MESSAGE = f"{MACHINE_TAG} Risk is high. Suggest re-triage from Triage III to Triage I."

NURSE_NAME = "Enf. Ficticia Prueba"
NURSE2_NAME = "Enf. Segunda Ficticia"
DOCTOR_NAME = "Dr. Ficticio Prueba"
# Usernames that must never reach a response body: the synthetic test users and
# the demo users of app/seed_demo_users.py.
USERNAMES = [
    "synthetic.nurse", "synthetic.nurse2", "synthetic.doctor",
    "demo.nurse", "demo.doctor",
]

ALERT_KEYS = {"id", "status", "state", "by", "at"}

T0 = datetime(2026, 11, 20, 9, 0, tzinfo=timezone.utc)
SEEN_AT = datetime(2026, 11, 20, 9, 15, tzinfo=timezone.utc)

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
            identifier="PAT-001", name="Paciente Ficticio PAT-001", age=50, sex="other",
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


# --- Helpers ----------------------------------------------------------------------


def _patient_id(engine, code):
    with Session(engine) as session:
        return session.scalar(select(Patient.id).where(Patient.identifier == code))


def seed_alert(
    engine, code, *, status="open", created_at=T0,
    acknowledged_by_id=None, acknowledged_at=None, severity="high",
):
    """Add one synthetic alert row directly with the chosen values; return its id."""
    pid = _patient_id(engine, code)
    with Session(engine) as session:
        alert = Alert(
            patient_id=pid, severity=severity, message=MESSAGE, status=status,
            created_at=created_at, acknowledged_by_id=acknowledged_by_id,
            acknowledged_at=acknowledged_at,
        )
        session.add(alert)
        session.commit()
        return alert.id


def _row(engine, alert_id):
    """Return the stored alert columns as a dict (naive datetimes as SQLite returns them)."""
    with Session(engine) as session:
        alert = session.get(Alert, alert_id)
        return {
            "patient_id": alert.patient_id,
            "severity": alert.severity,
            "message": alert.message,
            "status": alert.status,
            "created_at": alert.created_at,
            "acknowledged_by_id": alert.acknowledged_by_id,
            "acknowledged_at": alert.acknowledged_at,
        }


def _naive(value):
    return value.replace(tzinfo=None) if value is not None else None


def _counts(engine):
    with Session(engine) as session:
        alerts = session.scalar(select(func.count()).select_from(Alert))
        events = session.scalar(select(func.count()).select_from(TriageEvent))
    return alerts, events


def _triage_level(engine, code):
    with Session(engine) as session:
        return session.scalar(select(Patient.triage_level).where(Patient.identifier == code))


def _snapshot(engine):
    """Everything a request must not change: all alert rows, patients' levels and event count."""
    with Session(engine) as session:
        alerts = session.execute(
            select(
                Alert.id, Alert.patient_id, Alert.severity, Alert.message, Alert.status,
                Alert.created_at, Alert.acknowledged_by_id, Alert.acknowledged_at,
            ).order_by(Alert.id)
        ).all()
        patients = session.execute(
            select(Patient.identifier, Patient.triage_level, Patient.status).order_by(Patient.id)
        ).all()
        events = session.scalar(select(func.count()).select_from(TriageEvent))
    return [tuple(a) for a in alerts], [tuple(p) for p in patients], events


def _assert_recent(value):
    """The stored time is "now" (within a few minutes, UTC)."""
    assert value is not None
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    assert abs(_naive(value) - now) < timedelta(minutes=5)


def _assert_safe_body(response):
    """AC10 / FR-006: no user id field, no username, no machine tag in the raw body."""
    text = response.text
    for field in ("acknowledged_by_id", "user_id", "patient_id", "username", "severity", "message"):
        assert field not in text
    for username in USERNAMES:
        assert username not in text
    assert MACHINE_TAG not in text
    assert "[retriage" not in text
    assert "suggested=" not in text


# --- AC1: a nurse marks an open alert as seen --------------------------------------


def test_ac1_nurse_marks_open_alert_seen_200(as_nurse, db):
    """AC1: 200; the row stores the nurse id and the time; status stays open; body is the seen alert."""
    alert_id = seed_alert(db, "PAT-001")
    response = client.post(seen_url("PAT-001", alert_id))
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"alert"}
    alert = body["alert"]
    assert set(alert) == ALERT_KEYS
    assert alert["id"] == alert_id
    assert alert["status"] == "open"
    assert alert["state"] == "seen"
    assert alert["by"] == NURSE_NAME
    assert alert["at"] is not None

    row = _row(db, alert_id)
    assert row["acknowledged_by_id"] == as_nurse.id
    _assert_recent(row["acknowledged_at"])
    assert row["status"] == "open"


def test_ac1_ac10_seen_answer_is_safe(as_nurse, db):
    """AC1/AC10 (FR-006): the 200 answer of POST .../seen has no user id, username or machine tag."""
    alert_id = seed_alert(db, "PAT-001")
    response = client.post(seen_url("PAT-001", alert_id))
    assert response.status_code == 200
    _assert_safe_body(response)


# --- AC2 / AC3: interaction with US-04 ------------------------------------------------


def test_ac2_seen_alert_still_listed_open_in_suggestions(as_nurse, db, users):
    """AC2: after a nurse's seen marker, GET .../suggestions still lists the alert as open."""
    alert_id = seed_alert(db, "PAT-001")
    assert client.post(seen_url("PAT-001", alert_id)).status_code == 200

    sign_in(users["doctor"])
    response = client.get("/api/patients/PAT-001/suggestions")
    assert response.status_code == 200
    suggestions = response.json()["suggestions"]
    assert [s["id"] for s in suggestions] == [alert_id]
    assert suggestions[0]["status"] == "open"


def test_ac3_doctor_dismiss_after_seen_overwrites_marker(db, users):
    """AC3: a doctor dismisses a seen alert -> 200; acknowledged_by_id becomes the doctor, with a new time."""
    alert_id = seed_alert(
        db, "PAT-001", acknowledged_by_id=users["nurse"].id, acknowledged_at=SEEN_AT,
    )
    sign_in(users["doctor"])
    response = client.post(f"/api/patients/PAT-001/suggestions/{alert_id}/dismiss")
    assert response.status_code == 200

    row = _row(db, alert_id)
    assert row["status"] == "acknowledged"
    assert row["acknowledged_by_id"] == users["doctor"].id
    assert _naive(row["acknowledged_at"]) != _naive(SEEN_AT)
    _assert_recent(row["acknowledged_at"])


def test_ac3_doctor_accept_after_seen_overwrites_marker(db, users):
    """AC3: a doctor accepts a seen alert on a second patient -> 200; the doctor and a new time are stored."""
    alert_id = seed_alert(
        db, "PAT-002", acknowledged_by_id=users["nurse"].id, acknowledged_at=SEEN_AT,
    )
    sign_in(users["doctor"])
    response = client.post(f"/api/patients/PAT-002/suggestions/{alert_id}/accept")
    assert response.status_code == 200

    row = _row(db, alert_id)
    assert row["status"] == "acknowledged"
    assert row["acknowledged_by_id"] == users["doctor"].id
    assert _naive(row["acknowledged_at"]) != _naive(SEEN_AT)
    _assert_recent(row["acknowledged_at"])


def test_ac2_ac3_full_flow_nurse_seen_then_doctor_dismiss(as_nurse, db, users):
    """AC2/AC3: nurse marks seen through the API, then the doctor dismisses; GET shows handled by the doctor."""
    alert_id = seed_alert(db, "PAT-001")
    assert client.post(seen_url("PAT-001", alert_id)).status_code == 200
    sign_in(users["doctor"])
    assert client.post(f"/api/patients/PAT-001/suggestions/{alert_id}/dismiss").status_code == 200
    body = client.get(ack_url("PAT-001")).json()
    assert body["alert"]["state"] == "handled"
    assert body["alert"]["by"] == DOCTOR_NAME


# --- AC4: only nurses may mark as seen ---------------------------------------------


def test_ac4_seen_without_token_401(db, users):
    """AC4: POST .../seen signed out -> 401; nothing stored."""
    alert_id = seed_alert(db, "PAT-001")
    assert app.auth.get_current_user not in app.main.app.dependency_overrides
    response = client.post(seen_url("PAT-001", alert_id))
    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED
    row = _row(db, alert_id)
    assert row["acknowledged_by_id"] is None
    assert row["acknowledged_at"] is None


def test_ac4_doctor_seen_403_nothing_stored(as_doctor, db):
    """AC4: a doctor -> 403 with the exact fixed message; nothing stored."""
    alert_id = seed_alert(db, "PAT-001")
    before = _snapshot(db)
    response = client.post(seen_url("PAT-001", alert_id))
    assert response.status_code == 403
    assert response.json() == ONLY_NURSES
    assert _snapshot(db) == before


# --- AC5: unknown patient or alert ----------------------------------------------------


@pytest.mark.parametrize("code", ["PAT-999", "abc"])
def test_ac5_seen_unknown_or_malformed_patient_404(as_nurse, db, code):
    """AC5: unknown code and malformed code -> 404 'Patient not found'; nothing stored."""
    alert_id = seed_alert(db, "PAT-001")
    before = _snapshot(db)
    response = client.post(seen_url(code, alert_id))
    assert response.status_code == 404
    assert response.json() == PATIENT_NOT_FOUND
    assert _snapshot(db) == before


def test_ac5_seen_unknown_alert_404(as_nurse, db):
    """AC5: unknown alert id -> 404 'Alert not found'; nothing stored."""
    seed_alert(db, "PAT-001")
    before = _snapshot(db)
    response = client.post(seen_url("PAT-001", 99999))
    assert response.status_code == 404
    assert response.json() == ALERT_NOT_FOUND
    assert _snapshot(db) == before


def test_ac5_seen_cross_patient_alert_404_other_row_unchanged(as_nurse, db):
    """AC5 (FR-003): patient B's alert id on patient A's path -> 404; patient B's row is unchanged."""
    seed_alert(db, "PAT-001")
    other_id = seed_alert(db, "PAT-002")
    response = client.post(seen_url("PAT-001", other_id))
    assert response.status_code == 404
    assert response.json() == ALERT_NOT_FOUND
    row = _row(db, other_id)
    assert row["acknowledged_by_id"] is None
    assert row["acknowledged_at"] is None
    assert row["status"] == "open"


# --- AC6: first nurse wins ----------------------------------------------------------


def test_ac6_second_nurse_409_first_marker_kept(as_nurse, db, users):
    """AC6: nurse 1 marks seen; nurse 2 tries -> 409 'Alert already handled'; stored person and time unchanged."""
    alert_id = seed_alert(db, "PAT-001")
    assert client.post(seen_url("PAT-001", alert_id)).status_code == 200
    first = _row(db, alert_id)

    sign_in(users["nurse2"])
    response = client.post(seen_url("PAT-001", alert_id))
    assert response.status_code == 409
    assert response.json() == ALREADY_HANDLED
    after = _row(db, alert_id)
    assert after["acknowledged_by_id"] == users["nurse"].id
    assert after["acknowledged_at"] == first["acknowledged_at"]
    assert after == first


def test_ac6_seeded_seen_alert_409_unchanged(db, users):
    """AC6: an alert already seen (seeded) -> 409 for another nurse; the stored nurse and time stay."""
    alert_id = seed_alert(
        db, "PAT-001", acknowledged_by_id=users["nurse"].id, acknowledged_at=SEEN_AT,
    )
    sign_in(users["nurse2"])
    before = _snapshot(db)
    response = client.post(seen_url("PAT-001", alert_id))
    assert response.status_code == 409
    assert response.json() == ALREADY_HANDLED
    assert _snapshot(db) == before


def test_ac6_acknowledged_alert_409(as_nurse, db, users):
    """AC6: an alert acknowledged by a doctor -> 409; nothing changes."""
    alert_id = seed_alert(
        db, "PAT-001", status="acknowledged",
        acknowledged_by_id=users["doctor"].id, acknowledged_at=SEEN_AT,
    )
    before = _snapshot(db)
    response = client.post(seen_url("PAT-001", alert_id))
    assert response.status_code == 409
    assert response.json() == ALREADY_HANDLED
    assert _snapshot(db) == before


# --- AC7: check order 401 -> 403 -> 404 -> 409 -> 200 --------------------------------


def test_ac7_doctor_unknown_patient_403_before_404(as_doctor, db):
    """AC7: a doctor on an unknown patient code gets 403, not 404."""
    response = client.post(seen_url("PAT-999", 1))
    assert response.status_code == 403
    assert response.json() == ONLY_NURSES


def test_ac7_unknown_alert_404_before_409(as_nurse, db, users):
    """AC7: unknown alert on a patient whose other alert is acknowledged -> 404, not 409."""
    seed_alert(
        db, "PAT-001", status="acknowledged",
        acknowledged_by_id=users["doctor"].id, acknowledged_at=SEEN_AT,
    )
    response = client.post(seen_url("PAT-001", 99999))
    assert response.status_code == 404
    assert response.json() == ALERT_NOT_FOUND


def test_ac7_signed_out_unknown_patient_401_first(db, users):
    """AC7: signed out on an unknown patient -> 401 before any other check."""
    response = client.post(seen_url("PAT-999", 1))
    assert response.status_code == 401


# --- AC8: nothing else changes ---------------------------------------------------------


def test_ac8_seen_changes_only_marker_columns(as_nurse, db):
    """AC8 (FR-002): after a 200 the triage level, triage events count, alerts count and the
    alert's severity, message, status and created_at are unchanged."""
    alert_id = seed_alert(db, "PAT-001", severity="medium")
    other_id = seed_alert(db, "PAT-002")
    before_row = _row(db, alert_id)
    before_other = _row(db, other_id)
    before_counts = _counts(db)

    response = client.post(seen_url("PAT-001", alert_id))
    assert response.status_code == 200

    after_row = _row(db, alert_id)
    for column in ("patient_id", "severity", "message", "status", "created_at"):
        assert after_row[column] == before_row[column]
    assert _triage_level(db, "PAT-001") == 3
    assert _counts(db) == before_counts
    assert _row(db, other_id) == before_other


def test_edge_discharged_patient_seen_200(as_nurse, db):
    """Edge case (AC1/AC8): a discharged patient behaves the same: 200 seen, status open, nothing else changes."""
    alert_id = seed_alert(db, "PAT-003")
    before_counts = _counts(db)
    response = client.post(seen_url("PAT-003", alert_id))
    assert response.status_code == 200
    assert response.json()["alert"]["state"] == "seen"
    row = _row(db, alert_id)
    assert row["acknowledged_by_id"] == as_nurse.id
    assert row["status"] == "open"
    assert _counts(db) == before_counts
    assert _triage_level(db, "PAT-003") == 3


def test_edge_discharged_patient_get_200(as_doctor, db):
    """Edge case (AC9): GET on a discharged patient answers 200 like an active one."""
    alert_id = seed_alert(db, "PAT-003")
    response = client.get(ack_url("PAT-003"))
    assert response.status_code == 200
    assert response.json()["alert"]["id"] == alert_id


# --- AC9: reading the acknowledgement state ------------------------------------------


def test_ac9_no_alert_is_null(as_doctor, db):
    """AC9: a patient with no alert -> exactly {"alert": null}."""
    response = client.get(ack_url("PAT-001"))
    assert response.status_code == 200
    assert response.json() == {"alert": None}


def test_ac9_open_not_seen(as_doctor, db):
    """AC9: open unseen alert -> state not_seen, by null, at null."""
    alert_id = seed_alert(db, "PAT-001")
    response = client.get(ack_url("PAT-001"))
    assert response.status_code == 200
    assert response.json() == {
        "alert": {"id": alert_id, "status": "open", "state": "not_seen", "by": None, "at": None},
    }


def test_ac9_open_seen(as_doctor, db, users):
    """AC9: open seen alert -> state seen, by = nurse full name, at = stored time."""
    alert_id = seed_alert(
        db, "PAT-001", acknowledged_by_id=users["nurse"].id, acknowledged_at=SEEN_AT,
    )
    alert = client.get(ack_url("PAT-001")).json()["alert"]
    assert alert["id"] == alert_id
    assert alert["status"] == "open"
    assert alert["state"] == "seen"
    assert alert["by"] == NURSE_NAME
    assert alert["at"].startswith("2026-11-20T09:15:00")


def test_ac9_acknowledged_handled_by_doctor(as_nurse, db, users):
    """AC9: acknowledged alert -> state handled, by = doctor full name."""
    alert_id = seed_alert(
        db, "PAT-001", status="acknowledged",
        acknowledged_by_id=users["doctor"].id, acknowledged_at=SEEN_AT,
    )
    alert = client.get(ack_url("PAT-001")).json()["alert"]
    assert alert["id"] == alert_id
    assert alert["status"] == "acknowledged"
    assert alert["state"] == "handled"
    assert alert["by"] == DOCTOR_NAME
    assert alert["at"].startswith("2026-11-20T09:15:00")


def test_edge_acknowledged_without_person_by_null(as_doctor, db):
    """Edge case (AC9): acknowledged with acknowledged_by_id null -> state handled, by null."""
    alert_id = seed_alert(db, "PAT-001", status="acknowledged")
    alert = client.get(ack_url("PAT-001")).json()["alert"]
    assert alert["id"] == alert_id
    assert alert["state"] == "handled"
    assert alert["by"] is None


def test_ac9_older_open_beats_newer_acknowledged(as_doctor, db, users):
    """AC9 (FR-005): an older open alert is shown before a newer acknowledged one."""
    open_id = seed_alert(db, "PAT-001", created_at=T0)
    seed_alert(
        db, "PAT-001", status="acknowledged", created_at=T0 + timedelta(hours=1),
        acknowledged_by_id=users["doctor"].id, acknowledged_at=SEEN_AT,
    )
    alert = client.get(ack_url("PAT-001")).json()["alert"]
    assert alert["id"] == open_id
    assert alert["state"] == "not_seen"


def test_ac9_newest_open_among_open(as_doctor, db):
    """AC9 (FR-005): with several open alerts the newest open one is shown."""
    seed_alert(db, "PAT-001", created_at=T0)
    newest = seed_alert(db, "PAT-001", created_at=T0 + timedelta(minutes=5))
    seed_alert(db, "PAT-001", created_at=T0 - timedelta(minutes=5))
    assert client.get(ack_url("PAT-001")).json()["alert"]["id"] == newest


def test_ac9_newest_when_none_open(as_doctor, db, users):
    """AC9 (FR-005): when no alert is open, the newest alert is shown."""
    seed_alert(db, "PAT-001", status="acknowledged", created_at=T0 + timedelta(hours=2))
    seed_alert(db, "PAT-001", status="acknowledged", created_at=T0)
    newest_seeded_last = seed_alert(
        db, "PAT-001", status="acknowledged", created_at=T0 + timedelta(hours=3),
        acknowledged_by_id=users["doctor"].id, acknowledged_at=SEEN_AT,
    )
    alert = client.get(ack_url("PAT-001")).json()["alert"]
    assert alert["id"] == newest_seeded_last
    assert alert["by"] == DOCTOR_NAME


def test_ac9_equal_created_at_broken_by_id_desc(as_doctor, db):
    """AC9 (FR-005): two open alerts with the same created_at -> the higher id is shown."""
    lower = seed_alert(db, "PAT-001", created_at=T0)
    higher = seed_alert(db, "PAT-001", created_at=T0)
    assert higher > lower
    assert client.get(ack_url("PAT-001")).json()["alert"]["id"] == higher


def test_ac9_only_own_patient_alerts(as_doctor, db):
    """AC9: another patient's alerts are never shown."""
    seed_alert(db, "PAT-002")
    assert client.get(ack_url("PAT-001")).json() == {"alert": None}


@pytest.mark.parametrize("role", ["doctor", "nurse"])
def test_ac9_get_200_for_doctor_and_nurse(db, users, role):
    """AC9: GET answers 200 for both a doctor and a nurse."""
    sign_in(users[role])
    alert_id = seed_alert(db, "PAT-001")
    response = client.get(ack_url("PAT-001"))
    assert response.status_code == 200
    assert response.json()["alert"]["id"] == alert_id


def test_ac9_get_without_token_401(db, users):
    """AC9: GET signed out -> 401."""
    assert app.auth.get_current_user not in app.main.app.dependency_overrides
    response = client.get(ack_url("PAT-001"))
    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED


@pytest.mark.parametrize("code", ["PAT-999", "abc"])
def test_ac9_get_unknown_patient_404(as_doctor, db, code):
    """AC9: GET with an unknown or malformed code -> 404 'Patient not found'."""
    response = client.get(ack_url(code))
    assert response.status_code == 404
    assert response.json() == PATIENT_NOT_FOUND


def test_ac9_get_writes_nothing(as_nurse, db, users):
    """AC9: GET is read-only; every row value is unchanged."""
    seed_alert(db, "PAT-001")
    seed_alert(db, "PAT-001", acknowledged_by_id=users["nurse"].id, acknowledged_at=SEEN_AT)
    seed_alert(db, "PAT-002", status="acknowledged")
    before = _snapshot(db)
    for _ in range(2):
        assert client.get(ack_url("PAT-001")).status_code == 200
        assert client.get(ack_url("PAT-002")).status_code == 200
    assert _snapshot(db) == before


# --- AC10: safe answers -------------------------------------------------------------


@pytest.mark.parametrize("state", ["not_seen", "seen", "handled"])
def test_ac10_get_exact_keys_and_safe_body(as_doctor, db, users, state):
    """AC10 (FR-006): top-level keys exactly {alert}, alert keys exactly {id,status,state,by,at};
    the raw body has no user id field, no username and no machine tag."""
    if state == "not_seen":
        seed_alert(db, "PAT-001")
    elif state == "seen":
        seed_alert(db, "PAT-001", acknowledged_by_id=users["nurse"].id, acknowledged_at=SEEN_AT)
    else:
        seed_alert(
            db, "PAT-001", status="acknowledged",
            acknowledged_by_id=users["doctor"].id, acknowledged_at=SEEN_AT,
        )
    response = client.get(ack_url("PAT-001"))
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"alert"}
    assert set(body["alert"]) == ALERT_KEYS
    assert body["alert"]["state"] == state
    _assert_safe_body(response)


DB_SECRET = "SECRET-DB-DETAIL-host.example.invalid"


class BrokenSession(Session):
    """A session whose every query raises a synthetic SQLAlchemyError carrying a secret detail
    (same approach as test_prediction_api.py)."""

    def execute(self, *args, **kwargs):
        raise SQLAlchemyError(DB_SECRET)

    def scalars(self, *args, **kwargs):
        raise SQLAlchemyError(DB_SECRET)

    def scalar(self, *args, **kwargs):
        raise SQLAlchemyError(DB_SECRET)

    def get(self, *args, **kwargs):
        raise SQLAlchemyError(DB_SECRET)


class FailingCommitSession(Session):
    """A session that runs queries normally but whose commit raises a synthetic SQLAlchemyError."""

    def commit(self):
        raise SQLAlchemyError(DB_SECRET)


def _use_session_class(engine, cls):
    def override():
        session = cls(engine)
        try:
            yield session
        finally:
            session.close()

    app.main.app.dependency_overrides[app.patients.get_session] = override


def _assert_logged_by_type_only(caplog, code):
    warnings = [r for r in caplog.records if r.levelno >= logging.WARNING]
    assert warnings, "the database failure must be logged"
    assert any("SQLAlchemyError" in r.getMessage() for r in warnings)
    for record in warnings:
        message = record.getMessage()
        assert DB_SECRET not in message
        assert code not in message
        assert record.exc_info is None  # no stack trace in the log


def test_ac10_seen_database_error_503_nothing_stored(as_nurse, db, caplog):
    """AC10: a forced SQLAlchemyError on POST .../seen -> 503 'Service unavailable';
    nothing stored; the log holds only the error type name."""
    alert_id = seed_alert(db, "PAT-001")
    before = _snapshot(db)
    _use_session_class(db, BrokenSession)
    with caplog.at_level(logging.WARNING):
        response = client.post(seen_url("PAT-001", alert_id))
    assert response.status_code == 503
    assert response.json() == SERVICE_UNAVAILABLE
    assert DB_SECRET not in response.text
    assert _snapshot(db) == before
    _assert_logged_by_type_only(caplog, "PAT-001")


def test_ac10_seen_commit_error_503_rolled_back(as_nurse, db, caplog):
    """AC10: the update runs but the commit fails -> 503; the marker is rolled back (nothing stored)."""
    alert_id = seed_alert(db, "PAT-001")
    before = _snapshot(db)
    _use_session_class(db, FailingCommitSession)
    with caplog.at_level(logging.WARNING):
        response = client.post(seen_url("PAT-001", alert_id))
    assert response.status_code == 503
    assert response.json() == SERVICE_UNAVAILABLE
    assert DB_SECRET not in response.text
    assert _snapshot(db) == before
    row = _row(db, alert_id)
    assert row["acknowledged_by_id"] is None
    assert row["acknowledged_at"] is None
    _assert_logged_by_type_only(caplog, "PAT-001")


def test_ac10_get_database_error_503(as_doctor, db, caplog):
    """AC10: a forced SQLAlchemyError on GET .../acknowledgement -> 503; logged by error type only."""
    seed_alert(db, "PAT-001")
    _use_session_class(db, BrokenSession)
    with caplog.at_level(logging.WARNING):
        response = client.get(ack_url("PAT-001"))
    assert response.status_code == 503
    assert response.json() == SERVICE_UNAVAILABLE
    assert DB_SECRET not in response.text
    _assert_logged_by_type_only(caplog, "PAT-001")


# --- AC5 / AC10: re-run after security fixes (T012) ---------------------------------


@pytest.mark.parametrize("alert_id", [0, -1, 2_147_483_648, 3_000_000_000])
def test_ac5_seen_out_of_range_alert_id_404(as_nurse, db, alert_id):
    """AC5: an alert id outside 1..2_147_483_647 (Postgres INTEGER) -> 404 'Alert not found',
    never 503; nothing stored."""
    seed_alert(db, "PAT-001")
    before = _snapshot(db)
    response = client.post(seen_url("PAT-001", alert_id))
    assert response.status_code == 404
    assert response.json() == ALERT_NOT_FOUND
    assert _snapshot(db) == before


def test_ac5_seen_unknown_patient_huge_alert_id_patient_404_first(as_nurse, db):
    """AC5/AC7: unknown patient with an out-of-range alert id -> 404 'Patient not found'
    (the patient is checked before the alert id); nothing stored."""
    seed_alert(db, "PAT-001")
    before = _snapshot(db)
    response = client.post(seen_url("PAT-999", 3_000_000_000))
    assert response.status_code == 404
    assert response.json() == PATIENT_NOT_FOUND
    assert _snapshot(db) == before


def test_ac10_seen_answer_build_error_after_update_503_rolled_back(
    as_nurse, db, caplog, monkeypatch,
):
    """AC10: the UPDATE runs, then building the 200 answer fails -> 503 'Service unavailable';
    the marker is rolled back (acknowledged_by_id and acknowledged_at stay null)."""
    alert_id = seed_alert(db, "PAT-001")
    before = _snapshot(db)

    def failing_shown_alert(session, patient_id):
        raise SQLAlchemyError(DB_SECRET)

    # Only the POST below runs while the patch is active, so only the POST path fails.
    monkeypatch.setattr(app.alert_ack_api, "_shown_alert", failing_shown_alert)
    with caplog.at_level(logging.WARNING):
        response = client.post(seen_url("PAT-001", alert_id))
    monkeypatch.undo()

    assert response.status_code == 503
    assert response.json() == SERVICE_UNAVAILABLE
    assert DB_SECRET not in response.text
    row = _row(db, alert_id)
    assert row["acknowledged_by_id"] is None
    assert row["acknowledged_at"] is None
    assert row["status"] == "open"
    assert _snapshot(db) == before
    _assert_logged_by_type_only(caplog, "PAT-001")
