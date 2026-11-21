"""Tests for entering and listing readings with their stored scores (US-03).

Covers AC7-AC11 and FR-005-FR-011 of specs/017-vital-signs-scoring/spec.md.
Contract: specs/017-vital-signs-scoring/contracts/readings-api.md.
Synthetic data only: fictitious patients and a synthetic nurse and doctor.
No real database and no network: every test uses an in-memory SQLite engine, and
the autouse ``isolate_database`` fixture (conftest.py) removes ``DATABASE_URL`` so
the real database configured in ``backend/.env`` can never be reached.
"""

import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select, update
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

import app.auth
import app.main
import app.patients
from app.models import Base, Patient, ReadingScore, User, VitalSign
from app.readings import record_reading
from app.scoring import VitalSigns

FORBIDDEN = {"detail": "Only nurses can record vital signs"}
NOT_FOUND = {"detail": "Patient not found"}
DISCHARGED = {"detail": "Patient is discharged"}
SERVICE_UNAVAILABLE = {"detail": "Service unavailable"}
NOT_AUTHENTICATED = {"detail": "Not authenticated"}

URL = "/api/patients/PAT-001/readings"

# The contract example request and its expected answer (without recorded_at).
CONTRACT_BODY = {
    "respiratory_rate": 22, "spo2": 95, "on_oxygen": False, "systolic_bp": 118,
    "heart_rate": 96, "consciousness": "A", "temperature": 38.4,
}
CONTRACT_RESPONSE = {
    "respiratory_rate": 22,
    "spo2": 95,
    "on_oxygen": False,
    "systolic_bp": 118,
    "heart_rate": 96,
    "consciousness": "A",
    "temperature": "38.4",
    "score": {
        "system": "NEWS2",
        "total": 5,
        "band": "medium",
        "entries": [
            {"parameter": "respiratory_rate", "value": 22, "points": 2, "low": 21, "high": 24, "category": []},
            {"parameter": "spo2", "value": 95, "points": 1, "low": 94, "high": 95, "category": []},
            {"parameter": "on_oxygen", "value": False, "points": 0, "low": None, "high": None, "category": [False]},
            {"parameter": "systolic_bp", "value": 118, "points": 0, "low": 111, "high": 219, "category": []},
            {"parameter": "heart_rate", "value": 96, "points": 1, "low": 91, "high": 110, "category": []},
            {"parameter": "consciousness", "value": "A", "points": 0, "low": None, "high": None, "category": ["A"]},
            {"parameter": "temperature", "value": "38.4", "points": 1, "low": "38.1", "high": "39.0", "category": []},
        ],
    },
}
INTERNAL_KEYS = {"id", "patient_id", "vital_sign_id"}

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
    """Override ``get_session`` with a session on the in-memory engine; add PAT-001 to PAT-003."""

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


def counts(engine):
    """(readings, stored scores) in the database."""
    with Session(engine) as session:
        readings = session.scalar(select(func.count()).select_from(VitalSign))
        scores = session.scalar(select(func.count()).select_from(ReadingScore))
    return readings, scores


def post(body, url=URL):
    return client.post(url, json=body)


def patient_id(engine, code):
    with Session(engine) as session:
        return session.scalar(select(Patient.id).where(Patient.identifier == code))


def add_reading(engine, code, recorded_at, respiratory_rate=16):
    """Save one synthetic reading (with its stored score) and set its recorded_at; return its id."""
    vitals = VitalSigns(respiratory_rate, 97, False, 120, 72, "A", Decimal("36.8"))
    with Session(engine) as session:
        pid = session.scalar(select(Patient.id).where(Patient.identifier == code))
        row = record_reading(session, pid, vitals)
        row.recorded_at = recorded_at
        session.commit()
        return row.id


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


# --- AC7: nurse enters a reading ------------------------------------------------


def test_ac7_nurse_posts_contract_example_201(as_nurse, db):
    """AC7 (FR-005, FR-009): 201 with the contract example body, server recorded_at, no internal ids."""
    before = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=5)
    response = post(CONTRACT_BODY)

    assert response.status_code == 201
    body = response.json()
    recorded_at = body.pop("recorded_at")
    assert body == CONTRACT_RESPONSE
    assert not INTERNAL_KEYS & set(body)
    assert not INTERNAL_KEYS & set(body["score"])
    for entry in body["score"]["entries"]:
        assert not INTERNAL_KEYS & set(entry)
    # recorded_at is the server's save time (UTC).
    saved = datetime.fromisoformat(recorded_at.replace("Z", "+00:00"))
    if saved.tzinfo is not None:
        saved = saved.astimezone(timezone.utc).replace(tzinfo=None)
    assert before <= saved <= before + timedelta(minutes=10)

    assert counts(db) == (1, 1)
    with Session(db) as session:
        reading = session.scalars(select(VitalSign)).one()
        score = session.scalars(select(ReadingScore)).one()
        assert reading.patient_id == patient_id(db, "PAT-001")
        assert score.vital_sign_id == reading.id
        assert (score.system, score.total, score.band) == ("NEWS2", 5, "medium")
        assert score.entries == CONTRACT_RESPONSE["score"]["entries"]


def test_ac7_client_recorded_at_rejected(as_nurse, db):
    """AC7, FR-009: a recorded_at in the body is an unknown field (422), nothing stored."""
    response = post({**CONTRACT_BODY, "recorded_at": "2020-01-01T00:00:00Z"})
    assert response.status_code == 422
    assert response.json()["detail"] == [
        {"type": "unknown", "loc": ["body", "recorded_at"], "msg": "Invalid value"}
    ]
    assert "2020-01-01" not in response.text
    assert counts(db) == (0, 0)


def test_ac7_boundaries_and_open_ends_in_entries(as_nurse, db):
    """AC7, edge cases (open-ended ranges): rr 8 has no low bound, hr 131 no high bound, temperature 35.0 is "35.0"."""
    body = {**CONTRACT_BODY, "respiratory_rate": 8, "heart_rate": 131, "temperature": 35.0}
    response = post(body)
    assert response.status_code == 201
    entries = {e["parameter"]: e for e in response.json()["score"]["entries"]}
    assert (entries["respiratory_rate"]["low"], entries["respiratory_rate"]["high"]) == (None, 8)
    assert (entries["heart_rate"]["low"], entries["heart_rate"]["high"]) == (131, None)
    assert entries["temperature"] == {
        "parameter": "temperature", "value": "35.0", "points": 3, "low": None,
        "high": "35.0", "category": [],
    }


def test_ac10_whole_number_temperature_stored_with_one_decimal(as_nurse, db):
    """AC10 edge case: temperature 37 is accepted and stored and returned as "37.0"."""
    response = post({**CONTRACT_BODY, "temperature": 37})
    assert response.status_code == 201
    assert response.json()["temperature"] == "37.0"
    assert response.json()["score"]["entries"][-1]["value"] == "37.0"
    with Session(db) as session:
        assert session.scalars(select(VitalSign)).one().temperature == Decimal("37.0")
    assert counts(db) == (1, 1)


# --- AC8: who may enter a reading -----------------------------------------------


def test_ac8_no_token_401(db, users):
    """AC8 (FR-006): signed out (no token, real get_current_user) -> 401, nothing stored."""
    assert app.auth.get_current_user not in app.main.app.dependency_overrides
    response = post(CONTRACT_BODY)
    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED
    assert response.headers["www-authenticate"] == "Bearer"
    assert counts(db) == (0, 0)


def test_ac8_invalid_token_401(db, users):
    """AC8 (FR-006): an invalid token -> 401, nothing stored."""
    response = client.post(
        URL, json=CONTRACT_BODY, headers={"Authorization": "Bearer not-a-valid-token"}
    )
    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED
    assert counts(db) == (0, 0)


def test_ac8_doctor_403(as_doctor, db):
    """AC8 (FR-006): a signed-in doctor -> 403 fixed message, nothing stored."""
    response = post(CONTRACT_BODY)
    assert response.status_code == 403
    assert response.json() == FORBIDDEN
    assert counts(db) == (0, 0)


def test_ac8_doctor_with_invalid_body_still_403(as_doctor, db):
    """AC8 (contract order 401 -> 403 -> 422): the role is checked before the body."""
    response = post({"spo2": 987, "ZZ-UNIQUE": "QQ-SECRET"})
    assert response.status_code == 403
    assert response.json() == FORBIDDEN
    assert "QQ-SECRET" not in response.text
    assert counts(db) == (0, 0)


# --- AC9: unknown or discharged patient -----------------------------------------


def test_ac9_unknown_patient_404(as_nurse, db):
    """AC9 (FR-007): an unknown patient code -> 404 fixed message, nothing stored."""
    with QueryCounter(db) as counter:
        response = post(CONTRACT_BODY, url="/api/patients/PAT-999/readings")
    assert response.status_code == 404
    assert response.json() == NOT_FOUND
    assert counter.statements  # a well-formed code is looked up (proves the spy works)
    assert counts(db) == (0, 0)


def test_ac9_unknown_patient_before_body_check(as_nurse, db):
    """AC9 (contract order 404 -> 422): an unknown patient with an invalid body is still 404."""
    response = post({"spo2": 987}, url="/api/patients/PAT-999/readings")
    assert response.status_code == 404
    assert response.json() == NOT_FOUND


@pytest.mark.parametrize("code", ["pat-001", "A" * 21, "PAT_001"], ids=["lower-case", "21-chars", "underscore"])
def test_ac9_bad_code_format_404_without_query(as_nurse, db, code):
    """AC9 (FR-007), edge case: a code not in the patient code format -> 404 without any database query."""
    with QueryCounter(db) as counter:
        response = post(CONTRACT_BODY, url=f"/api/patients/{code}/readings")
    assert response.status_code == 404
    assert response.json() == NOT_FOUND
    assert counter.statements == []
    assert counts(db) == (0, 0)


def test_ac9_discharged_patient_409(as_nurse, db):
    """AC9 (FR-007): a discharged patient -> 409 fixed message, nothing stored."""
    response = post(CONTRACT_BODY, url="/api/patients/PAT-003/readings")
    assert response.status_code == 409
    assert response.json() == DISCHARGED
    assert counts(db) == (0, 0)


def test_ac9_discharged_before_body_check(as_nurse, db):
    """AC9 (contract order 409 -> 422): a discharged patient with an invalid body is still 409."""
    response = post({"spo2": 987}, url="/api/patients/PAT-003/readings")
    assert response.status_code == 409
    assert response.json() == DISCHARGED
    assert counts(db) == (0, 0)


# --- AC10: input validation without echoing values ------------------------------

PARAMETER_NAMES = list(CONTRACT_BODY)


def _without(field):
    return {k: v for k, v in CONTRACT_BODY.items() if k != field}


INVALID_CASES = [
    *[
        pytest.param(_without(name), name, "missing", None, id=f"missing-{name}")
        for name in PARAMETER_NAMES
    ],
    pytest.param({**CONTRACT_BODY, "respiratory_rate": "18"}, "respiratory_rate", "wrong_type", None, id="rr-string"),
    pytest.param({**CONTRACT_BODY, "respiratory_rate": 18.0}, "respiratory_rate", "wrong_type", None, id="rr-float"),
    pytest.param({**CONTRACT_BODY, "respiratory_rate": True}, "respiratory_rate", "wrong_type", None, id="rr-bool"),
    pytest.param({**CONTRACT_BODY, "heart_rate": 18.5}, "heart_rate", "wrong_type", None, id="hr-decimal"),
    pytest.param({**CONTRACT_BODY, "spo2": 150}, "spo2", "out_of_range", None, id="spo2-150"),
    pytest.param({**CONTRACT_BODY, "spo2": 987}, "spo2", "out_of_range", "987", id="spo2-987-distinctive"),
    pytest.param({**CONTRACT_BODY, "temperature": 37.25}, "temperature", "too_many_decimals", "37.25", id="temp-two-decimals"),
    pytest.param({**CONTRACT_BODY, "temperature": 45.1}, "temperature", "out_of_range", "45.1", id="temp-45.1"),
    pytest.param({**CONTRACT_BODY, "on_oxygen": "yes"}, "on_oxygen", "wrong_type", None, id="oxygen-yes"),
    pytest.param({**CONTRACT_BODY, "on_oxygen": 1}, "on_oxygen", "wrong_type", None, id="oxygen-1"),
    pytest.param({**CONTRACT_BODY, "on_oxygen": "true"}, "on_oxygen", "wrong_type", None, id="oxygen-true-string"),
    pytest.param({**CONTRACT_BODY, "consciousness": "X"}, "consciousness", "not_allowed", None, id="acvpu-X"),
    pytest.param({**CONTRACT_BODY, "ZZ-UNIQUE": "QQ-SECRET"}, "ZZ-UNIQUE", "unknown", "QQ-SECRET", id="unknown-field"),
    pytest.param({**CONTRACT_BODY, "score": 0}, "score", "unknown", None, id="unknown-score"),
    pytest.param({**CONTRACT_BODY, "identifier": "PAT-002"}, "identifier", "unknown", "PAT-002", id="unknown-identifier"),
]


@pytest.mark.parametrize("body, field, reason, secret", INVALID_CASES)
def test_ac10_invalid_body_422(as_nurse, db, body, field, reason, secret):
    """AC10 (FR-008, FR-011): 422 naming the parameter and reason, no submitted value, nothing stored."""
    response = post(body)
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert {"type": reason, "loc": ["body", field], "msg": "Invalid value"} in detail
    for error in detail:
        assert set(error) == {"type", "loc", "msg"}  # no "input", no "ctx"
    if secret is not None:
        assert secret not in response.text
    assert counts(db) == (0, 0)


def test_ac10_unknown_key_is_cleaned_and_shortened(as_nurse, db):
    """AC10: an unknown key is reported cleaned (no control characters) and cut to 40 characters; its value is not echoed."""
    key = "ZZ\x07" + "K" * 60
    response = post({**CONTRACT_BODY, key: "QQ-SECRET"})
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail == [{"type": "unknown", "loc": ["body", ("ZZ" + "K" * 60)[:40]], "msg": "Invalid value"}]
    assert "QQ-SECRET" not in response.text
    assert counts(db) == (0, 0)


def test_ac10_several_problems_listed(as_nurse, db):
    """AC10: every problem is listed, in parameter order, then unknown fields."""
    response = post({**_without("spo2"), "consciousness": "X", "extra": 1})
    assert response.status_code == 422
    assert [(e["loc"][1], e["type"]) for e in response.json()["detail"]] == [
        ("spo2", "missing"), ("consciousness", "not_allowed"), ("extra", "unknown"),
    ]
    assert counts(db) == (0, 0)


def test_ac10_non_object_body_422(as_nurse, db):
    """AC10 (contract): a JSON body that is not an object -> 422 from the existing handler, with loc and type, nothing stored."""
    response = post([])
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail and all(set(e) == {"type", "loc", "msg"} for e in detail)
    assert detail[0]["loc"][0] == "body"
    assert counts(db) == (0, 0)


# --- AC11: reading history ------------------------------------------------------


def test_ac11_doctor_gets_history_newest_first(as_doctor, db):
    """AC11 (FR-010): any clinician; newest first, ties broken by the later saved first."""
    base = datetime(2026, 11, 20, 10, 0, 0)
    add_reading(db, "PAT-001", base, respiratory_rate=12)                         # 10:00
    add_reading(db, "PAT-001", base + timedelta(hours=1), respiratory_rate=14)    # 11:00
    add_reading(db, "PAT-001", base + timedelta(hours=1), respiratory_rate=16)    # 11:00, saved later
    add_reading(db, "PAT-001", base - timedelta(hours=1), respiratory_rate=18)    # 09:00, saved last
    add_reading(db, "PAT-002", base + timedelta(hours=5), respiratory_rate=20)    # another patient

    response = client.get(URL)

    assert response.status_code == 200
    readings = response.json()["readings"]
    assert [r["respiratory_rate"] for r in readings] == [16, 14, 12, 18]
    for reading in readings:
        assert not INTERNAL_KEYS & set(reading)
        assert reading["score"]["system"] == "NEWS2"
        assert len(reading["score"]["entries"]) == 7
        assert reading["temperature"] == "36.8"


def test_ac11_nurse_gets_history(as_nurse, db):
    """AC11: a nurse may read the history too; the posted reading is returned with its stored score."""
    assert post(CONTRACT_BODY).status_code == 201
    response = client.get(URL)
    assert response.status_code == 200
    readings = response.json()["readings"]
    assert len(readings) == 1
    readings[0].pop("recorded_at")
    assert readings[0] == CONTRACT_RESPONSE


def test_ac11_default_and_given_limits(as_doctor, db):
    """AC11 (FR-010): 60 readings -> 50 by default; limit=1 and limit=200 work, newest first."""
    base = datetime(2026, 11, 20, 0, 0, 0)
    for minute in range(60):
        add_reading(db, "PAT-001", base + timedelta(minutes=minute))

    default = client.get(URL).json()["readings"]
    assert len(default) == 50
    one = client.get(URL, params={"limit": 1}).json()["readings"]
    assert len(one) == 1
    assert one[0]["recorded_at"] == default[0]["recorded_at"]
    assert one[0]["recorded_at"].startswith("2026-11-20T00:59")
    assert len(client.get(URL, params={"limit": 200}).json()["readings"]) == 60


@pytest.mark.parametrize("limit", ["0", "201", "abc", "-1"])
def test_ac11_invalid_limit_422(as_doctor, db, limit):
    """AC11 (FR-010): a limit outside 1-200 -> 422 without echoing it."""
    response = client.get(URL, params={"limit": limit})
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert all(set(e) == {"type", "loc", "msg"} for e in detail)
    assert ["query", "limit"] in [e["loc"] for e in detail]


def test_ac11_unknown_patient_404(as_doctor, db):
    """AC11: an unknown patient code -> 404."""
    response = client.get("/api/patients/PAT-999/readings")
    assert response.status_code == 404
    assert response.json() == NOT_FOUND


def test_ac11_bad_code_404(as_doctor, db):
    """AC11, edge case: a code not in the patient code format -> 404."""
    response = client.get("/api/patients/pat-001/readings")
    assert response.status_code == 404
    assert response.json() == NOT_FOUND


def test_ac11_no_token_401(db, users):
    """AC11: signed out -> 401."""
    assert app.auth.get_current_user not in app.main.app.dependency_overrides
    response = client.get(URL)
    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED


def test_ac11_no_readings_empty_list(as_doctor, db):
    """AC11, edge case: a patient with no readings -> an empty list, not an error."""
    response = client.get("/api/patients/PAT-002/readings")
    assert response.status_code == 200
    assert response.json() == {"readings": []}


def test_ac11_discharged_patient_history_200(as_doctor, db):
    """AC11 (FR-010): the history also answers for a discharged patient."""
    add_reading(db, "PAT-003", datetime(2026, 11, 20, 8, 0, 0))
    response = client.get("/api/patients/PAT-003/readings")
    assert response.status_code == 200
    assert len(response.json()["readings"]) == 1


def test_ac11_stored_score_returned_not_recomputed(as_doctor, db):
    """AC11 (FR-010): the history returns the stored score as stored (a changed total shows), not a recomputed one."""
    reading_id = add_reading(db, "PAT-001", datetime(2026, 11, 20, 8, 0, 0))
    with Session(db) as session:
        session.execute(
            update(ReadingScore)
            .where(ReadingScore.vital_sign_id == reading_id)
            .values(total=9, band="high")
        )
        session.commit()

    score = client.get(URL).json()["readings"][0]["score"]
    assert (score["total"], score["band"]) == (9, "high")


# --- FR-011: database not configured ---------------------------------------------


def test_fr011_no_database_url_503(users, monkeypatch):
    """FR-011: DATABASE_URL unset and get_session not overridden -> 503 fixed message (POST and GET)."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    sign_in(users["nurse"])
    assert app.patients.get_session not in app.main.app.dependency_overrides

    response = post(CONTRACT_BODY)
    assert response.status_code == 503
    assert response.json() == SERVICE_UNAVAILABLE

    response = client.get(URL)
    assert response.status_code == 503
    assert response.json() == SERVICE_UNAVAILABLE
