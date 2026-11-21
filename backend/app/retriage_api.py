"""List and act on re-triage suggestions (US-04). See specs/020-retriage-suggestion-alerts/contracts/retriage-api.md."""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.models import Alert, User
from app.patients import get_session
from app.readings_api import find_patient
from app.retriage import accept_suggestion, dismiss_suggestion, read_tag, strip_tag

logger = logging.getLogger(__name__)


# --- Models -------------------------------------------------------------------
# No internal id other than the alert ``id`` is ever part of a response; the
# machine tag is stripped from ``message`` before it is sent.


class SuggestionResponse(BaseModel):
    """One re-triage suggestion, with the machine tag already stripped."""

    id: int
    severity: str
    message: str
    reason: str
    current_level: int
    suggested_level: int
    status: str
    created_at: datetime


class SuggestionListResponse(BaseModel):
    """A patient's suggestion alerts, newest first."""

    suggestions: list[SuggestionResponse]


def to_response(alert: Alert, current_level: int) -> SuggestionResponse:
    """Build the API suggestion object from a stored alert and the patient's level.

    The human sentence and the reason are read from the stored ``message`` with
    the machine tag stripped; ``suggested_level`` comes from the tag. The tag,
    ``patient_id`` and ``acknowledged_by_id`` are never returned.
    """
    tag = read_tag(alert.message)
    suggested = tag[1] if tag is not None else current_level
    human, reason = strip_tag(alert.message)
    return SuggestionResponse(
        id=alert.id,
        severity=alert.severity,
        message=human,
        reason=reason,
        current_level=current_level,
        suggested_level=suggested,
        status=alert.status,
        created_at=alert.created_at,
    )


# --- Dependencies -------------------------------------------------------------


def require_doctor(user: User = Depends(get_current_user)) -> User:
    """Return the signed-in user if they are a doctor; otherwise raise 403."""
    if user.role != "doctor":
        raise HTTPException(403, "Only doctors can change the triage level")
    return user


def _load_alert(session: Session, patient_id: int, alert_id: int) -> Alert:
    """Return the patient's suggestion alert by id, or raise 404 ("Suggestion not found")."""
    alert = session.scalars(
        select(Alert)
        .where(Alert.id == alert_id)
        .where(Alert.patient_id == patient_id)
    ).first()
    if alert is None:
        raise HTTPException(404, "Suggestion not found")
    return alert


# --- Routes -------------------------------------------------------------------

router = APIRouter()


@router.get(
    "/patients/{identifier}/suggestions", response_model=SuggestionListResponse
)
def list_suggestions(
    identifier: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Return a patient's re-triage suggestions, newest first (any signed-in clinician).

    Any patient status. The band/suggested level are read from storage, never
    recomputed. 404 for an unknown or malformed patient code.
    """
    try:
        patient = find_patient(session, identifier)
        alerts = session.scalars(
            select(Alert)
            .where(Alert.patient_id == patient.id)
            .order_by(Alert.created_at.desc(), Alert.id.desc())
        ).all()
        return SuggestionListResponse(
            suggestions=[to_response(alert, patient.triage_level) for alert in alerts]
        )
    except SQLAlchemyError as exc:
        session.rollback()
        logger.warning("Suggestion list failed (%s)", type(exc).__name__)
        raise HTTPException(503, "Service unavailable")


@router.post(
    "/patients/{identifier}/suggestions/{alert_id}/accept",
    response_model=SuggestionResponse,
)
def accept(
    identifier: str,
    alert_id: int,
    user: User = Depends(require_doctor),
    session: Session = Depends(get_session),
):
    """Accept a suggestion: set the triage level, write a manual triage event, acknowledge.

    Doctors only. Check order 401 -> 403 -> 404 -> 409 -> 200. All three writes
    happen in one transaction; nothing is stored on any error.
    """
    try:
        patient = find_patient(session, identifier)
        alert = _load_alert(session, patient.id, alert_id)
        if patient.status == "discharged":
            raise HTTPException(409, "Patient is discharged")
        if alert.status == "acknowledged":
            raise HTTPException(409, "Suggestion already handled")
        accept_suggestion(session, patient, alert, user.id)
        response = to_response(alert, patient.triage_level)
        session.commit()
        return response
    except SQLAlchemyError as exc:
        session.rollback()
        logger.warning("Suggestion accept failed (%s)", type(exc).__name__)
        raise HTTPException(503, "Service unavailable")


@router.post(
    "/patients/{identifier}/suggestions/{alert_id}/dismiss",
    response_model=SuggestionResponse,
)
def dismiss(
    identifier: str,
    alert_id: int,
    user: User = Depends(require_doctor),
    session: Session = Depends(get_session),
):
    """Dismiss a suggestion: acknowledge the alert only (no level change, no triage event).

    Doctors only. Check order 401 -> 403 -> 404 -> 409 -> 200. Nothing is stored
    on any error.
    """
    try:
        patient = find_patient(session, identifier)
        alert = _load_alert(session, patient.id, alert_id)
        if alert.status == "acknowledged":
            raise HTTPException(409, "Suggestion already handled")
        dismiss_suggestion(session, alert, user.id)
        response = to_response(alert, patient.triage_level)
        session.commit()
        return response
    except SQLAlchemyError as exc:
        session.rollback()
        logger.warning("Suggestion dismiss failed (%s)", type(exc).__name__)
        raise HTTPException(503, "Service unavailable")
