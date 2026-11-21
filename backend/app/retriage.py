"""Re-triage suggestion logic (US-04). See specs/020-retriage-suggestion-alerts/data-model.md and research R1-R5. Reads the stored risk band only; no scoring rule lives here."""

import re
from datetime import datetime, timezone

from sqlalchemy import select

from app.models import Alert, ReadingScore, TriageEvent, VitalSign

# Band order and mappings (research R2, R3). The four values are US-03's
# RISK_BANDS; the integer order makes "strictly more urgent" one comparison.
# Only ``medium`` and ``high`` ever raise a suggestion; ``low`` and
# ``low-medium`` are absent from BAND_SEVERITY / BAND_STEP on purpose.
BAND_ORDER = {"low": 0, "low-medium": 1, "medium": 2, "high": 3}
BAND_SEVERITY = {"medium": "medium", "high": "high"}
BAND_STEP = {"medium": 1, "high": 2}

# Canonical machine tag (data-model.md section "Message/reason shape"). It
# carries only derived data (the raising band and the computed suggested level),
# so it is not a submitted value or an internal id.
_TAG_PATTERN = re.compile(
    r"^\[retriage band=(?P<band>medium|high);suggested=(?P<n>[1-5])\]\s*(?P<human>.*)$"
)

# The human sentence and the reason are stored in one Text column (alerts has no
# reason column). They are joined with this separator so the API can split the
# human sentence (returned as ``message``) from the reason (returned as
# ``reason``) after stripping the tag.
REASON_SEPARATOR = "\n"


def suggested_level(current_level: int, band: str) -> int:
    """Return the suggested, more urgent triage level, clamped at Triage I (1)."""
    return max(1, current_level - BAND_STEP[band])


def _triage_label(level: int) -> str:
    """Return a fixed, value-safe label for a triage level (e.g. ``Triage III``)."""
    numerals = {1: "I", 2: "II", 3: "III", 4: "IV", 5: "V"}
    return f"Triage {numerals.get(level, level)}"


def build_message(
    band: str, current_level: int, suggested_lvl: int, reason_text: str
) -> str:
    """Return the stored ``message``: machine tag, a fixed human sentence, then the reason.

    The leading ``[retriage band=...;suggested=...]`` tag records the raising
    band and the suggested level for the no-duplicate comparison (read back with
    ``read_tag``). The human sentence names the band and the current and
    suggested triage level. The reason (vital signs and points) follows on its
    own line so the API can return the human sentence and the reason separately.
    All text is fixed-shape and value-safe (no submitted values, no internal
    ids).
    """
    human = (
        f"Risk is {band}. Suggest re-triage from "
        f"{_triage_label(current_level)} to {_triage_label(suggested_lvl)}."
    )
    return f"[retriage band={band};suggested={suggested_lvl}] {human}{REASON_SEPARATOR}{reason_text}"


def read_tag(message: str) -> tuple[str, int] | None:
    """Parse the leading machine tag of ``message`` into ``(band, suggested_level)``.

    Returns ``None`` when the tag is absent. Only the first line is inspected,
    so a reason stored on a later line never affects the match.
    """
    first_line = message.split(REASON_SEPARATOR, 1)[0]
    match = _TAG_PATTERN.match(first_line)
    if match is None:
        return None
    return match.group("band"), int(match.group("n"))


def strip_tag(message: str) -> tuple[str, str]:
    """Return ``(human_sentence, reason)`` from a stored ``message``.

    The machine tag is removed and never returned to the client. When the tag is
    absent the whole first line is treated as the human sentence.
    """
    first_line, _, reason = message.partition(REASON_SEPARATOR)
    match = _TAG_PATTERN.match(first_line)
    human = match.group("human") if match else first_line
    return human, reason


def reason_from_entries(entries: list) -> str:
    """Return a fixed-shape, value-safe line of the parameters that scored points.

    Built only from the stored explanation ``entries`` of a reading's score
    (US-03). Each entry that scored one or more points contributes
    ``"<parameter> +<points>"``; entries scoring zero are omitted. No raw vital
    value is included, so no submitted value is echoed. Never recomputes a score.
    """
    parts = [
        f"{entry['parameter']} +{entry['points']}"
        for entry in entries
        if entry.get("points", 0) > 0
    ]
    return ", ".join(parts)


def _previous_band(session, patient_id: int, current_vital_sign_id: int) -> str | None:
    """Return the band of the patient's most recent reading other than the current one.

    Reads the stored ``reading_scores.band`` (US-03); never recomputes the score.
    Returns ``None`` when the patient has no earlier scored reading.
    """
    return session.scalars(
        select(ReadingScore.band)
        .join(VitalSign, VitalSign.id == ReadingScore.vital_sign_id)
        .where(VitalSign.patient_id == patient_id)
        .where(VitalSign.id != current_vital_sign_id)
        .order_by(VitalSign.recorded_at.desc(), VitalSign.id.desc())
        .limit(1)
    ).first()


def _open_suggestion_band(session, patient_id: int) -> str | None:
    """Return the raising band of the patient's open suggestion alert, or ``None``.

    Reads the band back from the open alert's message tag (R4/R5). An open alert
    whose message has no tag (not a suggestion) is ignored.
    """
    messages = session.scalars(
        select(Alert.message)
        .where(Alert.patient_id == patient_id)
        .where(Alert.status == "open")
        .order_by(Alert.created_at.desc(), Alert.id.desc())
    ).all()
    for message in messages:
        tag = read_tag(message)
        if tag is not None:
            return tag[0]
    return None


def evaluate_retriage(session, patient, score) -> None:
    """Raise one open re-triage suggestion alert when the stored band crosses up.

    Called once by ``record_reading`` after the ``ReadingScore`` is flushed, in
    the caller's transaction (this helper never commits). Rules (research R1-R5):

    - only for an ``active`` patient;
    - only when a previous stored reading exists and the new stored band is
      strictly more urgent than it;
    - only when the new band is ``medium`` or ``high`` (``BAND_SEVERITY``);
    - only when the suggested level is strictly more urgent than the current
      level (a patient already at Triage I is skipped);
    - no second open suggestion unless the new band is strictly more urgent than
      the open alert's recorded raising band (no-duplicate rule, R5).

    The band is read from the stored score only; the score is never recomputed and
    this creation never changes ``triage_level`` nor writes a ``source='automatic'``
    triage event (FR-005, AC2).
    """
    if patient.status != "active":
        return
    if score.band not in BAND_SEVERITY:
        return
    previous_band = _previous_band(session, patient.id, score.vital_sign_id)
    if previous_band is None:
        return
    if BAND_ORDER[score.band] <= BAND_ORDER[previous_band]:
        return
    new_level = suggested_level(patient.triage_level, score.band)
    if new_level >= patient.triage_level:
        return
    open_band = _open_suggestion_band(session, patient.id)
    if open_band is not None and BAND_ORDER[score.band] <= BAND_ORDER[open_band]:
        return
    message = build_message(
        score.band,
        patient.triage_level,
        new_level,
        reason_from_entries(score.entries),
    )
    session.add(
        Alert(
            patient_id=patient.id,
            severity=BAND_SEVERITY[score.band],
            message=message,
            status="open",
        )
    )


def accept_suggestion(session, patient, alert, user_id: int) -> None:
    """Apply an accepted suggestion: set the level, add a manual triage event, acknowledge.

    The suggested level is read from the alert's message tag. The triage event is
    ``source='manual'`` with ``score=None`` (a manual re-triage records a
    clinician's decision, not a score, matching US-01's initial event). Does not
    commit.
    """
    tag = read_tag(alert.message)
    suggested = tag[1]
    previous_level = patient.triage_level
    now = datetime.now(timezone.utc)
    patient.triage_level = suggested
    _, reason = strip_tag(alert.message)
    session.add(
        TriageEvent(
            patient_id=patient.id,
            occurred_at=now,
            previous_level=previous_level,
            new_level=suggested,
            score=None,
            reason=f"Accepted re-triage suggestion. {reason}".strip(),
            source="manual",
            created_by_id=user_id,
        )
    )
    alert.status = "acknowledged"
    alert.acknowledged_by_id = user_id
    alert.acknowledged_at = now


def dismiss_suggestion(session, alert, user_id: int) -> None:
    """Acknowledge a suggestion with no level change and no triage event. Does not commit."""
    alert.status = "acknowledged"
    alert.acknowledged_by_id = user_id
    alert.acknowledged_at = datetime.now(timezone.utc)
