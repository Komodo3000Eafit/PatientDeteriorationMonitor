"""Tests for exporting every reading of a patient with its stored score (US-10).

Endpoint: ``GET /api/patients/{identifier}/readings/export``
(specs/026-export-vitals-csv/contracts/readings-export-api.md).

Acceptance criteria and requirements covered (specs/026-export-vitals-csv/spec.md):
- AC1, FR-002: every reading (more than the US-03 cap of 200), oldest first, ties in save order.
- AC2, FR-003, FR-004: values as stored (temperature one-decimal string, on_oxygen boolean,
  consciousness ACVPU letter); the stored score is returned, never recomputed (SC-002).
- AC4, FR-008: a patient with no readings gives an empty list.
- AC5, FR-009: no / malformed / expired token gives 401 with no reading data; any role may export.
- AC7, FR-011: unknown or malformed code gives 404; no database or a database error gives 503,
  logged by error type only.
- AC10: the US-03 readings list (newest first, limit 1-200) is unchanged.
- Contract: no item carries internal ids or the patient code.

Synthetic data only: fictitious patients and a synthetic nurse and doctor. No real database
and no network: every test uses an in-memory SQLite engine, and the autouse
``isolate_database`` fixture (conftest.py) removes ``DATABASE_URL``.
"""

import logging
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, update
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

import app.auth
import app.main
import app.patients
from app.models import Base, Patient, ReadingScore, User, VitalSign
from app.readings import record_reading
from app.scoring import VitalSigns

NOT_FOUND = {"detail": "Patient not found"}
SERVICE_UNAVAILABLE = {"detail": "Service unavailable"}
NOT_AUTHENTICATED = {"detail": "Not authenticated"}
FORBIDDEN_KEYS = {"id", "patient_id", "vital_sign_id", "identifier"}

URL = "/api/patients/PAT-001/readings/export"
LIST_URL = "/api/patients/PAT-001/readings"

BASE_TIME = datetime(2026, 11, 22, 8, 0, 0)
DEFAULT_VITALS = dict(
    respiratory_rate=16, spo2=97, on_oxygen=False, systolic_bp=120,
    heart_rate=72, consciousness="A", temperature=Decimal("36.8"),
)

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
    """Override ``get_session`` with the in-memory engine; add PAT-001, PAT-002 (active) and PAT-003 (discharged)."""

    def override():
        session = Session(engine)
        try:
            yield session
        finally:
            session.close()

    app.main.app.dependency_overrides[app.patients.get_session] = override
    with Session(engine) as session:
        for code, status in (("PAT-001", "active"), ("PAT-002", "active"), ("PAT-003", "discharged")):
            session.add(Patient(
                identifier=code, name=f"Paciente Ficticio {code}", age=50, sex="other",
                triage_level=4, status=status,
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


def add_readings(engine, code, times, **overrides):
    """Save one synthetic reading per time (each with its stored score); return their ids in save order."""
    ids = []
    with Session(engine) as session:
        pid = session.scalar(select(Patient.id).where(Patient.identifier == code))
        for recorded_at in times:
            row = record_reading(session, pid, VitalSigns(**{**DEFAULT_VITALS, **overrides}))
            row.recorded_at = recorded_at
            session.flush()
            ids.append(row.id)
        session.commit()
    return ids


def add_reading(engine, code, recorded_at, **overrides):
    return add_readings(engine, code, [recorded_at], **overrides)[0]


def export(url=URL, **kwargs):
    return client.get(url, **kwargs)


# --- AC1, FR-002: every reading, oldest first -----------------------------------


def test_ac1_doctor_gets_all_205_readings(as_doctor, db):
    """AC1, FR-002: a doctor gets 200 and all 205 readings (more than the US-03 cap of 200)."""
    add_readings(db, "PAT-001", [BASE_TIME + timedelta(minutes=5 * i) for i in range(205)])

    response = export()

    assert response.status_code == 200
    readings = response.json()["readings"]
    assert len(readings) == 205
    assert readings[0]["recorded_at"].startswith("2026-11-22T08:00")
    last = BASE_TIME + timedelta(minutes=5 * 204)
    assert readings[-1]["recorded_at"].startswith(last.strftime("%Y-%m-%dT%H:%M"))


def test_ac1_oldest_first_ties_in_save_order(as_doctor, db):
    """AC1, FR-002: recorded_at ascending; two readings with the same recorded_at come back in save (id) order."""
    add_reading(db, "PAT-001", BASE_TIME + timedelta(hours=2), respiratory_rate=12)  # 10:00
    add_reading(db, "PAT-001", BASE_TIME, respiratory_rate=14)                       # 08:00
    add_reading(db, "PAT-001", BASE_TIME + timedelta(hours=1), respiratory_rate=18)  # 09:00, saved first
    add_reading(db, "PAT-001", BASE_TIME + timedelta(hours=1), respiratory_rate=20)  # 09:00, saved later
    add_reading(db, "PAT-002", BASE_TIME - timedelta(hours=1), respiratory_rate=22)  # another patient

    response = export()

    assert response.status_code == 200
    assert [r["respiratory_rate"] for r in response.json()["readings"]] == [14, 18, 20, 12]


def test_ac1_same_recorded_at_set_directly_keeps_id_order(as_doctor, db):
    """AC1, FR-002: set recorded_at directly on the column to the same value; order follows the id."""
    first, second, third = add_readings(
        db, "PAT-001", [BASE_TIME + timedelta(minutes=m) for m in (10, 20, 30)]
    )
    with Session(db) as session:
        for reading_id, rr in ((first, 11), (second, 13), (third, 15)):
            session.execute(
                update(VitalSign).where(VitalSign.id == reading_id)
                .values(recorded_at=BASE_TIME, respiratory_rate=rr)
            )
        session.commit()

    readings = export().json()["readings"]

    assert [r["respiratory_rate"] for r in readings] == [11, 13, 15]
    assert len({r["recorded_at"] for r in readings}) == 1


# --- AC2, FR-003, FR-004: values as stored ---------------------------------------


def test_ac2_values_as_stored(as_doctor, db):
    """AC2, FR-003, FR-004: temperature "37.0"/"38.4", on_oxygen a JSON boolean, consciousness the ACVPU letter."""
    add_reading(db, "PAT-001", BASE_TIME, temperature=Decimal("37"))
    add_reading(
        db, "PAT-001", BASE_TIME + timedelta(minutes=5), respiratory_rate=22, spo2=95,
        on_oxygen=True, systolic_bp=118, heart_rate=96, consciousness="V",
        temperature=Decimal("38.4"),
    )

    response = export()

    assert response.status_code == 200
    first, second = response.json()["readings"]
    assert first["temperature"] == "37.0"
    assert second["temperature"] == "38.4"
    assert first["on_oxygen"] is False
    assert second["on_oxygen"] is True
    assert first["consciousness"] == "A"
    assert second["consciousness"] == "V"
    assert (second["respiratory_rate"], second["spo2"], second["systolic_bp"], second["heart_rate"]) == (22, 95, 118, 96)
    assert '"on_oxygen":true' in response.text.replace(" ", "")
    for reading in (first, second):
        assert set(reading) == {
            "recorded_at", "respiratory_rate", "spo2", "on_oxygen", "systolic_bp",
            "heart_rate", "consciousness", "temperature", "score",
        }
        assert set(reading["score"]) == {"system", "total", "band", "entries"}
        assert len(reading["score"]["entries"]) == 7


def test_sc002_stored_score_returned_not_recomputed(as_doctor, db):
    """AC1, FR-003, SC-002: a ReadingScore changed to total=19, band="high" is exported as stored."""
    untouched, changed = add_readings(db, "PAT-001", [BASE_TIME, BASE_TIME + timedelta(minutes=5)])
    with Session(db) as session:
        session.execute(
            update(ReadingScore).where(ReadingScore.vital_sign_id == changed)
            .values(total=19, band="high")
        )
        session.commit()
        original = session.scalars(
            select(ReadingScore).where(ReadingScore.vital_sign_id == untouched)
        ).one()
        original_score = (original.total, original.band)

    readings = export().json()["readings"]

    assert (readings[1]["score"]["total"], readings[1]["score"]["band"]) == (19, "high")
    assert (readings[0]["score"]["total"], readings[0]["score"]["band"]) == original_score
    assert original_score != (19, "high")


# --- FR-009: any signed-in role ---------------------------------------------------


def test_fr009_nurse_gets_export_200(as_nurse, db):
    """FR-009: a nurse may export too (no role check)."""
    add_reading(db, "PAT-001", BASE_TIME)
    response = export()
    assert response.status_code == 200
    assert len(response.json()["readings"]) == 1


# --- AC4, FR-008 and edge cases ----------------------------------------------------


def test_ac4_no_readings_empty_list(as_doctor, db):
    """AC4, FR-008: a patient with no readings -> 200 {"readings": []}."""
    response = export("/api/patients/PAT-002/readings/export")
    assert response.status_code == 200
    assert response.json() == {"readings": []}


def test_edge_discharged_patient_exports_200(as_doctor, db):
    """Edge case: a discharged patient's readings are exported too."""
    add_readings(db, "PAT-003", [BASE_TIME, BASE_TIME + timedelta(minutes=5)])
    response = export("/api/patients/PAT-003/readings/export")
    assert response.status_code == 200
    assert len(response.json()["readings"]) == 2


def test_contract_only_this_patients_readings(as_doctor, db):
    """Contract: readings of other patients are never included."""
    add_reading(db, "PAT-001", BASE_TIME, respiratory_rate=12)
    add_readings(db, "PAT-002", [BASE_TIME, BASE_TIME], respiratory_rate=24)
    readings = export().json()["readings"]
    assert [r["respiratory_rate"] for r in readings] == [12]


def test_contract_no_internal_ids_or_patient_code(as_doctor, db):
    """Contract: no reading, score or entry has id, patient_id, vital_sign_id or identifier; the code is not in the body."""
    add_readings(db, "PAT-001", [BASE_TIME, BASE_TIME + timedelta(minutes=5)])
    response = export()
    body = response.json()
    assert set(body) == {"readings"}
    for reading in body["readings"]:
        assert not FORBIDDEN_KEYS & set(reading)
        assert not FORBIDDEN_KEYS & set(reading["score"])
        for entry in reading["score"]["entries"]:
            assert not FORBIDDEN_KEYS & set(entry)
    assert "PAT-001" not in response.text


# --- AC5, FR-009: authentication (real get_current_user) --------------------------


def _expired_token():
    return app.auth.create_access_token(1, now=datetime.now(timezone.utc) - timedelta(days=2))[0]


@pytest.mark.parametrize(
    "headers",
    [
        pytest.param({}, id="no-token"),
        pytest.param({"Authorization": "Bearer not-a-valid-token"}, id="malformed-token"),
        pytest.param(None, id="expired-token"),
    ],
)
def test_ac5_not_authenticated_401(db, users, headers):
    """AC5, FR-009: no, malformed or expired token -> 401 fixed message, WWW-Authenticate: Bearer, no readings."""
    assert app.auth.get_current_user not in app.main.app.dependency_overrides
    add_reading(db, "PAT-001", BASE_TIME)
    if headers is None:
        headers = {"Authorization": f"Bearer {_expired_token()}"}

    response = export(headers=headers)

    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED
    assert response.headers["www-authenticate"] == "Bearer"
    assert "readings" not in response.text


def test_ac5_unauthenticated_before_not_found(db, users):
    """Contract check order 401 -> 404: an unknown patient without a token is still 401."""
    response = export("/api/patients/PAT-999/readings/export")
    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED


# --- AC7, FR-009: unknown or malformed patient code --------------------------------


def test_ac7_unknown_patient_404(as_doctor, db):
    """AC7, FR-009: an unknown code -> 404 fixed message."""
    response = export("/api/patients/PAT-999/readings/export")
    assert response.status_code == 404
    assert response.json() == NOT_FOUND


@pytest.mark.parametrize(
    "code", ["pat-1", "PAT_1", "A" * 21], ids=["lower-case", "underscore", "21-chars"]
)
def test_ac7_malformed_code_404(as_doctor, db, code):
    """AC7, FR-009, edge case: a code not in the patient-code format -> the same 404, without echoing it."""
    response = export(f"/api/patients/{code}/readings/export")
    assert response.status_code == 404
    assert response.json() == NOT_FOUND
    assert code not in response.text


# --- AC7, FR-011: service unavailable ----------------------------------------------


def test_ac7_no_database_url_503(users, monkeypatch):
    """AC7, FR-011: DATABASE_URL unset and get_session not overridden -> 503 fixed message."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    sign_in(users["doctor"])
    assert app.patients.get_session not in app.main.app.dependency_overrides

    response = export()

    assert response.status_code == 503
    assert response.json() == SERVICE_UNAVAILABLE


class FailingExportSession(Session):
    """A real session whose ``execute`` fails like a lost connection, with a distinctive message."""

    def execute(self, *args, **kwargs):
        raise OperationalError(
            "SELECT ... QQ-SECRET-VALUE user:s3cr3t-placeholder@db.example.invalid",
            {"identifier": "PAT-001"},
            Exception("QQ-SECRET-VALUE"),
        )


def test_ac7_database_error_503_logs_type_only(as_doctor, db, caplog):
    """AC7, FR-011: a SQLAlchemyError -> 503 fixed message; the log has only the error type name, no value."""

    def failing():
        session = FailingExportSession(db)
        try:
            yield session
        finally:
            session.close()

    app.main.app.dependency_overrides[app.patients.get_session] = failing
    caplog.set_level(logging.WARNING, logger="app.readings_export_api")

    response = export()

    assert response.status_code == 503
    assert response.json() == SERVICE_UNAVAILABLE
    assert "QQ-SECRET-VALUE" not in response.text
    records = [r for r in caplog.records if r.name == "app.readings_export_api"]
    assert len(records) == 1
    assert "OperationalError" in caplog.text
    for secret in ("QQ-SECRET-VALUE", "s3cr3t-placeholder", "db.example.invalid", "PAT-001", "SELECT"):
        assert secret not in caplog.text


# --- AC10: the US-03 readings list is unchanged ------------------------------------


def test_ac10_readings_list_still_capped_newest_first(as_doctor, db):
    """AC10 (regression): GET /readings?limit=200 with 205 readings returns 200 items, newest first."""
    add_readings(db, "PAT-001", [BASE_TIME + timedelta(minutes=5 * i) for i in range(205)])

    response = client.get(LIST_URL, params={"limit": 200})

    assert response.status_code == 200
    readings = response.json()["readings"]
    assert len(readings) == 200
    times = [r["recorded_at"] for r in readings]
    assert times == sorted(times, reverse=True)
    newest = BASE_TIME + timedelta(minutes=5 * 204)
    assert times[0].startswith(newest.strftime("%Y-%m-%dT%H:%M"))
    # The export of the same patient still has all 205, oldest first.
    exported = export().json()["readings"]
    assert len(exported) == 205
    assert [r["recorded_at"] for r in exported][-200:] == list(reversed(times))


def test_ac10_readings_list_limit_201_422(as_doctor, db):
    """AC10 (regression): limit=201 on the US-03 list is still rejected with 422."""
    response = client.get(LIST_URL, params={"limit": 201})
    assert response.status_code == 422
