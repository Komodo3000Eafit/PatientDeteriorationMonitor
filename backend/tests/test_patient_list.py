"""Tests for the patient list endpoint ``GET /api/patients`` (US-02).

Covers AC1-AC5 and FR-006 of specs/016-patient-list/spec.md.
Contract: specs/016-patient-list/contracts/patient-list-api.md.
Synthetic data only: fictitious patients and a synthetic nurse and doctor.
No real database and no network: every test uses an in-memory SQLite engine, and
the autouse ``isolate_database`` fixture (conftest.py) removes ``DATABASE_URL`` so
the real database configured in ``backend/.env`` can never be reached.
Readings and their stored scores are inserted directly as rows (``VitalSign`` +
``ReadingScore``) with chosen ``recorded_at``, ``total`` and ``band``.
"""

import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

import app.auth
import app.main
import app.patients
from app.models import Base, Patient, ReadingScore, User, VitalSign

URL = "/api/patients"
SERVICE_UNAVAILABLE = {"detail": "Service unavailable"}
NOT_AUTHENTICATED = {"detail": "Not authenticated"}
ITEM_KEYS = {"identifier", "name", "age", "sex", "triage_level", "admitted_at", "latest_score"}
SCORE_KEYS = {"recorded_at", "total", "band"}
INTERNAL_KEYS = {"id", "patient_id", "vital_sign_id", "status", "system", "entries"}

client = TestClient(app.main.app)


# --- Fixtures -----------------------------------------------------------------


def make_engine(create_tables=True):
    eng = create_engine(
        "sqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    if create_tables:
        Base.metadata.create_all(eng)
    return eng


@pytest.fixture
def engine():
    """In-memory SQLite engine shared across threads (TestClient runs in another thread)."""
    assert os.environ.get("DATABASE_URL") is None  # isolate_database ran first
    eng = make_engine()
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


def override_session(engine):
    def override():
        session = Session(engine)
        try:
            yield session
        finally:
            session.close()

    app.main.app.dependency_overrides[app.patients.get_session] = override


@pytest.fixture
def db(engine):
    """Override ``get_session`` with a session on the in-memory engine."""
    override_session(engine)
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


# --- Helpers ------------------------------------------------------------------

ADMITTED = datetime(2026, 11, 20, 14, 0, 0)


def add_patient(engine, code, triage_level=3, status="active", admitted_at=ADMITTED):
    with Session(engine) as session:
        session.add(Patient(
            identifier=code, name=f"Paciente Ficticio {code}", age=50, sex="other",
            triage_level=triage_level, status=status, admitted_at=admitted_at,
        ))
        session.commit()


def add_scored_reading(engine, code, recorded_at, total, band):
    """Insert one synthetic reading and its stored score as rows; return the reading id."""
    with Session(engine) as session:
        pid = session.query(Patient.id).filter(Patient.identifier == code).scalar()
        reading = VitalSign(
            patient_id=pid, recorded_at=recorded_at, respiratory_rate=16, spo2=97,
            on_oxygen=False, systolic_bp=120, heart_rate=72, consciousness="A",
            temperature=Decimal("36.8"),
        )
        session.add(reading)
        session.flush()
        session.add(ReadingScore(
            vital_sign_id=reading.id, system="NEWS2", total=total, band=band, entries=[],
        ))
        session.commit()
        return reading.id


def as_utc(value):
    """Normalise a datetime to aware UTC; a naive value is treated as UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def parse_time(text):
    return as_utc(datetime.fromisoformat(text.replace("Z", "+00:00")))


def by_code(body):
    return {item["identifier"]: item for item in body["patients"]}


def all_keys(value):
    """Every dict key anywhere in a JSON value."""
    keys = set()
    if isinstance(value, dict):
        for key, inner in value.items():
            keys.add(key)
            keys |= all_keys(inner)
    elif isinstance(value, list):
        for inner in value:
            keys |= all_keys(inner)
    return keys


class QueryCounter:
    """Counts SQL statements sent through an engine."""

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


# --- AC1: who sees the list and what is returned -------------------------------


@pytest.mark.parametrize("role", ["doctor", "nurse"])
def test_ac1_any_role_gets_active_patients_only(db, users, role):
    """AC1 (FR-001, FR-002): doctor and nurse get 200 {"patients": [...]}; discharged is absent."""
    add_patient(db, "PAT-001")
    add_patient(db, "PAT-002")
    add_patient(db, "PAT-003", status="discharged")
    sign_in(users[role])

    response = client.get(URL)

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"patients"}
    assert sorted(by_code(body)) == ["PAT-001", "PAT-002"]


def test_ac1_item_keys_exact_and_no_internal_ids(as_doctor, db):
    """AC1 (FR-002): each item has exactly the contract keys; no id/patient_id/vital_sign_id anywhere."""
    add_patient(db, "PAT-001")
    add_patient(db, "PAT-002")
    add_scored_reading(db, "PAT-001", datetime(2026, 11, 21, 9, 15), 7, "high")

    body = client.get(URL).json()

    for item in body["patients"]:
        assert set(item) == ITEM_KEYS
    items = by_code(body)
    assert set(items["PAT-001"]["latest_score"]) == SCORE_KEYS
    assert items["PAT-002"]["latest_score"] is None
    assert not INTERNAL_KEYS & all_keys(body)
    assert items["PAT-001"]["name"] == "Paciente Ficticio PAT-001"
    assert items["PAT-001"]["age"] == 50
    assert items["PAT-001"]["sex"] == "other"
    assert items["PAT-001"]["triage_level"] == 3


# --- AC2: the latest stored score -------------------------------------------------


def test_ac2_latest_reading_by_recorded_at(as_nurse, db):
    """AC2 (FR-003): two readings -> the later recorded_at with its stored total and band; times as UTC values."""
    admitted = datetime(2026, 11, 20, 8, 30, 0)
    add_patient(db, "PAT-001", admitted_at=admitted)
    later = datetime(2026, 11, 21, 9, 15, 0)
    # The later reading is inserted first, so the higher id is the earlier reading.
    add_scored_reading(db, "PAT-001", later, 6, "medium")
    add_scored_reading(db, "PAT-001", later - timedelta(minutes=5), 1, "low")

    item = by_code(client.get(URL).json())["PAT-001"]

    score = item["latest_score"]
    assert (score["total"], score["band"]) == (6, "medium")
    assert parse_time(score["recorded_at"]) == as_utc(later)
    assert parse_time(item["admitted_at"]) == as_utc(admitted)


def test_ac2_same_recorded_at_higher_id_wins(as_nurse, db):
    """AC2 (FR-003): two readings with the same recorded_at -> the one saved last (higher id)."""
    add_patient(db, "PAT-001")
    same = datetime(2026, 11, 21, 9, 15, 0)
    first_id = add_scored_reading(db, "PAT-001", same, 2, "low")
    second_id = add_scored_reading(db, "PAT-001", same, 5, "medium")
    assert second_id > first_id

    score = by_code(client.get(URL).json())["PAT-001"]["latest_score"]

    assert (score["total"], score["band"]) == (5, "medium")
    assert parse_time(score["recorded_at"]) == as_utc(same)


def test_ac2_no_readings_latest_score_null(as_nurse, db):
    """AC2 (FR-003): a patient without readings has latest_score null."""
    add_patient(db, "PAT-001")

    assert by_code(client.get(URL).json())["PAT-001"]["latest_score"] is None


def test_ac2_stored_score_returned_as_stored(as_nurse, db):
    """AC2 (D-50): a stored score that NEWS2 would compute differently is returned as stored.

    The inserted vital signs are all normal (NEWS2 total 0, band low), but the stored
    score says 9 / high; the list must return 9 / high, never a recomputed value.
    """
    add_patient(db, "PAT-001")
    add_scored_reading(db, "PAT-001", datetime(2026, 11, 21, 9, 15), 9, "high")

    score = by_code(client.get(URL).json())["PAT-001"]["latest_score"]

    assert (score["total"], score["band"]) == (9, "high")


# --- AC3: order -----------------------------------------------------------------


def test_ac3_order_with_ties(as_doctor, db):
    """AC3 (FR-004): scored first by total desc, then triage asc, then identifier; unscored last."""
    t = datetime(2026, 11, 21, 9, 0)
    # Inserted in a deliberately mixed order.
    add_patient(db, "PAT-010", triage_level=1)            # no readings, triage 1
    add_patient(db, "PAT-020", triage_level=3)            # total 5, triage 3
    add_patient(db, "PAT-030", triage_level=4)            # total 0
    add_patient(db, "PAT-040", triage_level=4)            # no readings, triage 4
    add_patient(db, "PAT-050", triage_level=2)            # total 5, triage 2
    add_patient(db, "PAT-060", triage_level=5)            # total 7
    add_patient(db, "PAT-002", triage_level=3)            # total 5, triage 3 (tie with PAT-020)
    add_patient(db, "PAT-001", triage_level=1, status="discharged")
    add_scored_reading(db, "PAT-020", t, 5, "medium")
    add_scored_reading(db, "PAT-030", t, 0, "low")
    add_scored_reading(db, "PAT-050", t, 5, "medium")
    add_scored_reading(db, "PAT-060", t, 7, "high")
    add_scored_reading(db, "PAT-002", t, 5, "medium")
    add_scored_reading(db, "PAT-001", t, 9, "high")

    codes = [item["identifier"] for item in client.get(URL).json()["patients"]]

    assert codes == [
        "PAT-060",  # 7
        "PAT-050",  # 5, triage 2
        "PAT-002",  # 5, triage 3, identifier first
        "PAT-020",  # 5, triage 3
        "PAT-030",  # 0
        "PAT-010",  # no readings, triage 1
        "PAT-040",  # no readings, triage 4
    ]


def test_ac3_order_uses_latest_score_not_highest(as_doctor, db):
    """AC3 (FR-003, FR-004): ordering uses the latest stored score, not an older higher one."""
    add_patient(db, "PAT-001", triage_level=3)
    add_patient(db, "PAT-002", triage_level=3)
    t = datetime(2026, 11, 21, 9, 0)
    add_scored_reading(db, "PAT-001", t, 8, "high")
    add_scored_reading(db, "PAT-001", t + timedelta(minutes=5), 1, "low")
    add_scored_reading(db, "PAT-002", t, 3, "low-medium")

    codes = [item["identifier"] for item in client.get(URL).json()["patients"]]

    assert codes == ["PAT-002", "PAT-001"]


# --- AC4: one statement -------------------------------------------------------------


@pytest.mark.parametrize("count", [0, 1, 10])
def test_ac4_single_statement(as_doctor, db, count):
    """AC4 (FR-005): exactly one SQL statement per request with 0, 1 and 10 patients."""
    t = datetime(2026, 11, 21, 9, 0)
    for n in range(count):
        code = f"PAT-{n + 1:03d}"
        add_patient(db, code, triage_level=(n % 5) + 1)
        add_scored_reading(db, code, t, n % 4, "low")
        add_scored_reading(db, code, t + timedelta(minutes=5), n, "medium")

    with QueryCounter(db) as counter:
        response = client.get(URL)

    assert response.status_code == 200
    assert len(response.json()["patients"]) == count
    assert len(counter.statements) == 1, counter.statements


def test_ac4_empty_list(as_doctor, db):
    """AC4 / contract: no active patients -> 200 {"patients": []}."""
    add_patient(db, "PAT-001", status="discharged")

    response = client.get(URL)

    assert response.status_code == 200
    assert response.json() == {"patients": []}


# --- AC5: signed out ---------------------------------------------------------------


def test_ac5_no_token_401(db, users):
    """AC5 (FR-001): no override of get_current_user and no token -> 401, no patients key."""
    add_patient(db, "PAT-001")
    assert app.auth.get_current_user not in app.main.app.dependency_overrides

    response = client.get(URL)

    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED
    assert "patients" not in response.json()
    assert response.headers["www-authenticate"] == "Bearer"


def test_ac5_invalid_token_401(db, users):
    """AC5 (FR-001): an invalid bearer token -> 401, no patients key."""
    add_patient(db, "PAT-001")

    response = client.get(URL, headers={"Authorization": "Bearer not-a-valid-token"})

    assert response.status_code == 401
    assert "patients" not in response.json()


# --- FR-006: database unavailable --------------------------------------------------


def test_fr006_no_database_url_503(users, monkeypatch):
    """FR-006: DATABASE_URL unset and get_session not overridden -> 503 fixed message."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    sign_in(users["doctor"])
    assert app.patients.get_session not in app.main.app.dependency_overrides

    response = client.get(URL)

    assert response.status_code == 503
    assert response.json() == SERVICE_UNAVAILABLE


def test_fr006_database_error_503(users):
    """FR-006: a SQLAlchemyError from the session (missing tables -> OperationalError) -> 503 fixed message."""
    broken = make_engine(create_tables=False)
    try:
        override_session(broken)
        sign_in(users["nurse"])

        response = client.get(URL)

        assert response.status_code == 503
        assert response.json() == SERVICE_UNAVAILABLE
    finally:
        broken.dispose()


# --- US-01 route not shadowed --------------------------------------------------------


def test_post_patients_still_201_for_nurse(as_nurse, db):
    """US-01 POST /api/patients still answers 201 for a nurse (same path, other router)."""
    response = client.post(
        URL, json={"name": "Paciente Ficticio Siete", "age": 40, "sex": "female", "triage_level": 3},
    )

    assert response.status_code == 201
    created = response.json()["identifier"]
    assert created in by_code(client.get(URL).json())
