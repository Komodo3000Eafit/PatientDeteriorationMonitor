"""Read a patient's deterioration prediction (US-08). See specs/024-deterioration-prediction/contracts/prediction-api.md.

Computed on read from the stored score totals of the 3 most recent readings.
Read only: nothing is stored and the triage level never changes.
"""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.models import ReadingScore, User, VitalSign
from app.patients import find_patient, get_session
from app.prediction import predict

logger = logging.getLogger(__name__)


# --- Models -------------------------------------------------------------------
# No internal id and no vital-sign value is ever part of a response.


class PredictionReading(BaseModel):
    """One of the readings used, with its stored score total (null if never scored)."""

    total: int | None
    recorded_at: datetime


class PredictionResponse(BaseModel):
    """The deterioration prediction for a patient's 3 most recent readings."""

    rising: bool
    reason: str | None
    readings: list[PredictionReading]
    latest_band: str | None


# --- Routes -------------------------------------------------------------------

router = APIRouter()


@router.get("/patients/{identifier}/prediction", response_model=PredictionResponse)
def get_prediction(
    identifier: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Return whether a deterioration is predicted for the patient (any signed-in clinician).

    Uses the stored totals of the 3 most recent readings (recorded_at desc, id
    desc), returned oldest first. A reading with no stored score keeps its place
    with ``total`` null. Any patient status. 404 for an unknown or malformed
    patient code; 503 on a database error.
    """
    try:
        patient = find_patient(session, identifier)
        rows = session.execute(
            select(VitalSign.recorded_at, ReadingScore.total, ReadingScore.band)
            .outerjoin(ReadingScore, ReadingScore.vital_sign_id == VitalSign.id)
            .where(VitalSign.patient_id == patient.id)
            .order_by(VitalSign.recorded_at.desc(), VitalSign.id.desc())
            .limit(3)
        ).all()
        latest_band = rows[0].band if rows else None
        rows = list(reversed(rows))
        rising, reason = predict([row.total for row in rows])
        return PredictionResponse(
            rising=rising,
            reason=reason,
            readings=[
                PredictionReading(total=row.total, recorded_at=row.recorded_at)
                for row in rows
            ],
            latest_band=latest_band,
        )
    except SQLAlchemyError as exc:
        session.rollback()
        logger.warning("Prediction read failed (%s)", type(exc).__name__)
        raise HTTPException(503, "Service unavailable")
