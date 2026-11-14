"""Tests for the demo-user command (TS-06).

Covers TS-06 AC1, FR-002 and specs/006-authentication/contracts/auth-api.md
"Demo-user command". Uses an in-memory SQLite database with only the users table
and synthetic passwords; no real database and no network.
"""

import sqlite3

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

import app.seed_demo_users as seed
from app.models import Base, User
from app.passwords import verify_password

DOCTOR_PW = "doctor-seed-pass-1"
NURSE_PW = "nurse-seed-pass-1"
VALID_ENV = {"DEMO_DOCTOR_PASSWORD": DOCTOR_PW, "DEMO_NURSE_PASSWORD": NURSE_PW}


@pytest.fixture
def engine():
    """An in-memory SQLite engine with only the users table."""
    eng = create_engine("sqlite://")
    Base.metadata.create_all(eng, tables=[User.__table__])
    yield eng
    eng.dispose()


@pytest.fixture(autouse=True)
def fast_hashing(monkeypatch):
    """Keep hashing fast: the command's hashes use 1000 iterations in these tests (format unchanged)."""
    real_hash = seed.hash_password
    monkeypatch.setattr(seed, "hash_password", lambda pw: real_hash(pw, iterations=1000))


def _users(engine):
    with Session(engine) as session:
        return {u.username: u for u in session.scalars(select(User)).all()}


def _count(engine):
    with Session(engine) as session:
        return session.scalar(select(func.count()).select_from(User))


def test_read_passwords_ok():
    """FR-002: two passwords of at least 8 characters are read with no errors."""
    passwords, errors = seed.read_demo_passwords(VALID_ENV)

    assert errors == []
    assert passwords == {"demo.doctor": DOCTOR_PW, "demo.nurse": NURSE_PW}


def test_read_passwords_boundary_8_characters():
    """FR-002 (edge case): exactly 8 characters is accepted; 7 is rejected."""
    passwords, errors = seed.read_demo_passwords(
        {"DEMO_DOCTOR_PASSWORD": "8chars!!", "DEMO_NURSE_PASSWORD": "7chars!"}
    )

    assert passwords == {"demo.doctor": "8chars!!"}
    assert errors == ["DEMO_NURSE_PASSWORD must be set to at least 8 characters"]


def test_read_passwords_missing_and_short():
    """FR-002, AC1: a short and a missing password give two errors that name the settings, never the value."""
    passwords, errors = seed.read_demo_passwords({"DEMO_DOCTOR_PASSWORD": "short"})

    assert passwords == {}
    assert errors == [
        "DEMO_DOCTOR_PASSWORD must be set to at least 8 characters",
        "DEMO_NURSE_PASSWORD must be set to at least 8 characters",
    ]
    assert all("short" not in error for error in errors)


def test_upsert_creates_then_updates(engine):
    """AC1, FR-002: the first run creates both accounts with hashed passwords; a second run updates them with no duplicates."""
    with Session(engine) as session:
        result = seed.upsert_demo_users(
            session, {"demo.doctor": DOCTOR_PW, "demo.nurse": NURSE_PW}
        )
        session.commit()

    assert result == [("created", "demo.doctor"), ("created", "demo.nurse")]
    assert _count(engine) == 2
    users = _users(engine)
    for username, password in (("demo.doctor", DOCTOR_PW), ("demo.nurse", NURSE_PW)):
        stored = users[username].password_hash
        assert stored.startswith("pbkdf2_sha256$")
        assert verify_password(password, stored)
        assert password not in stored

    with Session(engine) as session:
        result = seed.upsert_demo_users(
            session, {"demo.doctor": "new-doctor-pass", "demo.nurse": "new-nurse-pass"}
        )
        session.commit()

    assert result == [("updated", "demo.doctor"), ("updated", "demo.nurse")]
    assert _count(engine) == 2
    users = _users(engine)
    assert verify_password("new-doctor-pass", users["demo.doctor"].password_hash)
    assert verify_password("new-nurse-pass", users["demo.nurse"].password_hash)
    assert not verify_password(DOCTOR_PW, users["demo.doctor"].password_hash)


def test_upsert_resets_name_and_role(engine):
    """AC1, data-model "Demo accounts": a changed name or role is reset to the demo values."""
    with Session(engine) as session:
        session.add(
            User(username="demo.doctor", password_hash="x", full_name="Changed", role="nurse")
        )
        session.commit()

    with Session(engine) as session:
        result = seed.upsert_demo_users(
            session, {"demo.doctor": DOCTOR_PW, "demo.nurse": NURSE_PW}
        )
        session.commit()

    assert result == [("updated", "demo.doctor"), ("created", "demo.nurse")]
    doctor = _users(engine)["demo.doctor"]
    assert doctor.full_name == "Dra. Ana Demo"
    assert doctor.role == "doctor"


def test_main_missing_password_touches_nothing(monkeypatch, capsys):
    """AC1, contract: a missing password returns 1 before any database access, naming the setting."""

    def no_engine():
        raise AssertionError("the database must not be touched")

    monkeypatch.setattr(seed, "get_engine", no_engine)
    monkeypatch.setattr(seed, "database_url", lambda: "sqlite://")

    code = seed.main({"DEMO_DOCTOR_PASSWORD": DOCTOR_PW})

    out, err = capsys.readouterr()
    assert code == 1
    assert "DEMO_NURSE_PASSWORD must be set to at least 8 characters" in err
    assert DOCTOR_PW not in out + err
    assert out == ""


def test_main_without_database_url(capsys):
    """Contract: with valid passwords and no DATABASE_URL (conftest) the command returns 1 with "DATABASE_URL is not set"."""
    code = seed.main(VALID_ENV)

    out, err = capsys.readouterr()
    assert code == 1
    assert "DATABASE_URL is not set" in err
    assert DOCTOR_PW not in out + err
    assert NURSE_PW not in out + err


def test_main_success_output(engine, monkeypatch, capsys):
    """AC1, FR-002: success returns 0 and prints one line per account, with no password or hash."""
    monkeypatch.setattr(seed, "database_url", lambda: "sqlite://")
    monkeypatch.setattr(seed, "get_engine", lambda: engine)

    code = seed.main(VALID_ENV)

    out, err = capsys.readouterr()
    assert code == 0
    assert out == "created: demo.doctor\ncreated: demo.nurse\n"
    for text in (out, err):
        assert DOCTOR_PW not in text
        assert NURSE_PW not in text
        assert "pbkdf2" not in text
    assert _count(engine) == 2

    code = seed.main(VALID_ENV)

    out, _ = capsys.readouterr()
    assert code == 0
    assert out == "updated: demo.doctor\nupdated: demo.nurse\n"
    assert _count(engine) == 2


def test_main_db_error(monkeypatch, capsys):
    """Contract: a connection error returns 1 with "Could not update the demo users (<ErrorType>)" and no secrets."""
    def refuse_connection():
        raise sqlite3.OperationalError("synthetic connection failure at no/such/dir")

    failing = create_engine("sqlite://", creator=refuse_connection)
    monkeypatch.setattr(seed, "database_url", lambda: "sqlite://")
    monkeypatch.setattr(seed, "get_engine", lambda: failing)

    code = seed.main(VALID_ENV)

    out, err = capsys.readouterr()
    failing.dispose()
    assert code == 1
    assert "Could not update the demo users (" in err
    assert out == ""
    assert DOCTOR_PW not in err
    assert "no/such/dir" not in err
