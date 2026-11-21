"""Saving vital-sign readings (TS-08) and their scores (US-03). record_reading is the only place that creates vital_signs and reading_scores rows; US-03 added scoring on save. See specs/008-vital-signs-simulator/contracts/commands.md §3 and specs/017-vital-signs-scoring/data-model.md."""

from decimal import Decimal

from app.models import ReadingScore, VitalSign
from app.scoring import PARAMETERS, ScoreResult, VitalSigns, get_scoring_system

_ONE_DECIMAL = Decimal("0.1")


def _plain(value):
    """Return ``value`` as a JSON-ready value: a Decimal becomes a one-decimal string."""
    if isinstance(value, Decimal):
        return str(value.quantize(_ONE_DECIMAL))
    return value


def score_values(result: ScoreResult) -> dict:
    """Turn a ``ScoreResult`` into the column values of one reading_scores row.

    Entries keep the ``PARAMETERS`` order. Decimals (temperature value and
    bounds) become strings with one decimal (``"38.4"``); ``None`` stays
    ``None``; ``category`` becomes a list (``[]`` for numeric parameters).
    """
    return {
        "system": result.system,
        "total": result.total,
        "band": result.band,
        "entries": [
            {
                "parameter": entry.parameter,
                "value": _plain(entry.value),
                "points": entry.points,
                "low": _plain(entry.low),
                "high": _plain(entry.high),
                "category": [_plain(item) for item in entry.category],
            }
            for entry in result.parameters
        ],
    }


def record_reading(session, patient_id: int, vitals: VitalSigns) -> VitalSign:
    """Score ``vitals``, then add the vital_signs row and its reading_scores row.

    Scoring validates first: invalid values raise ``InvalidVitalSigns`` before
    anything is added to the session. Both rows are flushed; the returned
    reading row has its ``id``. This function does not commit: the caller
    commits or rolls back, so the reading and its score are saved together.
    """
    result = get_scoring_system().score(vitals)
    row = VitalSign(
        patient_id=patient_id, **{name: getattr(vitals, name) for name in PARAMETERS}
    )
    session.add(row)
    session.flush()
    session.add(ReadingScore(vital_sign_id=row.id, **score_values(result)))
    session.flush()
    return row
