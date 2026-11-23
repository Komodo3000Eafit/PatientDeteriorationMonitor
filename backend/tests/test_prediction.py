"""Unit tests for the deterioration prediction rule (US-08).

Covers AC1-AC4, FR-002 and FR-004 of specs/024-deterioration-prediction/spec.md
and the rule in specs/024-deterioration-prediction/data-model.md:

    is_rising(totals) = len(totals) == 3 and totals[0] < totals[1] < totals[2]
    predict(totals):
        fewer than 3      -> (False, "not_enough_readings")
        any None          -> (False, "missing_score")
        is_rising         -> (True, None)
        otherwise         -> (False, "not_rising")

Pure unit tests: no database fixture, no app client. Synthetic score totals only.
The module is imported inside a fixture (not at module level) so that, while
``app/prediction.py`` does not exist yet (TDD), only these tests fail and the
rest of the suite is still collected and run.
"""

import ast
import importlib
from pathlib import Path

import pytest

PREDICTION_SOURCE = Path(__file__).resolve().parents[1] / "app" / "prediction.py"


@pytest.fixture
def prediction():
    """Import ``app.prediction`` lazily (fails with ModuleNotFoundError until T003)."""
    return importlib.import_module("app.prediction")


# --- AC1 / FR-002: strictly increasing scores predict a deterioration -----------


def test_ac1_strictly_rising_predicts(prediction):
    """AC1, FR-002: [2, 4, 6] (t1 < t2 < t3) -> (True, None)."""
    assert prediction.predict([2, 4, 6]) == (True, None)


def test_ac1_is_rising_true_for_strictly_increasing(prediction):
    """AC1, FR-002: is_rising is True for three strictly increasing totals."""
    assert prediction.is_rising([2, 4, 6]) is True
    # Smallest possible strict steps, including the lowest score 0.
    assert prediction.is_rising([0, 1, 2]) is True


# --- AC2 / FR-002: not strictly increasing gives no prediction ------------------


@pytest.mark.parametrize(
    "totals",
    [[2, 2, 5], [6, 4, 2], [5, 4, 6], [3, 3, 3], [2, 5, 5], [2, 5, 4]],
    ids=["equal-first-step", "falling", "mixed", "flat", "equal-last-step", "rise-then-fall"],
)
def test_ac2_not_strictly_rising_gives_not_rising(prediction, totals):
    """AC2, FR-002: any equal step or fall -> (False, "not_rising")."""
    assert prediction.predict(totals) == (False, "not_rising")
    assert prediction.is_rising(totals) is False


# --- AC3 / FR-004: fewer than 3 readings gives no prediction --------------------


@pytest.mark.parametrize("totals", [[], [4], [2, 4]], ids=["zero", "one", "two"])
def test_ac3_fewer_than_three_not_enough_readings(prediction, totals):
    """AC3, FR-004: 0, 1 or 2 totals -> (False, "not_enough_readings"), never an error."""
    assert prediction.predict(totals) == (False, "not_enough_readings")


# --- FR-004 / edge case: a reading with no stored score -------------------------


def test_fr004_missing_score_gives_missing_score(prediction):
    """FR-004, spec edge case: [2, None, 5] -> (False, "missing_score")."""
    assert prediction.predict([2, None, 5]) == (False, "missing_score")


@pytest.mark.parametrize("totals", [[None, 4, 6], [2, 4, None], [None, None, None]],
                         ids=["first", "last", "all"])
def test_fr004_missing_score_anywhere(prediction, totals):
    """FR-004: a missing score in any position -> missing_score, even if the others would rise."""
    assert prediction.predict(totals) == (False, "missing_score")


def test_fr004_precedence_not_enough_before_missing(prediction):
    """FR-004, data-model precedence: [None, 4] -> not_enough_readings (checked before missing_score)."""
    assert prediction.predict([None, 4]) == (False, "not_enough_readings")


# --- AC4 / FR-002: is_rising only judges exactly 3 totals -----------------------


@pytest.mark.parametrize(
    "totals",
    [[], [1], [1, 2], [1, 2, 3, 4], [1, 2, 3, 4, 5]],
    ids=["zero", "one", "two", "four", "five"],
)
def test_ac4_is_rising_false_unless_exactly_three(prediction, totals):
    """AC4, FR-002: is_rising is False for any list whose length is not 3 (only the 3 most recent count)."""
    assert prediction.is_rising(totals) is False


# --- FR-002 / AC5: the rule module is pure ---------------------------------------


def test_fr002_module_is_pure_no_db_web_or_scoring_imports():
    """FR-002 (one small pure function), AC5/FR-005: app/prediction.py imports nothing
    from sqlalchemy, fastapi or app.scoring (it never recomputes the score)."""
    source = PREDICTION_SOURCE.read_text(encoding="utf-8")
    tree = ast.parse(source)
    imported = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            imported.append(node.module or "")
    forbidden = ("sqlalchemy", "fastapi", "app.scoring")
    offenders = [
        name for name in imported
        if any(name == root or name.startswith(root + ".") for root in forbidden)
    ]
    assert offenders == [], f"app/prediction.py must stay pure; found imports: {offenders}"
    # Also no "from app import scoring" style import.
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == "app":
            assert all(alias.name != "scoring" for alias in node.names)
