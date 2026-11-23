"""Deterioration prediction rule (US-08, specs/024-deterioration-prediction, D-55).

A deterioration is predicted when the stored score totals of the patient's 3
most recent readings are strictly increasing (t1 < t2 < t3). The rule only
reads totals that were already stored; it never computes a score, never looks
at the risk band or the patient status, and never changes the triage level.
Standard library only.
"""

REASONS = ("not_enough_readings", "missing_score", "not_rising")


def is_rising(totals: list[int]) -> bool:
    """Return True if there are exactly 3 totals and they are strictly increasing."""
    return len(totals) == 3 and totals[0] < totals[1] < totals[2]


def predict(totals: list[int | None]) -> tuple[bool, str | None]:
    """Return ``(rising, reason)`` for the totals of the 3 most recent readings, oldest first.

    Precedence: fewer than 3 totals -> ``not_enough_readings``; any missing
    total -> ``missing_score``; strictly increasing -> ``(True, None)``;
    otherwise ``not_rising``.
    """
    if len(totals) < 3:
        return False, "not_enough_readings"
    if any(total is None for total in totals):
        return False, "missing_score"
    if is_rising(totals):
        return True, None
    return False, "not_rising"
