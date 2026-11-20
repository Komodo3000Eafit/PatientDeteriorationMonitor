"""Tests for the stricter CORS_ORIGINS parsing added in TS-10 (FR-009, AC8).

Contract: specs/010-backend-deployment/contracts/security-controls.md section 2.
These complement tests/test_cors.py (TS-04), which covers the default/blank and
wildcard behaviour. No test uses a database or the network.
"""

import pytest

import app.main

DEFAULT_ORIGIN = "http://localhost:5173"
INVALID_MESSAGE = "CORS_ORIGINS entries must be valid scheme://host[:port] origins"
WILDCARD_MESSAGE = "CORS_ORIGINS must not contain '*'; list the allowed origins explicitly"


@pytest.mark.parametrize(
    "value",
    [
        "null",
        "http://",
        "example.com",
        "ftp://host",
        "http://host/path",
        "http://a.example,example.com",
        "javascript:alert(1)",
        "http://host:notaport",
    ],
)
def test_invalid_entries_rejected_with_fixed_message(value):
    """AC8, FR-009: null and any malformed entry fail startup with a fixed message that never echoes the value."""
    with pytest.raises(ValueError) as excinfo:
        app.main.parse_cors_origins(value)
    message = str(excinfo.value)
    assert message == INVALID_MESSAGE
    assert value not in message


def test_all_invalid_value_does_not_fall_back_to_default():
    """AC8: a value made only of invalid entries fails rather than silently using the default."""
    with pytest.raises(ValueError) as excinfo:
        app.main.parse_cors_origins("not-an-origin")
    assert str(excinfo.value) == INVALID_MESSAGE


def test_wildcard_still_rejected_before_origin_check():
    """AC8: the existing '*' rejection keeps its own fixed message."""
    with pytest.raises(ValueError) as excinfo:
        app.main.parse_cors_origins("http://a.example,*")
    assert str(excinfo.value) == WILDCARD_MESSAGE


@pytest.mark.parametrize(
    "value, expected",
    [
        ("http://localhost:5173", ["http://localhost:5173"]),
        ("https://app.example.com", ["https://app.example.com"]),
        ("http://a.example/", ["http://a.example"]),
        (
            "http://a.example, https://b.example:8443 ",
            ["http://a.example", "https://b.example:8443"],
        ),
        ("http://a.example,,https://b.example", ["http://a.example", "https://b.example"]),
    ],
)
def test_valid_origins_parse(value, expected):
    """AC8: valid single and comma-separated origin lists parse; blanks between commas are dropped."""
    assert app.main.parse_cors_origins(value) == expected


@pytest.mark.parametrize("value", [None, "", "   ", ",", " , "])
def test_default_applies_only_when_unset_or_blank(value):
    """AC8: the default applies only when the value is unset or blank."""
    assert app.main.parse_cors_origins(value) == [DEFAULT_ORIGIN]
