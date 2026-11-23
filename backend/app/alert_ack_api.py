"""Mark an alert as seen and read its acknowledgement state (US-07).

See specs/023-alert-acknowledgement/contracts/alert-ack-api.md and D-56.

A nurse marks an open alert as seen: the person and time are stored in the
existing ``acknowledged_by_id`` / ``acknowledged_at`` columns and ``status``
stays ``open``, so the doctor still accepts or dismisses it (US-04). First nurse
wins. Nothing here changes the triage level or creates a triage event (D-41).
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import case, select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.models import Alert, User
from app.patients import find_patient, get_session

logger = logging.getLogger(__name__)


# --- Models -------------------------------------------------------------------
# No user id, username, patient id, severity or message is ever part of a response.


class AlertAck(BaseModel):
    """The shown alert and who saw or handled it, and when."""

    id: int
    status: str
    state: str
    by: str | None
    at: datetime | None


class AckResponse(BaseModel):
    """The shown alert of a patient, or null when the patient has no alert."""

    alert: AlertAck | None


# --- Dependencies -------------------------------------------------------------


def require_nurse_marker(user: User = Depends(get_current_user)) -> User:
    """Return the signed-in user if they are a nurse; otherwise raise 403."""
    if user.role != "nurse":
        raise HTTPException(403, "Only nurses can mark alerts as seen")
    return user


# --- Logic --------------------------------------------------------------------


def _shown_alert(session: Session, patient_id: int) -> AlertAck | None:
    """Return the patient's shown alert: newest open alert, else newest alert."""
    row = session.execute(
        select(Alert.id, Alert.status, Alert.acknowledged_at, User.full_name)
        .outerjoin(User, User.id == Alert.acknowledged_by_id)
        .where(Alert.patient_id == patient_id)
        .order_by(
            case((Alert.status == "open", 0), else_=1),
            Alert.created_at.desc(),
            Alert.id.desc(),
        )
        .limit(1)
    ).first()
    if row is None:
        return None
    if row.status == "acknowledged":
        state = "handled"
    elif row.full_name is not None:
        state = "seen"
    else:
        state = "not_seen"
    return AlertAck(
        id=row.id,
        status=row.status,
        state=state,
        by=row.full_name,
        at=row.acknowledged_at,
    )


# --- Routes -------------------------------------------------------------------

router = APIRouter()


@router.get("/patients/{identifier}/alerts/acknowledgement", response_model=AckResponse)
def get_acknowledgement(
    identifier: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Return the patient's shown alert and its state (any signed-in clinician). Read only."""
    try:
        patient = find_patient(session, identifier)
        return AckResponse(alert=_shown_alert(session, patient.id))
    except SQLAlchemyError as exc:
        session.rollback()
        logger.warning("Alert acknowledgement failed (%s)", type(exc).__name__)
        raise HTTPException(503, "Service unavailable")


@router.post("/patients/{identifier}/alerts/{alert_id}/seen", response_model=AckResponse)
def mark_seen(
    identifier: str,
    alert_id: int,
    user: User = Depends(require_nurse_marker),
    session: Session = Depends(get_session),
):
    """Mark an open alert of the patient as seen by the signed-in nurse.

    One conditional update scoped by alert id and patient: it succeeds only if
    the alert is open and nobody is stored yet (first nurse wins). 404 for an
    unknown patient or alert, 409 when already seen or handled, 503 on a
    database error.
    """
    try:
        patient = find_patient(session, identifier)
        found = session.execute(
            select(Alert.id).where(Alert.id == alert_id, Alert.patient_id == patient.id)
        ).first()
        if found is None:
            raise HTTPException(404, "Alert not found")
        result = session.execute(
            update(Alert)
            .where(
                Alert.id == alert_id,
                Alert.patient_id == patient.id,
                Alert.status == "open",
                Alert.acknowledged_by_id.is_(None),
            )
            .values(
                acknowledged_by_id=user.id,
                acknowledged_at=datetime.now(timezone.utc),
            )
        )
        if result.rowcount == 0:
            session.rollback()
            raise HTTPException(409, "Alert already handled")
        session.commit()
        return AckResponse(alert=_shown_alert(session, patient.id))
    except SQLAlchemyError as exc:
        session.rollback()
        logger.warning("Alert acknowledgement failed (%s)", type(exc).__name__)
        raise HTTPException(503, "Service unavailable")
