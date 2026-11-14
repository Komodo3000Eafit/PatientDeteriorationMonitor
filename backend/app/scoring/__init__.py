"""Clinical scoring (TS-07). Callers import only from app.scoring and get the current system from get_scoring_system(); see specs/007-clinical-scoring-module/contracts/scoring-interface.md."""

from .base import (
    PARAMETERS,
    RISK_BANDS,
    InvalidVitalSigns,
    ParameterScore,
    Problem,
    ScoreResult,
    ScoringSystem,
    VitalSigns,
)
from .limits import ACCEPTED_LIMITS, Limit, validate_vital_signs, vital_signs_from_mapping
from .news2 import NEWS2

__all__ = [
    "get_scoring_system",
    "VitalSigns",
    "vital_signs_from_mapping",
    "validate_vital_signs",
    "ACCEPTED_LIMITS",
    "Limit",
    "PARAMETERS",
    "RISK_BANDS",
    "ScoringSystem",
    "ScoreResult",
    "ParameterScore",
    "InvalidVitalSigns",
    "Problem",
]


def get_scoring_system() -> ScoringSystem:
    """The single selection point. To replace NEWS2, add a module with a ScoringSystem implementation and return it here."""
    return NEWS2
