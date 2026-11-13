"""Tests for the database models (TS-03, FR-005 to FR-011, FR-013).

These tests inspect ``app.models.Base.metadata`` only; they never connect to a
database. Expected values come from ``specs/003-db-tables-migrations/data-model.md``.
"""

import pytest
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Identity,
    UniqueConstraint,
)

from app.models import Base

TABLES = Base.metadata.tables

EXPECTED_COLUMNS = {
    "users": {"id", "username", "password_hash", "full_name", "role", "created_at"},
    "patients": {
        "id",
        "identifier",
        "name",
        "age",
        "sex",
        "admitted_at",
        "triage_level",
        "status",
    },
    "vital_signs": {
        "id",
        "patient_id",
        "recorded_at",
        "respiratory_rate",
        "spo2",
        "on_oxygen",
        "systolic_bp",
        "heart_rate",
        "consciousness",
        "temperature",
    },
    "triage_events": {
        "id",
        "patient_id",
        "occurred_at",
        "previous_level",
        "new_level",
        "score",
        "reason",
        "source",
        "created_by_id",
    },
    "alerts": {
        "id",
        "patient_id",
        "created_at",
        "severity",
        "message",
        "status",
        "acknowledged_by_id",
        "acknowledged_at",
    },
}

EXPECTED_NULLABLE = {
    ("triage_events", "previous_level"),
    ("triage_events", "score"),
    ("triage_events", "created_by_id"),
    ("alerts", "acknowledged_by_id"),
    ("alerts", "acknowledged_at"),
}

# (table, constraint name, fragments the CHECK SQL must contain)
CHECK_CONSTRAINTS = [
    ("users", "ck_users_role", ["'doctor'", "'nurse'"]),
    ("patients", "ck_patients_age", ["age", "0", "130"]),
    ("patients", "ck_patients_sex", ["'female'", "'male'", "'other'"]),
    ("patients", "ck_patients_triage_level", ["triage_level", "1", "5"]),
    ("patients", "ck_patients_status", ["'active'", "'discharged'"]),
    ("vital_signs", "ck_vital_signs_respiratory_rate", ["respiratory_rate", ">= 0"]),
    ("vital_signs", "ck_vital_signs_spo2", ["spo2", "0", "100"]),
    ("vital_signs", "ck_vital_signs_systolic_bp", ["systolic_bp", ">= 0"]),
    ("vital_signs", "ck_vital_signs_heart_rate", ["heart_rate", ">= 0"]),
    (
        "vital_signs",
        "ck_vital_signs_consciousness",
        ["'A'", "'C'", "'V'", "'P'", "'U'"],
    ),
    ("triage_events", "ck_triage_events_previous_level", ["previous_level", "1", "5"]),
    ("triage_events", "ck_triage_events_new_level", ["new_level", "1", "5"]),
    ("triage_events", "ck_triage_events_score", ["score", ">= 0"]),
    (
        "triage_events",
        "ck_triage_events_source",
        ["'initial'", "'automatic'", "'manual'"],
    ),
    ("alerts", "ck_alerts_severity", ["'low'", "'medium'", "'high'"]),
    ("alerts", "ck_alerts_status", ["'open'", "'acknowledged'"]),
]


def test_metadata_has_exactly_the_five_tables():
    """AC1: the models define exactly the five tables of the data model."""
    assert set(TABLES) == {"users", "patients", "vital_signs", "triage_events", "alerts"}


def test_columns_and_nullability():
    """AC1, FR-009, FR-013: exact column sets; only the listed columns are nullable."""
    nullable = set()
    for name, expected in EXPECTED_COLUMNS.items():
        table = TABLES[name]
        assert {c.name for c in table.columns} == expected, name
        nullable |= {(name, c.name) for c in table.columns if c.nullable}
    assert nullable == EXPECTED_NULLABLE


def test_primary_keys_are_identity_ids():
    """Data model: every table's primary key is the single column ``id`` with an Identity."""
    for name, table in TABLES.items():
        pk_columns = list(table.primary_key.columns)
        assert [c.name for c in pk_columns] == ["id"], name
        assert isinstance(pk_columns[0].identity, Identity), name


def test_foreign_keys_restrict_delete():
    """AC4, FR-005: exactly the expected foreign keys, all ON DELETE RESTRICT."""
    expected = {
        ("vital_signs", "patient_id", "patients.id"),
        ("triage_events", "patient_id", "patients.id"),
        ("alerts", "patient_id", "patients.id"),
        ("triage_events", "created_by_id", "users.id"),
        ("alerts", "acknowledged_by_id", "users.id"),
    }
    found = set()
    for name, table in TABLES.items():
        for fk in table.foreign_keys:
            found.add((name, fk.parent.name, fk.target_fullname))
            assert fk.ondelete == "RESTRICT", (name, fk.parent.name)
    assert found == expected


def test_unique_username_and_identifier():
    """AC5, FR-008: usernames and patient identifiers are unique."""
    users_uq = {
        c.name: [col.name for col in c.columns]
        for c in TABLES["users"].constraints
        if isinstance(c, UniqueConstraint)
    }
    patients_uq = {
        c.name: [col.name for col in c.columns]
        for c in TABLES["patients"].constraints
        if isinstance(c, UniqueConstraint)
    }
    assert users_uq == {"uq_users_username": ["username"]}
    assert patients_uq == {"uq_patients_identifier": ["identifier"]}


@pytest.mark.parametrize("table_name, constraint_name, fragments", CHECK_CONSTRAINTS)
def test_check_constraints(table_name, constraint_name, fragments):
    """AC5, FR-006, FR-007: each CHECK exists on its table with its allowed values or bounds."""
    checks = {
        c.name: str(c.sqltext)
        for c in TABLES[table_name].constraints
        if isinstance(c, CheckConstraint)
    }
    assert constraint_name in checks
    for fragment in fragments:
        assert fragment in checks[constraint_name], (constraint_name, fragment)


def test_password_stored_only_as_hash():
    """FR-008: users stores only ``password_hash``; no plain password column."""
    columns = {c.name for c in TABLES["users"].columns}
    assert "password_hash" in columns
    assert [c for c in columns if c.startswith("password")] == ["password_hash"]


def test_timestamps_have_time_zone_and_defaults():
    """FR-010: timestamps are time-zone aware; event times default to now."""
    with_default = [
        ("users", "created_at"),
        ("patients", "admitted_at"),
        ("vital_signs", "recorded_at"),
        ("triage_events", "occurred_at"),
        ("alerts", "created_at"),
    ]
    for table_name, column_name in with_default:
        column = TABLES[table_name].c[column_name]
        assert isinstance(column.type, DateTime), (table_name, column_name)
        assert column.type.timezone is True, (table_name, column_name)
        assert column.server_default is not None, (table_name, column_name)

    acknowledged_at = TABLES["alerts"].c["acknowledged_at"]
    assert isinstance(acknowledged_at.type, DateTime)
    assert acknowledged_at.type.timezone is True
    assert acknowledged_at.server_default is None
