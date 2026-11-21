"""Register patients (US-01). See specs/015-register-patient/contracts/patients-api.md."""

import logging
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import database_url, get_engine
from app.models import Patient, TriageEvent, User

logger = logging.getLogger(__name__)

INITIAL_REASON = "Initial triage at registration"
FIRST_CODE_NUMBER = 7
CODE_PREFIX = "PAT-"


# --- Models -------------------------------------------------------------------


class PatientCreate(BaseModel):
    """Registration body. Unknown fields (including ``identifier``) are rejected."""

    model_config = ConfigDict(extra="forbid")

    name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
    ]
    age: Annotated[int, Field(strict=True, ge=0, le=130)]
    sex: Literal["female", "male", "other"]
    triage_level: Annotated[int, Field(strict=True, ge=1, le=5)]


class PatientResponse(BaseModel):
    """A registered patient; the internal ``id`` is never returned."""

    identifier: str
    name: str
    age: int
    sex: str
    triage_level: int
    status: str
    admitted_at: datetime


# --- Dependencies -------------------------------------------------------------


def get_session():
    """FastAPI dependency: yield a database session, or raise 503 if not configured."""
    if database_url() is None:
        raise HTTPException(503, "Service unavailable")
    session = Session(get_engine())
    try:
        yield session
    finally:
        session.close()


def require_nurse(user: User = Depends(get_current_user)) -> User:
    """Return the signed-in user if they are a nurse; otherwise raise 403."""
    if user.role != "nurse":
        raise HTTPException(403, "Only nurses can register patients")
    return user


# --- Logic --------------------------------------------------------------------


def next_patient_code(session: Session) -> str:
    """Return the next patient code: highest ``PAT-<digits>`` + 1, never below PAT-007.

    Codes that are not ``PAT-`` followed by ASCII digits are ignored; gaps are
    not filled.
    """
    identifiers = session.scalars(
        select(Patient.identifier).where(Patient.identifier.startswith(CODE_PREFIX))
    ).all()
    highest = 0
    for identifier in identifiers:
        suffix = identifier[len(CODE_PREFIX):]
        if suffix.isascii() and suffix.isdigit():
            highest = max(highest, int(suffix))
    number = max(highest + 1, FIRST_CODE_NUMBER)
    return f"{CODE_PREFIX}{number:03d}"


def register_patient(session: Session, data: PatientCreate, user_id: int) -> Patient:
    """Store the patient and its initial triage event together (all or nothing).

    A code conflict (``IntegrityError``) is retried once; a second conflict gives
    409. Any other database error gives 503 and is logged by error type only.
    Submitted values are never logged or returned in an error.
    """
    for _attempt in range(2):
        try:
            now = datetime.now(timezone.utc)
            patient = Patient(
                identifier=next_patient_code(session),
                name=data.name,
                age=data.age,
                sex=data.sex,
                triage_level=data.triage_level,
                status="active",
                admitted_at=now,
            )
            session.add(patient)
            session.flush()
            session.add(
                TriageEvent(
                    patient_id=patient.id,
                    occurred_at=now,
                    previous_level=None,
                    new_level=data.triage_level,
                    score=None,
                    reason=INITIAL_REASON,
                    source="initial",
                    created_by_id=user_id,
                )
            )
            session.commit()
            session.refresh(patient)
            return patient
        except IntegrityError:
            session.rollback()
        except SQLAlchemyError as exc:
            session.rollback()
            logger.warning("Patient registration failed (%s)", type(exc).__name__)
            raise HTTPException(503, "Service unavailable")
    raise HTTPException(409, "Could not assign a patient code; try again")


# --- Routes -------------------------------------------------------------------

router = APIRouter()


@router.post("/patients", status_code=201, response_model=PatientResponse)
def create_patient(
    body: PatientCreate,
    user: User = Depends(require_nurse),
    session: Session = Depends(get_session),
):
    """Register a patient with its initial triage level (nurses only).

    The response is built here, while the session is still open, so no expired
    ORM attribute is read after the session closes.
    """
    patient = register_patient(session, body, user.id)
    return PatientResponse.model_validate(patient, from_attributes=True)
