"""Re-triage suggestion logic (US-04). See specs/020-retriage-suggestion-alerts/data-model.md and research R1-R5. Reads the stored risk band only; no scoring rule lives here."""

import re
from datetime import datetime, timezone

from sqlalchemy import select

from app.models import Alert, ReadingScore, TriageEvent, VitalSign
from app.scoring import PARAMETERS

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


def suggested_level(current_level: int, band: str) -> int:
    """Return the suggested, more urgent triage level, clamped at Triage I (1)."""
    return max(1, current_level - BAND_STEP[band])


def _triage_label(level: int) -> str:
    """Return a fixed, value-safe label for a triage level (e.g. ``Triage III``)."""
    numerals = {1: "I", 2: "II", 3: "III", 4: "IV", 5: "V"}
    return f"Triage {numerals.get(level, level)}"


def build_message(band: str, current_level: int, suggested_lvl: int) -> str:
    """Return the stored ``message``: the machine tag followed by a fixed human sentence.

    The leading ``[retriage band=...;suggested=...]`` tag records the raising
    band and the suggested level for the no-duplicate comparison (read back with
    ``read_tag``). The human sentence names the band and the current and
    suggested triage level. The reason is no longer baked into the stored
    message (CR2): it is rebuilt from the triggering reading's stored score
    entries when the API responds. All text is fixed-shape and value-safe (no
    submitted values, no internal ids).
    """
    human = (
        f"Risk is {band}. Suggest re-triage from "
        f"{_triage_label(current_level)} to {_triage_label(suggested_lvl)}."
    )
    return f"[retriage band={band};suggested={suggested_lvl}] {human}"


def read_tag(message: str) -> tuple[str, int] | None:
    """Parse the leading machine tag of ``message`` into ``(band, suggested_level)``.

    Returns ``None`` when the tag is absent.
    """
    match = _TAG_PATTERN.match(message)
    if match is None:
        return None
    return match.group("band"), int(match.group("n"))


def strip_tag(message: str) -> str:
    """Return the human sentence of a stored ``message`` with the machine tag removed.

    The machine tag is never returned to the client. When the tag is absent the
    whole message is treated as the human sentence.
    """
    match = _TAG_PATTERN.match(message)
    return match.group("human") if match else message


def reason_from_entries(entries: list) -> list[dict]:
    """Return the structured, value-safe reason: a list of ``{parameter, points}`` (CR2).

    Built only from the stored explanation ``entries`` of a reading's score
    (US-03). Each entry that scored one or more points contributes
    ``{"parameter": <code>, "points": <int>}``; entries scoring zero are
    omitted. The result is ordered by ``PARAMETERS`` so the frontend can
    translate and display it consistently. No raw vital value is included, so no
    submitted value is echoed. Never recomputes a score.
    """
    scored = {
        entry["parameter"]: int(entry["points"])
        for entry in entries
        if entry.get("points", 0) > 0
    }
    return [
        {"parameter": name, "points": scored[name]}
        for name in PARAMETERS
        if name in scored
    ]


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
    message = build_message(score.band, patient.triage_level, new_level)
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
    human = strip_tag(alert.message)
    session.add(
        TriageEvent(
            patient_id=patient.id,
            occurred_at=now,
            previous_level=previous_level,
            new_level=suggested,
            score=None,
            reason=f"Accepted re-triage suggestion. {human}".strip(),
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
