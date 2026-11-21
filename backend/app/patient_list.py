"""Patient list (US-02). See specs/016-patient-list/contracts/patient-list-api.md."""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import Select, and_, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.models import Patient, ReadingScore, User, VitalSign
from app.patients import get_session

logger = logging.getLogger(__name__)


# --- Models -------------------------------------------------------------------


class LatestScore(BaseModel):
    """The stored score of a patient's most recent reading."""

    recorded_at: datetime
    total: int
    band: str


class PatientListItem(BaseModel):
    """One active patient; internal ids, ``status``, ``system`` and ``entries`` are never returned."""

    identifier: str
    name: str
    age: int
    sex: str
    triage_level: int
    admitted_at: datetime
    latest_score: LatestScore | None


class PatientListResponse(BaseModel):
    """The list of active patients, in attention order."""

    patients: list[PatientListItem]


# --- Logic --------------------------------------------------------------------


def list_patients_query() -> Select:
    """Return the single query that builds the whole list (research R2).

    Each active patient is joined with its latest reading's stored score (latest
    ``recorded_at``, ties broken by the most recently saved reading). Patients
    with a score come first, by ``total`` descending, then ``triage_level``
    ascending, then ``identifier`` ascending. Scores are read as stored, never
    recomputed.
    """
    ranked = (
        select(
            VitalSign.patient_id,
            VitalSign.recorded_at,
            ReadingScore.total,
            ReadingScore.band,
            func.row_number()
            .over(
                partition_by=VitalSign.patient_id,
                order_by=(VitalSign.recorded_at.desc(), VitalSign.id.desc()),
            )
            .label("rn"),
        )
        .join(ReadingScore, ReadingScore.vital_sign_id == VitalSign.id)
        .subquery()
    )
    return (
        select(
            Patient.identifier,
            Patient.name,
            Patient.age,
            Patient.sex,
            Patient.triage_level,
            Patient.admitted_at,
            ranked.c.recorded_at,
            ranked.c.total,
            ranked.c.band,
        )
        .outerjoin(ranked, and_(ranked.c.patient_id == Patient.id, ranked.c.rn == 1))
        .where(Patient.status == "active")
        .order_by(
            ranked.c.total.is_(None),
            ranked.c.total.desc(),
            Patient.triage_level.asc(),
            Patient.identifier.asc(),
        )
    )


# --- Routes -------------------------------------------------------------------

router = APIRouter()


@router.get("/patients", response_model=PatientListResponse)
def list_patients(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Return the active patients with their latest stored score (any signed-in user)."""
    try:
        rows = session.execute(list_patients_query()).all()
    except SQLAlchemyError as exc:
        session.rollback()
        logger.warning("Patient list failed (%s)", type(exc).__name__)
        raise HTTPException(503, "Service unavailable")
    return PatientListResponse(
        patients=[
            PatientListItem(
                identifier=row.identifier,
                name=row.name,
                age=row.age,
                sex=row.sex,
                triage_level=row.triage_level,
                admitted_at=row.admitted_at,
                latest_score=None
                if row.total is None
                else LatestScore(
                    recorded_at=row.recorded_at, total=row.total, band=row.band
                ),
            )
            for row in rows
        ]
    )
