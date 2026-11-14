"""NEWS2 (Royal College of Physicians, 2017), SpO2 Scale 1 only. The only module that knows NEWS2 rules (FR-006). Source: specs/007-clinical-scoring-module/research.md R1. Scale 2 (hypercapnic patients) is not implemented."""

from collections.abc import Sequence
from decimal import Decimal as D

from .base import PARAMETERS, ParameterScore, ScoreResult, VitalSigns
from .limits import validate_vital_signs

# (low, high, points), inclusive bounds; None = open end. Ordered and contiguous.
NUMERIC_BANDS = {
    "respiratory_rate": ((None, 8, 3), (9, 11, 1), (12, 20, 0), (21, 24, 2), (25, None, 3)),
    "spo2": ((None, 91, 3), (92, 93, 2), (94, 95, 1), (96, None, 0)),
    "systolic_bp": ((None, 90, 3), (91, 100, 2), (101, 110, 1), (111, 219, 0), (220, None, 3)),
    "heart_rate": (
        (None, 40, 3),
        (41, 50, 1),
        (51, 90, 0),
        (91, 110, 1),
        (111, 130, 2),
        (131, None, 3),
    ),
    "temperature": (
        (None, D("35.0"), 3),
        (D("35.1"), D("36.0"), 1),
        (D("36.1"), D("38.0"), 0),
        (D("38.1"), D("39.0"), 1),
        (D("39.1"), None, 2),
    ),
}

# (values, points) for yes/no and code parameters.
CATEGORY_BANDS = {
    "on_oxygen": (((True,), 2), ((False,), 0)),
    "consciousness": ((("A",), 0), (("C", "V", "P", "U"), 3)),
}


def band_for(points: Sequence[int]) -> str:
    """NEWS2 risk band: total >= 7 high; >= 5 medium; any single parameter scoring 3 low-medium; else low."""
    total = sum(points)
    if total >= 7:
        return "high"
    if total >= 5:
        return "medium"
    if 3 in points:
        return "low-medium"
    return "low"


class News2:
    """NEWS2 Scale 1 scoring system (table-driven)."""

    name = "NEWS2"

    def score(self, vitals: VitalSigns) -> ScoreResult:
        """Validate, then score each parameter in PARAMETERS order."""
        validate_vital_signs(vitals)
        entries = []
        for name in PARAMETERS:
            value = getattr(vitals, name)
            if name in NUMERIC_BANDS:
                if name == "temperature":
                    value = D(str(value)).quantize(D("0.1"))
                for low, high, points in NUMERIC_BANDS[name]:
                    if (low is None or value >= low) and (high is None or value <= high):
                        entries.append(ParameterScore(name, value, points, low, high))
                        break
                else:
                    raise AssertionError(f"no band matched for {name}")
            else:
                for values, points in CATEGORY_BANDS[name]:
                    if value in values:
                        entries.append(ParameterScore(name, value, points, category=values))
                        break
                else:
                    raise AssertionError(f"no band matched for {name}")
        points = [e.points for e in entries]
        return ScoreResult("NEWS2", sum(points), band_for(points), tuple(entries))


NEWS2 = News2()
