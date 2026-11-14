"""NEWS2 scoring tests (TS-07): FR-003, FR-004, FR-009; research R1 (RCP chart) and R4.

The boundary list below is written by hand from the RCP NEWS2 chart 1 (research R1). It is
NOT generated from the tables in app.scoring.news2, so a typo in those tables fails here.
app.scoring.news2 is imported only to read its tables (coverage test) and band_for.
All values are made up (constitution VI); no database or network is used.
"""

from dataclasses import replace
from decimal import Decimal

import pytest

from app.scoring import (
    ACCEPTED_LIMITS,
    ParameterScore,
    ScoreResult,
    VitalSigns,
    get_scoring_system,
    vital_signs_from_mapping,
)
from app.scoring import news2

D = Decimal


def normal(**overrides) -> VitalSigns:
    """A set of 7 normal vital signs (NEWS2 total 0), with overrides."""
    return replace(VitalSigns(16, 98, False, 120, 70, "A", D("37.0")), **overrides)


def score(v: VitalSigns) -> ScoreResult:
    return get_scoring_system().score(v)


def entry(result: ScoreResult, parameter: str) -> ParameterScore:
    return next(e for e in result.parameters if e.parameter == parameter)


# Hand-written from the RCP chart (research R1): both sides of every threshold, plus the
# accepted-range extremes. (parameter, value, points)
BOUNDARIES = [
    # Respiratory rate: <=8 -> 3; 9-11 -> 1; 12-20 -> 0; 21-24 -> 2; >=25 -> 3
    ("respiratory_rate", 0, 3),
    ("respiratory_rate", 8, 3),
    ("respiratory_rate", 9, 1),
    ("respiratory_rate", 11, 1),
    ("respiratory_rate", 12, 0),
    ("respiratory_rate", 20, 0),
    ("respiratory_rate", 21, 2),
    ("respiratory_rate", 24, 2),
    ("respiratory_rate", 25, 3),
    ("respiratory_rate", 80, 3),
    # SpO2 Scale 1: <=91 -> 3; 92-93 -> 2; 94-95 -> 1; >=96 -> 0
    ("spo2", 0, 3),
    ("spo2", 91, 3),
    ("spo2", 92, 2),
    ("spo2", 93, 2),
    ("spo2", 94, 1),
    ("spo2", 95, 1),
    ("spo2", 96, 0),
    ("spo2", 100, 0),
    # Systolic BP: <=90 -> 3; 91-100 -> 2; 101-110 -> 1; 111-219 -> 0; >=220 -> 3
    ("systolic_bp", 0, 3),
    ("systolic_bp", 90, 3),
    ("systolic_bp", 91, 2),
    ("systolic_bp", 100, 2),
    ("systolic_bp", 101, 1),
    ("systolic_bp", 110, 1),
    ("systolic_bp", 111, 0),
    ("systolic_bp", 219, 0),
    ("systolic_bp", 220, 3),
    ("systolic_bp", 300, 3),
    # Heart rate: <=40 -> 3; 41-50 -> 1; 51-90 -> 0; 91-110 -> 1; 111-130 -> 2; >=131 -> 3
    ("heart_rate", 0, 3),
    ("heart_rate", 40, 3),
    ("heart_rate", 41, 1),
    ("heart_rate", 50, 1),
    ("heart_rate", 51, 0),
    ("heart_rate", 90, 0),
    ("heart_rate", 91, 1),
    ("heart_rate", 110, 1),
    ("heart_rate", 111, 2),
    ("heart_rate", 130, 2),
    ("heart_rate", 131, 3),
    ("heart_rate", 300, 3),
    # Temperature: <=35.0 -> 3; 35.1-36.0 -> 1; 36.1-38.0 -> 0; 38.1-39.0 -> 1; >=39.1 -> 2
    ("temperature", D("25.0"), 3),
    ("temperature", D("35.0"), 3),
    ("temperature", D("35.1"), 1),
    ("temperature", D("36.0"), 1),
    ("temperature", D("36.1"), 0),
    ("temperature", D("38.0"), 0),
    ("temperature", D("38.1"), 1),
    ("temperature", D("39.0"), 1),
    ("temperature", D("39.1"), 2),
    ("temperature", D("45.0"), 2),
    # Supplemental oxygen: yes -> 2; no (air) -> 0
    ("on_oxygen", True, 2),
    ("on_oxygen", False, 0),
    # Consciousness: A -> 0; C, V, P or U -> 3
    ("consciousness", "A", 0),
    ("consciousness", "C", 3),
    ("consciousness", "V", 3),
    ("consciousness", "P", 3),
    ("consciousness", "U", 3),
]


@pytest.mark.parametrize(("parameter", "value", "points"), BOUNDARIES)
def test_boundary_points(parameter, value, points):
    """AC2, FR-003, SC-001: both sides of every threshold score as in the RCP chart."""
    result = score(normal(**{parameter: value}))
    assert entry(result, parameter).points == points
    # All other parameters are normal (0 points), so the total equals this entry's points.
    assert result.total == points


def test_entry_range():
    """AC1, FR-002: the matched range (bounds or category) is copied into the entry."""
    assert entry(score(normal(heart_rate=95)), "heart_rate") == ParameterScore(
        "heart_rate", 95, 1, 91, 110, ()
    )

    e = entry(score(normal(spo2=97)), "spo2")
    assert e.low == 96
    assert e.high is None

    e = entry(score(normal(respiratory_rate=5)), "respiratory_rate")
    assert e.low is None
    assert e.high == 8

    e = entry(score(normal(consciousness="V")), "consciousness")
    assert e.category == ("C", "V", "P", "U")
    assert e.low is None
    assert e.high is None

    e = entry(score(normal(on_oxygen=True)), "on_oxygen")
    assert e.category == (True,)

    e = entry(score(normal(temperature=36.7)), "temperature")
    assert e.value == D("36.7")
    assert e.low == D("36.1")
    assert e.high == D("38.0")


def test_table_coverage():
    """Research R4, FR-009: NEWS2 tables are contiguous, open-ended and fully boundary-tested."""
    tested = {(p, v) for p, v, _ in BOUNDARIES}
    for parameter, bands in news2.NUMERIC_BANDS.items():
        step = D("0.1") if parameter == "temperature" else 1
        assert bands[0][0] is None, parameter
        assert bands[-1][1] is None, parameter
        for (_, prev_high, _), (next_low, _, _) in zip(bands, bands[1:]):
            assert next_low == prev_high + step, (parameter, prev_high, next_low)
        for low, high, _ in bands:
            for bound in (low, high):
                if bound is not None:
                    assert (parameter, bound) in tested, (parameter, bound)

    for parameter, rows in news2.CATEGORY_BANDS.items():
        values = [v for row_values, _ in rows for v in row_values]
        assert len(values) == len(set(values)), parameter
        assert set(values) == set(ACCEPTED_LIMITS[parameter].allowed), parameter
        assert len(values) == len(ACCEPTED_LIMITS[parameter].allowed), parameter


@pytest.mark.parametrize(
    ("overrides", "total", "band"),
    [
        ({}, 0, "low"),
        ({"respiratory_rate": 22, "spo2": 95, "heart_rate": 95}, 4, "low"),
        ({"consciousness": "V"}, 3, "low-medium"),
        ({"consciousness": "V", "heart_rate": 95}, 4, "low-medium"),
        ({"respiratory_rate": 21, "spo2": 94, "systolic_bp": 105, "heart_rate": 100}, 5, "medium"),
        # A single 3 with total >= 5 is medium, not low-medium.
        ({"systolic_bp": 90, "respiratory_rate": 22}, 5, "medium"),
        ({"systolic_bp": 90, "respiratory_rate": 22, "heart_rate": 95}, 6, "medium"),
        ({"systolic_bp": 90, "respiratory_rate": 22, "on_oxygen": True}, 7, "high"),
        # Maximum possible score: temperature <=35.0 scores 3.
        (
            {
                "respiratory_rate": 30,
                "spo2": 85,
                "on_oxygen": True,
                "systolic_bp": 80,
                "heart_rate": 140,
                "consciousness": "U",
                "temperature": D("34.0"),
            },
            20,
            "high",
        ),
    ],
)
def test_bands(overrides, total, band):
    """AC3, FR-004: every band, including the single-3 rule and totals 4/5 and 6/7."""
    result = score(normal(**overrides))
    assert result.total == total
    assert result.band == band


def _ps(parameter, value, points, low=None, high=None, category=()):
    return ParameterScore(parameter, value, points, low, high, category)


def test_worked_examples():
    """AC1, FR-009: three full worked examples checked by hand (system, total, band, every entry)."""
    # 1. All normal -> 0, low.
    assert score(normal()) == ScoreResult(
        "NEWS2",
        0,
        "low",
        (
            _ps("respiratory_rate", 16, 0, 12, 20),
            _ps("spo2", 98, 0, 96, None),
            _ps("on_oxygen", False, 0, category=(False,)),
            _ps("systolic_bp", 120, 0, 111, 219),
            _ps("heart_rate", 70, 0, 51, 90),
            _ps("consciousness", "A", 0, category=("A",)),
            _ps("temperature", D("37.0"), 0, D("36.1"), D("38.0")),
        ),
    )

    # 2. The contract example: 2 + 1 + 0 + 0 + 1 + 0 + 0 = 4, low.
    vitals = vital_signs_from_mapping(
        {
            "respiratory_rate": 22,
            "spo2": 95,
            "on_oxygen": False,
            "systolic_bp": 115,
            "heart_rate": 95,
            "consciousness": "A",
            "temperature": D("37.5"),
        }
    )
    assert score(vitals) == ScoreResult(
        "NEWS2",
        4,
        "low",
        (
            _ps("respiratory_rate", 22, 2, 21, 24),
            _ps("spo2", 95, 1, 94, 95),
            _ps("on_oxygen", False, 0, category=(False,)),
            _ps("systolic_bp", 115, 0, 111, 219),
            _ps("heart_rate", 95, 1, 91, 110),
            _ps("consciousness", "A", 0, category=("A",)),
            _ps("temperature", D("37.5"), 0, D("36.1"), D("38.0")),
        ),
    )

    # 3. Sick patient: 3 + 3 + 2 + 2 + 2 + 0 + 1 = 13, high.
    vitals = VitalSigns(26, 91, True, 95, 120, "A", D("38.5"))
    assert score(vitals) == ScoreResult(
        "NEWS2",
        13,
        "high",
        (
            _ps("respiratory_rate", 26, 3, 25, None),
            _ps("spo2", 91, 3, None, 91),
            _ps("on_oxygen", True, 2, category=(True,)),
            _ps("systolic_bp", 95, 2, 91, 100),
            _ps("heart_rate", 120, 2, 111, 130),
            _ps("consciousness", "A", 0, category=("A",)),
            _ps("temperature", D("38.5"), 1, D("38.1"), D("39.0")),
        ),
    )


@pytest.mark.parametrize(
    ("points", "band"),
    [
        ([0] * 7, "low"),
        ([3, 0, 0, 0, 0, 0, 1], "low-medium"),
        ([2, 2, 0, 0, 0, 0, 0], "low"),
        ([2, 2, 1, 0, 0, 0, 0], "medium"),
        ([3, 2, 2, 0, 0, 0, 0], "high"),
    ],
)
def test_band_for_rule(points, band):
    """AC3, FR-004: the NEWS2 band rule applied to lists of points."""
    assert news2.band_for(points) == band
