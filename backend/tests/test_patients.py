"""Tests for registering patients (US-01).

Covers US-01 AC1-AC6 and FR-001-FR-009.
Contract: specs/015-register-patient/contracts/patients-api.md.
Synthetic data only: fictitious patient names and a synthetic nurse and doctor.
No real database and no network: every test uses an in-memory SQLite engine, and
the autouse ``isolate_database`` fixture (conftest.py) removes ``DATABASE_URL`` so
the real database configured in ``backend/.env`` can never be reached.
"""

import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

import app.auth
import app.main
import app.patients
from app.models import Base, Patient, TriageEvent, User

FORBIDDEN = {"detail": "Only nurses can register patients"}
CONFLICT = {"detail": "Could not assign a patient code; try again"}
SERVICE_UNAVAILABLE = {"detail": "Service unavailable"}
NOT_AUTHENTICATED = {"detail": "Not authenticated"}

VALID_BODY = {
    "name": "Paciente Ficticio Siete",
    "age": 40,
    "sex": "female",
    "triage_level": 3,
}

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
            username="synthetic.nurse",
            password_hash="not-a-real-hash",
            full_name="Enf. Ficticia Prueba",
            role="nurse",
        )
        doctor = User(
            username="synthetic.doctor",
            password_hash="not-a-real-hash",
            full_name="Dr. Ficticio Prueba",
            role="doctor",
        )
        session.add_all([nurse, doctor])
        session.commit()
        return {"nurse": nurse, "doctor": doctor}


@pytest.fixture
def db(engine):
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
def as_nurse(db, users):
    sign_in(users["nurse"])
    return users["nurse"]


@pytest.fixture
def as_doctor(db, users):
    sign_in(users["doctor"])
    return users["doctor"]


def add_patients(engine, *codes):
    with Session(engine) as session:
        for i, code in enumerate(codes):
            session.add(
                Patient(
                    identifier=code,
                    name=f"Paciente Ficticio {i}",
                    age=50,
                    sex="other",
                    triage_level=4,
                    status="active",
                )
            )
        session.commit()


def counts(engine):
    with Session(engine) as session:
        patients = session.scalar(select(func.count()).select_from(Patient))
        events = session.scalar(select(func.count()).select_from(TriageEvent))
    return patients, events


def post(body):
    return client.post("/api/patients", json=body)


# --- AC1: nurse registers a patient -------------------------------------------


def test_ac1_nurse_registers_patient_201_body(as_nurse):
    """AC1 (FR-001, FR-004): 201 with the patient fields, trimmed name, no internal id."""
    response = post({**VALID_BODY, "name": "  Paciente Ficticio Siete  "})
    assert response.status_code == 201
    body = response.json()
    assert set(body) == {
        "identifier",
        "name",
        "age",
        "sex",
        "triage_level",
        "status",
        "admitted_at",
    }
    assert "id" not in body
    assert body["identifier"] == "PAT-007"
    assert body["name"] == "Paciente Ficticio Siete"
    assert body["age"] == 40
    assert body["sex"] == "female"
    assert body["triage_level"] == 3
    assert body["status"] == "active"
    assert body["admitted_at"]


def test_ac1_one_initial_triage_event_stored(as_nurse, db):
    """AC1 (FR-005): exactly one initial triage event matching the stored patient."""
    response = post({**VALID_BODY, "triage_level": 2})
    assert response.status_code == 201
    with Session(db) as session:
        patient = session.scalars(
            select(Patient).where(Patient.identifier == response.json()["identifier"])
        ).one()
        assert patient.status == "active"
        assert patient.name == "Paciente Ficticio Siete"
        events = session.scalars(
            select(TriageEvent).where(TriageEvent.patient_id == patient.id)
        ).all()
        assert len(events) == 1
        event_ = events[0]
        assert event_.source == "initial"
        assert event_.previous_level is None
        assert event_.new_level == 2
        assert event_.score is None
        assert event_.created_by_id == as_nurse.id
        assert event_.occurred_at == patient.admitted_at
    assert counts(db) == (1, 1)


# --- AC2: system-generated patient code ---------------------------------------


@pytest.mark.parametrize(
    "existing, expected",
    [
        ((), "PAT-007"),
        (("PAT-001", "PAT-002", "PAT-003", "PAT-004", "PAT-005", "PAT-006"), "PAT-007"),
        (("PAT-007", "PAT-009"), "PAT-010"),
        (("PAT-007", "TEST-1", "PAT-ABC"), "PAT-008"),
        (("TEST-1", "PAT-ABC"), "PAT-007"),
        (("PAT-999",), "PAT-1000"),
    ],
    ids=["empty", "demo-only", "gap-not-filled", "non-numeric-ignored",
         "only-non-numeric", "past-999"],
)
def test_ac2_generated_code(as_nurse, db, existing, expected):
    """AC2 (FR-002): next after the highest PAT-<digits>, never below PAT-007."""
    add_patients(db, *existing)
    response = post(VALID_BODY)
    assert response.status_code == 201
    assert response.json()["identifier"] == expected


def test_ac2_client_identifier_rejected(as_nurse, db):
    """AC2 (FR-002, FR-003): a client-sent identifier is rejected with 422 naming it."""
    response = post({**VALID_BODY, "identifier": "PAT-001"})
    assert response.status_code == 422
    locs = [error["loc"] for error in response.json()["detail"]]
    assert ["body", "identifier"] in locs
    assert counts(db) == (0, 0)


# --- AC3: one retry on a code conflict ----------------------------------------


def test_ac3_retry_succeeds_with_free_code(as_nurse, db, monkeypatch):
    """AC3 (FR-006): first code conflicts, the retry gets a free code -> 201."""
    add_patients(db, "PAT-007")
    codes = iter(["PAT-007", "PAT-008"])
    monkeypatch.setattr(app.patients, "next_patient_code", lambda session: next(codes))
    response = post(VALID_BODY)
    assert response.status_code == 201
    assert response.json()["identifier"] == "PAT-008"
    assert counts(db) == (2, 1)


def test_ac3_second_conflict_gives_409(as_nurse, db, monkeypatch):
    """AC3 (FR-006): conflict twice -> 409 fixed message, nothing stored."""
    add_patients(db, "PAT-007")
    calls = []

    def always_existing(session):
        calls.append(1)
        return "PAT-007"

    monkeypatch.setattr(app.patients, "next_patient_code", always_existing)
    before = counts(db)
    response = post(VALID_BODY)
    assert response.status_code == 409
    assert response.json() == CONFLICT
    assert len(calls) == 2  # exactly one retry
    assert counts(db) == before == (1, 0)


# --- AC4: all or nothing ------------------------------------------------------


def test_ac4_triage_event_failure_stores_nothing(as_nurse, db):
    """AC4 (FR-007): saving the triage event fails -> 503 and no patient row remains."""

    def fail_on_triage_event(session, flush_context, instances):
        if any(isinstance(obj, TriageEvent) for obj in session.new):
            raise OperationalError("INSERT", {}, Exception("synthetic failure"))

    event.listen(Session, "before_flush", fail_on_triage_event)
    try:
        response = post(VALID_BODY)
    finally:
        event.remove(Session, "before_flush", fail_on_triage_event)
    assert response.status_code == 503
    assert response.json() == SERVICE_UNAVAILABLE
    assert "synthetic failure" not in response.text
    assert counts(db) == (0, 0)


# --- AC5: only nurses may register --------------------------------------------


def test_ac5_no_token_401(db, users):
    """AC5 (FR-008): signed out (no token, real get_current_user) -> 401, nothing stored.

    With no token the user is never looked up, so no database is contacted
    (and DATABASE_URL is unset by isolate_database anyway).
    """
    assert app.auth.get_current_user not in app.main.app.dependency_overrides
    response = post(VALID_BODY)
    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED
    assert response.headers["www-authenticate"] == "Bearer"
    assert counts(db) == (0, 0)


def test_ac5_invalid_token_401(db, users):
    """AC5 (FR-008): an invalid token -> 401 before any user lookup, nothing stored."""
    response = client.post(
        "/api/patients",
        json=VALID_BODY,
        headers={"Authorization": "Bearer not-a-valid-token"},
    )
    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED
    assert counts(db) == (0, 0)


def test_ac5_doctor_403(as_doctor, db):
    """AC5 (FR-008): a signed-in doctor -> 403 fixed message, nothing stored."""
    response = post(VALID_BODY)
    assert response.status_code == 403
    assert response.json() == FORBIDDEN
    assert counts(db) == (0, 0)


def test_ac5_doctor_with_invalid_body_still_403(as_doctor, db):
    """AC5 (FR-008, contract order 401 -> 403 -> 422): role is checked before the body."""
    response = post({"name": "", "age": 999, "sex": "QQ-SECRET", "extra": 1})
    assert response.status_code == 403
    assert response.json() == FORBIDDEN
    assert "QQ-SECRET" not in response.text
    assert counts(db) == (0, 0)


# --- AC6: input validation without echoing values -----------------------------

LONG_NAME = "ZZ-UNIQUE-VALUE-" + "x" * 90  # 106 characters


def _without(field):
    return {k: v for k, v in VALID_BODY.items() if k != field}


INVALID_CASES = [
    pytest.param(_without("name"), "name", None, id="missing-name"),
    pytest.param(_without("age"), "age", None, id="missing-age"),
    pytest.param(_without("sex"), "sex", None, id="missing-sex"),
    pytest.param(_without("triage_level"), "triage_level", None, id="missing-triage"),
    pytest.param({**VALID_BODY, "name": ""}, "name", None, id="name-empty"),
    pytest.param({**VALID_BODY, "name": "   "}, "name", None, id="name-whitespace"),
    pytest.param({**VALID_BODY, "name": "a" * 101}, "name", None, id="name-101"),
    pytest.param({**VALID_BODY, "name": LONG_NAME}, "name", "ZZ-UNIQUE-VALUE",
                 id="name-long-distinctive"),
    pytest.param({**VALID_BODY, "age": -1}, "age", None, id="age-negative"),
    pytest.param({**VALID_BODY, "age": 131}, "age", None, id="age-131"),
    pytest.param({**VALID_BODY, "age": "40"}, "age", None, id="age-string"),
    pytest.param({**VALID_BODY, "age": 40.5}, "age", None, id="age-float"),
    pytest.param({**VALID_BODY, "age": True}, "age", None, id="age-bool"),
    pytest.param({**VALID_BODY, "sex": "unknown"}, "sex", None, id="sex-unknown"),
    pytest.param({**VALID_BODY, "sex": "QQ-SECRET"}, "sex", "QQ-SECRET",
                 id="sex-distinctive"),
    pytest.param({**VALID_BODY, "triage_level": 0}, "triage_level", None, id="triage-0"),
    pytest.param({**VALID_BODY, "triage_level": 6}, "triage_level", None, id="triage-6"),
    pytest.param({**VALID_BODY, "triage_level": "3"}, "triage_level", None,
                 id="triage-string"),
    pytest.param({**VALID_BODY, "status": "QQ-SECRET-STATUS"}, "status",
                 "QQ-SECRET-STATUS", id="extra-status"),
    pytest.param({**VALID_BODY, "admitted_at": "2026-01-01T00:00:00Z"}, "admitted_at",
                 "2026-01-01T00:00:00Z", id="extra-admitted-at"),
]


@pytest.mark.parametrize("body, field, secret", INVALID_CASES)
def test_ac6_invalid_body_422(as_nurse, db, body, field, secret):
    """AC6 (FR-003, FR-008): 422 naming the field, no submitted values, nothing stored."""
    response = post(body)
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert ["body", field] in [error["loc"] for error in detail]
    for error in detail:
        assert set(error) == {"type", "loc", "msg"}  # no "input", no "ctx"
    if secret is not None:
        assert secret not in response.text
    assert counts(db) == (0, 0)


def test_ac6_boundary_values_accepted(as_nurse, db):
    """AC6 (FR-003): the edges age 0 and 130, triage 1 and 5, name of 100 chars pass."""
    for body in (
        {**VALID_BODY, "age": 0, "triage_level": 1, "sex": "male"},
        {**VALID_BODY, "age": 130, "triage_level": 5, "sex": "other", "name": "b" * 100},
    ):
        assert post(body).status_code == 201
    assert counts(db) == (2, 2)


# --- FR-009: database not configured ------------------------------------------


def test_fr009_no_database_url_503(users, monkeypatch):
    """FR-009: DATABASE_URL unset and get_session not overridden -> 503 fixed message."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    sign_in(users["nurse"])
    assert app.patients.get_session not in app.main.app.dependency_overrides
    response = post(VALID_BODY)
    assert response.status_code == 503
    assert response.json() == SERVICE_UNAVAILABLE
