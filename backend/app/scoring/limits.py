"""Accepted value ranges and strict validation (TS-07, FR-005, FR-011). Generic plausibility limits, not NEWS2 rules; US-03 reuses ACCEPTED_LIMITS."""

from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal
from types import MappingProxyType

from .base import PARAMETERS, InvalidVitalSigns, Problem, VitalSigns


@dataclass(frozen=True)
class Limit:
    """Accepted values of one parameter. Bounds are inclusive.

    kind is "integer", "decimal", "boolean" or "code".
    """

    kind: str
    minimum: int | Decimal | None = None
    maximum: int | Decimal | None = None
    allowed: tuple = ()
    decimals: int = 0


ACCEPTED_LIMITS = MappingProxyType(
    {
        "respiratory_rate": Limit("integer", 0, 80),
        "spo2": Limit("integer", 0, 100),
        "on_oxygen": Limit("boolean", allowed=(False, True)),
        "systolic_bp": Limit("integer", 0, 300),
        "heart_rate": Limit("integer", 0, 300),
        "consciousness": Limit("code", allowed=("A", "C", "V", "P", "U")),
        "temperature": Limit("decimal", Decimal("25.0"), Decimal("45.0"), decimals=1),
    }
)

assert tuple(ACCEPTED_LIMITS) == PARAMETERS, "ACCEPTED_LIMITS must follow PARAMETERS order"


def _check(value, limit: Limit) -> str | None:
    """Return the first failing reason code for value, or None if it is accepted."""
    if limit.kind == "integer":
        if type(value) is not int:
            return "wrong_type"
        if value < limit.minimum or value > limit.maximum:
            return "out_of_range"
        return None
    if limit.kind == "decimal":
        # Exact types: subclasses could override comparisons and bypass the range check.
        if type(value) not in (int, float, Decimal):
            return "wrong_type"
        if type(value) is int:
            # Range check before any str(): str() of a huge int raises ValueError.
            if value < limit.minimum or value > limit.maximum:
                return "out_of_range"
            d = Decimal(value)
        else:
            d = Decimal(str(value))
        if not d.is_finite():
            return "out_of_range"
        if d < limit.minimum or d > limit.maximum:
            return "out_of_range"
        # The range check comes first: quantize() raises InvalidOperation for huge values.
        if d != d.quantize(Decimal(1).scaleb(-limit.decimals)):
            return "too_many_decimals"
        return None
    if limit.kind == "boolean":
        if type(value) is not bool:
            return "wrong_type"
        return None
    if limit.kind == "code":
        if type(value) is not str:
            return "wrong_type"
        if value not in limit.allowed:
            return "not_allowed"
        return None
    raise AssertionError("unknown limit kind")


def validate_vital_signs(vitals: VitalSigns) -> None:
    """Raise InvalidVitalSigns listing every bad field, in PARAMETERS order."""
    problems = []
    for name in PARAMETERS:
        reason = _check(getattr(vitals, name), ACCEPTED_LIMITS[name])
        if reason is not None:
            problems.append(Problem(name, reason))
    if problems:
        raise InvalidVitalSigns(problems)


def vital_signs_from_mapping(data: Mapping) -> VitalSigns:
    """Validate a plain mapping and build VitalSigns.

    Reports missing and bad parameters in PARAMETERS order, then unknown keys in sorted order,
    and raises InvalidVitalSigns once with all of them.
    """
    problems = []
    for name in PARAMETERS:
        if name not in data:
            problems.append(Problem(name, "missing"))
            continue
        reason = _check(data[name], ACCEPTED_LIMITS[name])
        if reason is not None:
            problems.append(Problem(name, reason))
    # Unknown key names are cleaned (non-printable characters removed) and cut to 40 characters.
    unknown = ("".join(c for c in str(k) if c.isprintable())[:40] for k in data if k not in PARAMETERS)
    for key in sorted(unknown):
        problems.append(Problem(key, "unknown"))
    if problems:
        raise InvalidVitalSigns(problems)
    values = {name: data[name] for name in PARAMETERS}
    values["temperature"] = Decimal(str(values["temperature"])).quantize(Decimal("0.1"))
    return VitalSigns(**values)
