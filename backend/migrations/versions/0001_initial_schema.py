"""TS-03: initial schema (users, patients, vital_signs, triage_events, alerts)

Hand-written to match ``app/models.py`` and
``specs/003-db-tables-migrations/data-model.md``. Every constraint name is the
one the models' naming convention produces, passed through ``op.f()`` so the
convention is not applied twice.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-11-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0001_initial_schema"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the five tables, parents first."""
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=100), nullable=False),
        sa.Column("role", sa.String(length=10), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("username", name=op.f("uq_users_username")),
        sa.CheckConstraint("role IN ('doctor', 'nurse')", name=op.f("ck_users_role")),
    )

    op.create_table(
        "patients",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("identifier", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("age", sa.SmallInteger(), nullable=False),
        sa.Column("sex", sa.String(length=10), nullable=False),
        sa.Column(
            "admitted_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("triage_level", sa.SmallInteger(), nullable=False),
        sa.Column(
            "status", sa.String(length=20), server_default="active", nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_patients")),
        sa.UniqueConstraint("identifier", name=op.f("uq_patients_identifier")),
        sa.CheckConstraint("age BETWEEN 0 AND 130", name=op.f("ck_patients_age")),
        sa.CheckConstraint(
            "sex IN ('female', 'male', 'other')", name=op.f("ck_patients_sex")
        ),
        sa.CheckConstraint(
            "triage_level BETWEEN 1 AND 5", name=op.f("ck_patients_triage_level")
        ),
        sa.CheckConstraint(
            "status IN ('active', 'discharged')", name=op.f("ck_patients_status")
        ),
    )

    op.create_table(
        "vital_signs",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("patient_id", sa.Integer(), nullable=False),
        sa.Column(
            "recorded_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("respiratory_rate", sa.SmallInteger(), nullable=False),
        sa.Column("spo2", sa.SmallInteger(), nullable=False),
        sa.Column("on_oxygen", sa.Boolean(), nullable=False),
        sa.Column("systolic_bp", sa.SmallInteger(), nullable=False),
        sa.Column("heart_rate", sa.SmallInteger(), nullable=False),
        sa.Column("consciousness", sa.String(length=1), nullable=False),
        sa.Column("temperature", sa.Numeric(precision=3, scale=1), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vital_signs")),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patients.id"],
            name=op.f("fk_vital_signs_patient_id_patients"),
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "respiratory_rate >= 0", name=op.f("ck_vital_signs_respiratory_rate")
        ),
        sa.CheckConstraint("spo2 BETWEEN 0 AND 100", name=op.f("ck_vital_signs_spo2")),
        sa.CheckConstraint("systolic_bp >= 0", name=op.f("ck_vital_signs_systolic_bp")),
        sa.CheckConstraint("heart_rate >= 0", name=op.f("ck_vital_signs_heart_rate")),
        sa.CheckConstraint(
            "consciousness IN ('A', 'C', 'V', 'P', 'U')",
            name=op.f("ck_vital_signs_consciousness"),
        ),
    )

    op.create_table(
        "triage_events",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("patient_id", sa.Integer(), nullable=False),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("previous_level", sa.SmallInteger(), nullable=True),
        sa.Column("new_level", sa.SmallInteger(), nullable=False),
        sa.Column("score", sa.SmallInteger(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("source", sa.String(length=10), nullable=False),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_triage_events")),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patients.id"],
            name=op.f("fk_triage_events_patient_id_patients"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["users.id"],
            name=op.f("fk_triage_events_created_by_id_users"),
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "previous_level BETWEEN 1 AND 5",
            name=op.f("ck_triage_events_previous_level"),
        ),
        sa.CheckConstraint(
            "new_level BETWEEN 1 AND 5", name=op.f("ck_triage_events_new_level")
        ),
        sa.CheckConstraint("score >= 0", name=op.f("ck_triage_events_score")),
        sa.CheckConstraint(
            "source IN ('initial', 'automatic', 'manual')",
            name=op.f("ck_triage_events_source"),
        ),
    )

    op.create_table(
        "alerts",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("patient_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("severity", sa.String(length=10), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column(
            "status", sa.String(length=20), server_default="open", nullable=False
        ),
        sa.Column("acknowledged_by_id", sa.Integer(), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_alerts")),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patients.id"],
            name=op.f("fk_alerts_patient_id_patients"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["acknowledged_by_id"],
            ["users.id"],
            name=op.f("fk_alerts_acknowledged_by_id_users"),
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "severity IN ('low', 'medium', 'high')", name=op.f("ck_alerts_severity")
        ),
        sa.CheckConstraint(
            "status IN ('open', 'acknowledged')", name=op.f("ck_alerts_status")
        ),
    )


def downgrade() -> None:
    """Drop the five tables, children first."""
    op.drop_table("alerts")
    op.drop_table("triage_events")
    op.drop_table("vital_signs")
    op.drop_table("patients")
    op.drop_table("users")
