"""Validation and accepted-limits tests (TS-07): FR-005, FR-011; research R5-R7.

Imports only from app.scoring (the public interface). All values are made up
(constitution VI); no database or network is used.
"""

from decimal import Decimal

import pytest

from app.scoring import (
    ACCEPTED_LIMITS,
    PARAMETERS,
    InvalidVitalSigns,
    Limit,
    Problem,
    VitalSigns,
    get_scoring_system,
    vital_signs_from_mapping,
)

class SubInt(int):
    pass


class SubFloat(float):
    pass


class SubDecimal(Decimal):
    pass


class SubStr(str):
    pass


VALID = {
    "respiratory_rate": 16,
    "spo2": 98,
    "on_oxygen": False,
    "systolic_bp": 120,
    "heart_rate": 70,
    "consciousness": "A",
    "temperature": Decimal("37.0"),
}


@pytest.mark.parametrize(
    ("parameter", "value", "reason"),
    [
        ("spo2", 101, "out_of_range"),
        ("spo2", -1, "out_of_range"),
        ("heart_rate", -1, "out_of_range"),
        ("heart_rate", 301, "out_of_range"),
        ("respiratory_rate", 81, "out_of_range"),
        ("systolic_bp", 301, "out_of_range"),
        ("temperature", Decimal("24.9"), "out_of_range"),
        ("temperature", Decimal("45.1"), "out_of_range"),
        ("heart_rate", True, "wrong_type"),
        ("heart_rate", 90.5, "wrong_type"),
        ("heart_rate", 90.0, "wrong_type"),
        ("heart_rate", "90", "wrong_type"),
        ("temperature", "36.5", "wrong_type"),
        ("temperature", True, "wrong_type"),
        ("temperature", float("nan"), "out_of_range"),
        ("temperature", float("inf"), "out_of_range"),
        ("temperature", 1e30, "out_of_range"),
        ("temperature", Decimal("1E+30"), "out_of_range"),
        ("temperature", 36.55, "too_many_decimals"),
        ("temperature", Decimal("36.55"), "too_many_decimals"),
        ("on_oxygen", 1, "wrong_type"),
        ("on_oxygen", "yes", "wrong_type"),
        ("consciousness", "a", "not_allowed"),
        ("consciousness", "X", "not_allowed"),
        ("consciousness", " A", "not_allowed"),
        ("consciousness", 1, "wrong_type"),
        # T011 finding: only exact types are accepted, subclasses are wrong_type.
        ("heart_rate", SubInt(70), "wrong_type"),
        ("temperature", SubFloat(37.0), "wrong_type"),
        ("temperature", SubDecimal("37.0"), "wrong_type"),
        ("consciousness", SubStr("A"), "wrong_type"),
        # T011 finding: special Decimal values are out_of_range, never an exception.
        ("temperature", Decimal("sNaN"), "out_of_range"),
        ("temperature", Decimal("-Infinity"), "out_of_range"),
    ],
)
def test_invalid_value(parameter, value, reason):
    """AC4, FR-005, SC-002: each invalid value is rejected with its reason, never scored (R8)."""
    data = {**VALID, parameter: value}
    with pytest.raises(InvalidVitalSigns) as exc:
        vital_signs_from_mapping(data)
    assert exc.value.problems == (Problem(parameter, reason),)

    # score() validates too, so an invalid VitalSigns built directly gets no result.
    with pytest.raises(InvalidVitalSigns) as exc:
        get_scoring_system().score(VitalSigns(**data))
    assert exc.value.problems == (Problem(parameter, reason),)


def test_missing_and_unknown():
    """AC4, FR-005: missing and unknown parameters are reported."""
    without_spo2 = {k: v for k, v in VALID.items() if k != "spo2"}
    with pytest.raises(InvalidVitalSigns) as exc:
        vital_signs_from_mapping(without_spo2)
    assert exc.value.problems == (Problem("spo2", "missing"),)

    with pytest.raises(InvalidVitalSigns) as exc:
        vital_signs_from_mapping({**VALID, "pulse": 70})
    assert exc.value.problems == (Problem("pulse", "unknown"),)

    with pytest.raises(InvalidVitalSigns) as exc:
        vital_signs_from_mapping({})
    assert exc.value.problems == tuple(Problem(p, "missing") for p in PARAMETERS)


def test_unknown_key_cleaned_and_cut():
    """AC4, FR-005, T011 finding: an unknown key is cleaned and cut to 40 characters in the error."""
    with pytest.raises(InvalidVitalSigns) as exc:
        vital_signs_from_mapping({**VALID, "x" * 100 + "\nINJ": 1})
    assert exc.value.problems == (Problem("x" * 40, "unknown"),)
    assert "\n" not in str(exc.value)
    assert "INJ" not in str(exc.value)


def test_huge_integer_temperature():
    """AC4, FR-005, T011 finding: a huge integer temperature is out_of_range, not a plain ValueError."""
    with pytest.raises(InvalidVitalSigns) as exc:
        vital_signs_from_mapping({**VALID, "temperature": 10**5000})
    assert exc.value.problems == (Problem("temperature", "out_of_range"),)


def test_several_problems_listed():
    """AC4, FR-005: every problem is listed, in PARAMETERS order with unknown keys last."""
    data = {**VALID, "spo2": 101, "consciousness": "a", "x": 1}
    del data["heart_rate"]
    with pytest.raises(InvalidVitalSigns) as exc:
        vital_signs_from_mapping(data)
    assert exc.value.problems == (
        Problem("spo2", "out_of_range"),
        Problem("heart_rate", "missing"),
        Problem("consciousness", "not_allowed"),
        Problem("x", "unknown"),
    )


def test_message_has_no_values():
    """AC4, FR-005: the error message names parameters and reasons, never the input values."""
    with pytest.raises(InvalidVitalSigns) as exc:
        vital_signs_from_mapping({**VALID, "spo2": 101, "temperature": Decimal("44.77")})
    message = str(exc.value)
    assert message == "invalid vital signs: spo2: out_of_range; temperature: too_many_decimals"
    assert "101" not in message
    assert "44.77" not in message


def test_limits_edges():
    """FR-011: every exported limit is accepted and one step beyond it is rejected."""
    for parameter, limit in ACCEPTED_LIMITS.items():
        if limit.minimum is not None and limit.maximum is not None:
            step = Decimal("0.1") if limit.decimals == 1 else 1
            for value in (limit.minimum, limit.maximum):
                vitals = vital_signs_from_mapping({**VALID, parameter: value})
                assert getattr(vitals, parameter) == value
            for value in (limit.minimum - step, limit.maximum + step):
                with pytest.raises(InvalidVitalSigns) as exc:
                    vital_signs_from_mapping({**VALID, parameter: value})
                assert exc.value.problems == (Problem(parameter, "out_of_range"),), (
                    parameter,
                    value,
                )
        for value in limit.allowed:
            vitals = vital_signs_from_mapping({**VALID, parameter: value})
            assert getattr(vitals, parameter) == value


def test_limits_exported_and_read_only():
    """FR-011: ACCEPTED_LIMITS is public, matches data-model exactly and is read-only."""
    assert list(ACCEPTED_LIMITS) == list(PARAMETERS)
    assert ACCEPTED_LIMITS["respiratory_rate"] == Limit("integer", 0, 80)
    assert ACCEPTED_LIMITS["spo2"] == Limit("integer", 0, 100)
    assert ACCEPTED_LIMITS["on_oxygen"] == Limit("boolean", allowed=(False, True))
    assert ACCEPTED_LIMITS["systolic_bp"] == Limit("integer", 0, 300)
    assert ACCEPTED_LIMITS["heart_rate"] == Limit("integer", 0, 300)
    assert ACCEPTED_LIMITS["consciousness"] == Limit("code", allowed=("A", "C", "V", "P", "U"))
    assert ACCEPTED_LIMITS["temperature"] == Limit(
        "decimal", Decimal("25.0"), Decimal("45.0"), decimals=1
    )
    with pytest.raises(TypeError):
        ACCEPTED_LIMITS["spo2"] = Limit("integer", 0, 200)


def test_temperature_normalised():
    """FR-005, research R5: temperature becomes a one-decimal Decimal (no float binary error)."""
    vitals = vital_signs_from_mapping({**VALID, "temperature": 37})
    assert vitals.temperature == Decimal("37.0")
    assert str(vitals.temperature) == "37.0"

    vitals = vital_signs_from_mapping({**VALID, "temperature": 36.7})
    assert vitals.temperature == Decimal("36.7")
    assert isinstance(vitals.temperature, Decimal)
