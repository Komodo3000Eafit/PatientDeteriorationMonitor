"""Scoring interface tests (TS-07): FR-001, FR-006, FR-007; research R9.

All values are made up (constitution VI); no database or network is used.
"""

import dataclasses
from decimal import Decimal
from pathlib import Path

import pytest

import app
import app.scoring
from app.scoring import (
    PARAMETERS,
    RISK_BANDS,
    ParameterScore,
    VitalSigns,
    get_scoring_system,
)

CONTRACT_NAMES = {
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
}

SAMPLES = [
    VitalSigns(16, 98, False, 120, 70, "A", Decimal("37.0")),
    VitalSigns(22, 95, False, 115, 95, "V", Decimal("37.5")),
    VitalSigns(26, 91, True, 95, 120, "A", Decimal("38.5")),
]


def test_selection_point():
    """AC1, AC5, FR-001, FR-006: one selection point returns the current system."""
    system = get_scoring_system()
    assert system.name == "NEWS2"
    assert callable(system.score)
    assert len(app.scoring.__all__) == 13
    assert set(app.scoring.__all__) == CONTRACT_NAMES
    assert get_scoring_system() is get_scoring_system()


@pytest.mark.parametrize("vitals", SAMPLES)
def test_result_shape(vitals):
    """AC1, FR-001: system name, one entry per parameter in order, total = sum, known band."""
    result = get_scoring_system().score(vitals)
    assert result.system == "NEWS2"
    assert [e.parameter for e in result.parameters] == list(PARAMETERS)
    assert result.total == sum(e.points for e in result.parameters)
    assert result.band in RISK_BANDS


def test_pure():
    """FR-007: scoring is deterministic and its data types are immutable."""
    vitals = SAMPLES[1]
    first = get_scoring_system().score(vitals)
    second = get_scoring_system().score(vitals)
    assert first == second

    with pytest.raises(dataclasses.FrozenInstanceError):
        first.total = 99
    with pytest.raises(dataclasses.FrozenInstanceError):
        first.parameters[0].points = 99
    assert isinstance(first.parameters[0], ParameterScore)
    with pytest.raises(dataclasses.FrozenInstanceError):
        vitals.heart_rate = 200


def test_news2_confined():
    """AC5, FR-006, SC-004: no .py file under app/ outside scoring/ mentions NEWS2."""
    root = Path(app.__file__).parent
    scoring_dir = root / "scoring"
    offenders = [
        str(path.relative_to(root))
        for path in root.rglob("*.py")
        if scoring_dir not in path.parents
        and "news2" in path.read_text(encoding="utf-8").lower()
    ]
    assert offenders == [], f"NEWS2 referenced outside app/scoring: {offenders}"
