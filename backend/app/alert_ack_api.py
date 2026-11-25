"""Alert acknowledgement: a nurse's "seen" marker on an open alert (US-07).

See specs/023-alert-acknowledgement/contracts/alert-ack-api.md and DECISIONS D-56.

A nurse marks an open alert as seen: who and when are stored in the existing
``alerts.acknowledged_by_id`` / ``alerts.acknowledged_at`` columns and ``status``
stays ``open``, so the doctor still accepts or dismisses it with US-04. The first
nurse wins (one conditional UPDATE). Nothing here changes the triage level,
creates a triage event or touches the alert's status, severity, message or
creation time.
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

# alerts.id is a Postgres INTEGER; a larger id can never match and would make the
# driver fail (503), so it is answered as an unknown alert (404) without a query.
_MAX_ALERT_ID = 2_147_483_647


# --- Models -------------------------------------------------------------------
# Never carries a user id, username, patient_id, severity or message.


class AlertAck(BaseModel):
    """The shown alert and its acknowledgement state."""

    id: int
    status: str
    state: str  # "not_seen", "seen" or "handled"
    by: str | None
    at: datetime | None


class AckResponse(BaseModel):
    """The patient's shown alert, or null when the patient has no alert."""

    alert: AlertAck | None


# --- Dependencies and helpers -------------------------------------------------


def require_nurse_marker(user: User = Depends(get_current_user)) -> User:
    """Return the signed-in user if they are a nurse; otherwise raise 403."""
    if user.role != "nurse":
        raise HTTPException(403, "Only nurses can mark alerts as seen")
    return user


def _shown_alert(session: Session, patient_id: int) -> AlertAck | None:
    """Return the shown alert: newest open alert, else newest alert (one query)."""
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


@router.get(
    "/patients/{identifier}/alerts/acknowledgement", response_model=AckResponse
)
def get_acknowledgement(
    identifier: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Return the patient's shown alert and its state (any signed-in clinician).

    Read only. 404 for an unknown or malformed patient code; 503 on a database error.
    """
    try:
        patient = find_patient(session, identifier)
        return AckResponse(alert=_shown_alert(session, patient.id))
    except SQLAlchemyError as exc:
        session.rollback()
        logger.warning("Alert acknowledgement failed (%s)", type(exc).__name__)
        raise HTTPException(503, "Service unavailable")


@router.post(
    "/patients/{identifier}/alerts/{alert_id}/seen", response_model=AckResponse
)
def mark_seen(
    identifier: str,
    alert_id: int,
    user: User = Depends(require_nurse_marker),
    session: Session = Depends(get_session),
):
    """Mark an open alert as seen by the signed-in nurse (first nurse wins).

    401/403 come from the dependencies; then 404 (patient or alert), 409 when the
    alert is acknowledged or already seen, 200 with the shown alert after the
    change. 503 on a database error, with everything rolled back.
    """
    try:
        patient = find_patient(session, identifier)
        if alert_id < 1 or alert_id > _MAX_ALERT_ID:
            raise HTTPException(404, "Alert not found")
        found = session.execute(
            select(Alert.id).where(
                Alert.id == alert_id, Alert.patient_id == patient.id
            )
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
        # Build the answer in the same transaction (the session sees its own
        # update), so a failure here rolls back and nothing is stored on 503.
        answer = AckResponse(alert=_shown_alert(session, patient.id))
        session.commit()
        return answer
    except SQLAlchemyError as exc:
        session.rollback()
        logger.warning("Alert acknowledgement failed (%s)", type(exc).__name__)
        raise HTTPException(503, "Service unavailable")
