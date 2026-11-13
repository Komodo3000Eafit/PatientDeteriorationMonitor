"""Database models for the backend (TS-03).

SQLAlchemy 2.x declarative models for the five tables. Columns, types and rules
follow ``specs/003-db-tables-migrations/data-model.md``. The naming convention
gives every constraint a fixed name, which the hand-written Alembic revision in
``migrations/versions/`` repeats exactly. No ORM relationships are defined; the
foreign-key columns enforce the links.
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Integer,
    MetaData,
    Numeric,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Declarative base with a naming convention for every constraint."""

    metadata = MetaData(
        naming_convention={
            "pk": "pk_%(table_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
        }
    )


class User(Base):
    """A clinician account (accounts are created in TS-06)."""

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('doctor', 'nurse')", name="role"),
    )

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    # Only a password hash is stored; there is no plain-text password column.
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str] = mapped_column(String(10), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Patient(Base):
    """A synthetic triaged patient; no real-identity columns."""

    __tablename__ = "patients"
    __table_args__ = (
        CheckConstraint("age BETWEEN 0 AND 130", name="age"),
        CheckConstraint("sex IN ('female', 'male', 'other')", name="sex"),
        CheckConstraint("triage_level BETWEEN 1 AND 5", name="triage_level"),
        CheckConstraint("status IN ('active', 'discharged')", name="status"),
    )

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    identifier: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    age: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    sex: Mapped[str] = mapped_column(String(10), nullable=False)
    admitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # 1 = most urgent; no scoring-system meaning in the schema.
    triage_level: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), server_default="active", nullable=False
    )


class VitalSign(Base):
    """One set of vital-sign readings for a patient."""

    __tablename__ = "vital_signs"
    __table_args__ = (
        CheckConstraint("respiratory_rate >= 0", name="respiratory_rate"),
        CheckConstraint("spo2 BETWEEN 0 AND 100", name="spo2"),
        CheckConstraint("systolic_bp >= 0", name="systolic_bp"),
        CheckConstraint("heart_rate >= 0", name="heart_rate"),
        CheckConstraint(
            "consciousness IN ('A', 'C', 'V', 'P', 'U')", name="consciousness"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="RESTRICT"), nullable=False
    )
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    respiratory_rate: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    spo2: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    on_oxygen: Mapped[bool] = mapped_column(Boolean, nullable=False)
    systolic_bp: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    heart_rate: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    consciousness: Mapped[str] = mapped_column(String(1), nullable=False)
    temperature: Mapped[Decimal] = mapped_column(Numeric(3, 1), nullable=False)


class TriageEvent(Base):
    """A change of (or the first) triage level, with the reason for it."""

    __tablename__ = "triage_events"
    __table_args__ = (
        CheckConstraint("previous_level BETWEEN 1 AND 5", name="previous_level"),
        CheckConstraint("new_level BETWEEN 1 AND 5", name="new_level"),
        CheckConstraint("score >= 0", name="score"),
        CheckConstraint(
            "source IN ('initial', 'automatic', 'manual')", name="source"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="RESTRICT"), nullable=False
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # Empty for the initial event.
    previous_level: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    new_level: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    # Which vital signs and rules produced the change.
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String(10), nullable=False)
    # Empty for system events.
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )


class Alert(Base):
    """A notice to clinicians about a patient."""

    __tablename__ = "alerts"
    __table_args__ = (
        CheckConstraint("severity IN ('low', 'medium', 'high')", name="severity"),
        CheckConstraint("status IN ('open', 'acknowledged')", name="status"),
    )

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    severity: Mapped[str] = mapped_column(String(10), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), server_default="open", nullable=False
    )
    acknowledged_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    acknowledged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
