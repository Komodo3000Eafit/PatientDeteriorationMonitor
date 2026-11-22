"""Enter and list readings with their stored scores (US-03). See specs/017-vital-signs-scoring/contracts/readings-api.md."""

import logging
from datetime import datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, StrictBool, StrictInt, StrictStr
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.models import ReadingScore, User, VitalSign
from app.patients import PATIENT_CODE, find_patient, get_session
from app.readings import record_reading
from app.scoring import ACCEPTED_LIMITS, InvalidVitalSigns, vital_signs_from_mapping

logger = logging.getLogger(__name__)


# --- Models -------------------------------------------------------------------
# Strict types keep JSON types as stored: ``true`` stays a boolean and
# ``"38.4"`` stays a string. No internal id is ever part of a response.


class EntryResponse(BaseModel):
    """One explanation entry of a stored score."""

    parameter: str
    value: StrictBool | StrictInt | StrictStr
    points: int
    low: StrictInt | StrictStr | None
    high: StrictInt | StrictStr | None
    category: list[StrictBool | StrictStr]


class ScoreResponse(BaseModel):
    """The stored score of one reading."""

    system: str
    total: int
    band: str
    entries: list[EntryResponse]


class ReadingResponse(BaseModel):
    """One reading with its stored score."""

    recorded_at: datetime
    respiratory_rate: int
    spo2: int
    on_oxygen: bool
    systolic_bp: int
    heart_rate: int
    consciousness: str
    temperature: str
    score: ScoreResponse


class ReadingListResponse(BaseModel):
    """A patient's readings, newest first."""

    readings: list[ReadingResponse]


def to_response(vital_sign: VitalSign, score: ReadingScore) -> ReadingResponse:
    """Build the API reading object from a stored reading and its stored score."""
    return ReadingResponse(
        recorded_at=vital_sign.recorded_at,
        respiratory_rate=vital_sign.respiratory_rate,
        spo2=vital_sign.spo2,
        on_oxygen=vital_sign.on_oxygen,
        systolic_bp=vital_sign.systolic_bp,
        heart_rate=vital_sign.heart_rate,
        consciousness=vital_sign.consciousness,
        temperature=str(vital_sign.temperature.quantize(Decimal("0.1"))),
        score=ScoreResponse(
            system=score.system,
            total=score.total,
            band=score.band,
            entries=[EntryResponse(**entry) for entry in score.entries],
        ),
    )


def _json_limit(bound: Any) -> Any:
    """Return a limit bound as JSON: a Decimal becomes a string ("25.0"), an int stays a number."""
    return str(bound) if isinstance(bound, Decimal) else bound


def rule_context(problem: Any) -> dict | None:
    """Return the accepted rule behind a vital-sign problem, or None.

    Built only from ``ACCEPTED_LIMITS``, never from the submitted value, so no
    input is echoed. Only ``out_of_range``, ``not_allowed`` and
    ``too_many_decimals`` have a context; any other reason or an unknown
    parameter returns None.
    """
    limit = ACCEPTED_LIMITS.get(problem.parameter)
    if limit is None:
        return None
    if problem.reason == "out_of_range":
        if limit.minimum is None or limit.maximum is None:
            return None
        return {"min": _json_limit(limit.minimum), "max": _json_limit(limit.maximum)}
    if problem.reason == "not_allowed":
        if not limit.allowed:
            return None
        return {"allowed": list(limit.allowed)}
    if problem.reason == "too_many_decimals":
        return {"decimals": limit.decimals}
    return None


def problem_detail(problem: Any) -> dict:
    """Return one 422 problem; ``ctx`` is added only when the rule has a context."""
    detail = {
        "type": problem.reason,
        "loc": ["body", problem.parameter],
        "msg": "Invalid value",
    }
    ctx = rule_context(problem)
    if ctx is not None:
        detail["ctx"] = ctx
    return detail


# --- Dependencies and lookups -------------------------------------------------


def require_nurse_recorder(user: User = Depends(get_current_user)) -> User:
    """Return the signed-in user if they are a nurse; otherwise raise 403."""
    if user.role != "nurse":
        raise HTTPException(403, "Only nurses can record vital signs")
    return user


# --- Routes -------------------------------------------------------------------

router = APIRouter()


@router.post(
    "/patients/{identifier}/readings",
    status_code=201,
    response_model=ReadingResponse,
)
def create_reading(
    identifier: str,
    body: dict[str, Any] = Body(...),
    user: User = Depends(require_nurse_recorder),
    session: Session = Depends(get_session),
):
    """Save and score one reading for an active patient (nurses only).

    Order: 404 (patient) → 409 (discharged) → 422 (vital signs) → 201. The
    reading and its score are committed together. Submitted values are never
    logged or returned in an error. Each 422 problem has ``type``, ``loc`` and
    ``msg``; ``out_of_range``, ``not_allowed`` and ``too_many_decimals`` also
    have ``ctx`` with the accepted rule from ``ACCEPTED_LIMITS`` (see
    ``rule_context``).
    """
    try:
        patient = find_patient(session, identifier)
        if patient.status == "discharged":
            raise HTTPException(409, "Patient is discharged")
        try:
            vitals = vital_signs_from_mapping(body)
        except InvalidVitalSigns as exc:
            return JSONResponse(
                status_code=422,
                content={
                    "detail": [problem_detail(problem) for problem in exc.problems]
                },
            )
        row = record_reading(session, patient.id, vitals)
        # Load the server-default ``recorded_at`` (not loaded by flush).
        session.refresh(row)
        score = session.scalars(
            select(ReadingScore).where(ReadingScore.vital_sign_id == row.id)
        ).one()
        # Built before commit: once the commit succeeds nothing else can fail,
        # so a saved reading never gets a 503 (no duplicate re-entry).
        response = to_response(row, score)
        session.commit()
        return response
    except SQLAlchemyError as exc:
        session.rollback()
        logger.warning("Reading save failed (%s)", type(exc).__name__)
        raise HTTPException(503, "Service unavailable")


@router.get("/patients/{identifier}/readings", response_model=ReadingListResponse)
def list_readings(
    identifier: str,
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Return a patient's readings with their stored scores, newest first.

    Any signed-in user; any patient status. Scores are read, never recomputed.
    """
    try:
        patient = find_patient(session, identifier)
        rows = session.execute(
            select(VitalSign, ReadingScore)
            .join(ReadingScore, ReadingScore.vital_sign_id == VitalSign.id)
            .where(VitalSign.patient_id == patient.id)
            .order_by(VitalSign.recorded_at.desc(), VitalSign.id.desc())
            .limit(limit)
        ).all()
        return ReadingListResponse(
            readings=[to_response(vital_sign, score) for vital_sign, score in rows]
        )
    except SQLAlchemyError as exc:
        session.rollback()
        logger.warning("Reading list failed (%s)", type(exc).__name__)
        raise HTTPException(503, "Service unavailable")
