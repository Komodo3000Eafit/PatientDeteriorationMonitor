"""Export every reading of one patient with its stored score, oldest first (US-10). See specs/026-export-vitals-csv/contracts/readings-export-api.md."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.models import ReadingScore, User, VitalSign
from app.patients import find_patient, get_session
from app.readings_api import ReadingResponse, to_response

logger = logging.getLogger(__name__)


class ReadingExportResponse(BaseModel):
    """Every reading of a patient, oldest first."""

    readings: list[ReadingResponse]


router = APIRouter()


@router.get(
    "/patients/{identifier}/readings/export", response_model=ReadingExportResponse
)
def export_readings(
    identifier: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Any signed-in user (doctor or nurse); any patient status. Scores are read, never recomputed. No limit."""
    try:
        patient = find_patient(session, identifier)
        rows = session.execute(
            select(VitalSign, ReadingScore)
            .join(ReadingScore, ReadingScore.vital_sign_id == VitalSign.id)
            .where(VitalSign.patient_id == patient.id)
            .order_by(VitalSign.recorded_at.asc(), VitalSign.id.asc())
        ).all()
        return ReadingExportResponse(readings=[to_response(v, s) for v, s in rows])
    except SQLAlchemyError as exc:
        session.rollback()
        logger.warning("Reading export failed (%s)", type(exc).__name__)
        raise HTTPException(503, "Service unavailable")
