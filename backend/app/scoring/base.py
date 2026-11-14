"""Generic scoring types (TS-07). Nothing here is specific to NEWS2; see specs/007-clinical-scoring-module/data-model.md."""

from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol

PARAMETERS = (
    "respiratory_rate",
    "spo2",
    "on_oxygen",
    "systolic_bp",
    "heart_rate",
    "consciousness",
    "temperature",
)

RISK_BANDS = ("low", "low-medium", "medium", "high")

REASONS = (
    "missing",
    "unknown",
    "wrong_type",
    "out_of_range",
    "too_many_decimals",
    "not_allowed",
)


@dataclass(frozen=True)
class VitalSigns:
    """One set of the 7 vital signs. No validation and no defaults; see validate_vital_signs()."""

    respiratory_rate: int
    spo2: int
    on_oxygen: bool
    systolic_bp: int
    heart_rate: int
    consciousness: str
    temperature: Decimal


@dataclass(frozen=True)
class ParameterScore:
    """Explanation entry for one parameter.

    low/high are the inclusive bounds of the matched range (None = open end); category holds the
    matched values for yes/no and code parameters.
    """

    parameter: str
    value: int | bool | str | Decimal
    points: int
    low: int | Decimal | None = None
    high: int | Decimal | None = None
    category: tuple = ()


@dataclass(frozen=True)
class ScoreResult:
    """Result of scoring one set of vital signs."""

    system: str
    total: int
    band: str
    parameters: tuple[ParameterScore, ...]


class ScoringSystem(Protocol):
    """A clinical scoring system.

    Implementations MUST call validate_vital_signs(vitals) first, return entries in PARAMETERS
    order, total = sum of points, band in RISK_BANDS.
    """

    name: str

    def score(self, vitals: VitalSigns) -> ScoreResult: ...


@dataclass(frozen=True)
class Problem:
    """One validation problem. reason is one of REASONS; it never holds the input value."""

    parameter: str
    reason: str


class InvalidVitalSigns(ValueError):
    """Raised when vital signs are invalid. The message lists parameters and reasons, never values."""

    def __init__(self, problems):
        self.problems = tuple(problems)
        super().__init__(
            "invalid vital signs: "
            + "; ".join(f"{p.parameter}: {p.reason}" for p in self.problems)
        )
