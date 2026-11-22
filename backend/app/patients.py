"""Register and read patients (US-01, US-05).

See specs/015-register-patient/contracts/patients-api.md and
specs/018-patient-detail/contracts/patient-detail-api.md.
"""

import logging
import re
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import database_url, get_engine
from app.models import Patient, TriageEvent, User, VitalSign

logger = logging.getLogger(__name__)

INITIAL_REASON = "Initial triage at registration"
FIRST_CODE_NUMBER = 7
CODE_PREFIX = "PAT-"
PATIENT_CODE = re.compile(r"^[A-Z0-9-]{1,20}$")


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


class PatientDetailResponse(BaseModel):
    """Patient data plus the time of the most recent reading; no internal id, no monitoring_status."""

    identifier: str
    name: str
    age: int
    sex: str
    triage_level: int
    status: str
    admitted_at: datetime
    last_reading_at: datetime | None


class TriageEventResponse(BaseModel):
    """One triage event; no internal id, patient_id or created_by_id is ever returned."""

    occurred_at: datetime
    previous_level: int | None
    new_level: int
    score: int | None
    reason: str
    source: str


class TriageEventListResponse(BaseModel):
    """A patient's triage events, newest first."""

    triage_events: list[TriageEventResponse]


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


def find_patient(session: Session, identifier: str) -> Patient:
    """Return the patient with this code, or raise 404.

    A code that does not match ``PATIENT_CODE`` is rejected without a query.
    """
    if not PATIENT_CODE.match(identifier):
        raise HTTPException(404, "Patient not found")
    patient = session.scalars(
        select(Patient).where(Patient.identifier == identifier)
    ).first()
    if patient is None:
        raise HTTPException(404, "Patient not found")
    return patient


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


@router.get("/patients/{identifier}", response_model=PatientDetailResponse)
def get_patient(
    identifier: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Return one patient's data plus the time of its most recent reading.

    Any signed-in user (doctor or nurse). No ``monitoring_status`` is computed
    and the internal ``id`` is never returned. An unknown or badly-formatted
    code answers 404; a database error answers 503, logged by error type only.
    """
    try:
        patient = find_patient(session, identifier)
        last_reading_at = session.scalars(
            select(VitalSign.recorded_at)
            .where(VitalSign.patient_id == patient.id)
            .order_by(VitalSign.recorded_at.desc(), VitalSign.id.desc())
            .limit(1)
        ).first()
        return PatientDetailResponse(
            identifier=patient.identifier,
            name=patient.name,
            age=patient.age,
            sex=patient.sex,
            triage_level=patient.triage_level,
            status=patient.status,
            admitted_at=patient.admitted_at,
            last_reading_at=last_reading_at,
        )
    except SQLAlchemyError as exc:
        session.rollback()
        logger.warning("Patient detail failed (%s)", type(exc).__name__)
        raise HTTPException(503, "Service unavailable")


@router.get(
    "/patients/{identifier}/triage-events",
    response_model=TriageEventListResponse,
)
def list_triage_events(
    identifier: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Return a patient's triage events newest-first (any signed-in user).

    The internal ``id``, ``patient_id`` and ``created_by_id`` are never
    returned. An unknown or badly-formatted code answers 404; a database error
    answers 503, logged by error type only.
    """
    try:
        patient = find_patient(session, identifier)
        rows = session.scalars(
            select(TriageEvent)
            .where(TriageEvent.patient_id == patient.id)
            .order_by(TriageEvent.occurred_at.desc(), TriageEvent.id.desc())
        ).all()
        return TriageEventListResponse(
            triage_events=[
                TriageEventResponse(
                    occurred_at=e.occurred_at,
                    previous_level=e.previous_level,
                    new_level=e.new_level,
                    score=e.score,
                    reason=e.reason,
                    source=e.source,
                )
                for e in rows
            ]
        )
    except SQLAlchemyError as exc:
        session.rollback()
        logger.warning("Triage events failed (%s)", type(exc).__name__)
        raise HTTPException(503, "Service unavailable")
