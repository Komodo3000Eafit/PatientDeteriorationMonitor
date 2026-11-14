---

description: "Task list for TS-07 clinical scoring module"
---

# Tasks: Clinical Scoring Module

**Input**: Design documents from `specs/007-clinical-scoring-module/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/scoring-interface.md](contracts/scoring-interface.md), [quickstart.md](quickstart.md)

**Tests**: MANDATORY. Triage scoring is a critical path (constitution VII), and the spec lists the tests (AC6, FR-009, FR-011). AC7 (README) is checked by review.

**Organization**: This feature has one story (TS-07), so all story tasks carry the `[TS-07]` label.

## Format: `[ID] [P?] [Story] Description (agent)`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **(agent)**: Owner agent, at the end of the line
- All paths are relative to the repository root. Backend commands run from `backend/` with `.\.venv\Scripts\Activate.ps1`.
- Edit files with Edit/Write, not PowerShell (CLAUDE.md). The files use `≤`/`≥`/`°C` only in comments and docs; keep them UTF-8.
- **Standard library only.** Do not touch `backend/requirements.txt`, `backend/app/models.py`, `backend/migrations/` or any existing module in `backend/app/`. No endpoint, no database access, no logging, no `print`, no environment reads in `app/scoring/` (FR-007, FR-008).
- Only `backend/app/scoring/news2.py` may contain NEWS2 thresholds, points or the band rule (FR-006). Tests may import it.

---

## Phase 1: Setup

- [X] T001 [TS-07] Create the package folder `backend/app/scoring/` (the files are created in T002–T005). Confirm `python -m pytest` passes before any change (136 tests today) so later failures are clearly new (backend-dev)

---

## Phase 2: Foundational

None. TS-01 (backend skeleton, pytest) is merged. The TS-03 column types define the input fields, and nothing in TS-03 changes.

---

## Phase 3: TS-07 Clinical scoring module 🎯 MVP

**Goal**: `from app.scoring import get_scoring_system, vital_signs_from_mapping` scores one set of 7 vital signs with NEWS2 (Scale 1). It returns the total, the band and one structured explanation entry per parameter, rejects invalid input with every problem listed, and exports the accepted value ranges.

**Independent Test**: `python -m pytest` in `backend/` passes with no database and no network, including the three new `test_scoring_*.py` files. `git grep -n -i news2 -- backend/app ':!backend/app/scoring'` prints nothing.

### Implementation

- [X] T002 [P] [TS-07] Create `backend/app/scoring/base.py` with the module docstring "Generic scoring types (TS-07). Nothing here is specific to NEWS2; see specs/007-clinical-scoring-module/data-model.md." It uses only `dataclasses`, `decimal.Decimal` and `typing.Protocol`. Contents:
  - `PARAMETERS = ("respiratory_rate", "spo2", "on_oxygen", "systolic_bp", "heart_rate", "consciousness", "temperature")`.
  - `RISK_BANDS = ("low", "low-medium", "medium", "high")`.
  - `@dataclass(frozen=True) class VitalSigns` with the fields, in this order:
    - `respiratory_rate: int`
    - `spo2: int`
    - `on_oxygen: bool`
    - `systolic_bp: int`
    - `heart_rate: int`
    - `consciousness: str`
    - `temperature: Decimal`

    The class has no validation and no defaults.
  - `@dataclass(frozen=True) class ParameterScore`:
    - `parameter: str`
    - `value: int | bool | str | Decimal`
    - `points: int`
    - `low: int | Decimal | None = None`
    - `high: int | Decimal | None = None`
    - `category: tuple = ()`

    The docstring says: "low/high are the inclusive bounds of the matched range (None = open end); category holds the matched values for yes/no and code parameters."
  - `@dataclass(frozen=True) class ScoreResult`:
    - `system: str`
    - `total: int`
    - `band: str`
    - `parameters: tuple[ParameterScore, ...]`
  - `class ScoringSystem(Protocol)`: `name: str` and `def score(self, vitals: VitalSigns) -> ScoreResult: ...`. The docstring says: "Implementations MUST call validate_vital_signs(vitals) first, return entries in PARAMETERS order, total = sum of points, band in RISK_BANDS."
  - `@dataclass(frozen=True) class Problem`: `parameter: str`, `reason: str`. Reason codes: `missing`, `unknown`, `wrong_type`, `out_of_range`, `too_many_decimals`, `not_allowed`. Define them as a module constant `REASONS` tuple.
  - `class InvalidVitalSigns(ValueError)`:
    - `__init__(self, problems)` stores `self.problems = tuple(problems)` and calls `super().__init__("invalid vital signs: " + "; ".join(f"{p.parameter}: {p.reason}" for p in self.problems))`.
    - The message never contains a value.

  (FR-001, FR-002, FR-004; data-model) (backend-dev)
- [X] T003 [TS-07] Create `backend/app/scoring/limits.py` (depends on T002). Module docstring: "Accepted value ranges and strict validation (TS-07, FR-005, FR-011). Generic plausibility limits, not NEWS2 rules; US-03 reuses ACCEPTED_LIMITS." Contents:
  - `@dataclass(frozen=True) class Limit`:
    - `kind: str` (`"integer" | "decimal" | "boolean" | "code"`)
    - `minimum: int | Decimal | None = None`
    - `maximum: int | Decimal | None = None`
    - `allowed: tuple = ()`
    - `decimals: int = 0`
  - `ACCEPTED_LIMITS = MappingProxyType({...})` in `PARAMETERS` order, exactly:
    - `respiratory_rate`: `Limit("integer", 0, 80)`
    - `spo2`: `Limit("integer", 0, 100)`
    - `on_oxygen`: `Limit("boolean", allowed=(False, True))`
    - `systolic_bp`: `Limit("integer", 0, 300)`
    - `heart_rate`: `Limit("integer", 0, 300)`
    - `consciousness`: `Limit("code", allowed=("A", "C", "V", "P", "U"))`
    - `temperature`: `Limit("decimal", Decimal("25.0"), Decimal("45.0"), decimals=1)`

    Add an assertion at import that its keys equal `PARAMETERS`.
  - `_check(value, limit) -> str | None` returns the first failing reason, in this order:
    - **integer**: `isinstance(value, bool) or not isinstance(value, int)` → `wrong_type`; outside `[minimum, maximum]` → `out_of_range`.
    - **decimal**:
      - `bool`, or not an `int`/`float`/`Decimal` → `wrong_type`;
      - `d = Decimal(str(value))` not finite (NaN, infinity) → `out_of_range`;
      - outside `[minimum, maximum]` → `out_of_range`;
      - only then, `d != d.quantize(Decimal(1).scaleb(-limit.decimals))` → `too_many_decimals`.

      The range check MUST come before the decimals check: `quantize` raises `decimal.InvalidOperation` for huge finite values such as `1e30`, and these must give `out_of_range`, not crash (analyze C1).
    - **boolean**: `type(value) is not bool` → `wrong_type`.
    - **code**: not a `str` → `wrong_type`; not in `allowed` (exact match, no strip/upper) → `not_allowed`.
  - `validate_vital_signs(vitals: VitalSigns) -> None` checks each `PARAMETERS` field with `getattr` and raises `InvalidVitalSigns` with one `Problem` per failing field, in `PARAMETERS` order.
  - `vital_signs_from_mapping(data: Mapping) -> VitalSigns`:
    - collects `missing` for each absent parameter;
    - collects the `_check` reason for each present one;
    - then adds `unknown` for each extra key, as `str(key)` in sorted order;
    - raises once if anything was found.

    Otherwise it returns a `VitalSigns`, with `temperature=Decimal(str(t)).quantize(Decimal("0.1"))` and the other values unchanged.
  - Never include a value in any problem or message.

  (FR-005, FR-011; research R5–R8; data-model "Limit", "Problem") (backend-dev)
- [X] T004 [TS-07] Create `backend/app/scoring/news2.py` (depends on T002, T003). Module docstring: "NEWS2 (Royal College of Physicians, 2017), SpO2 Scale 1 only. The only module that knows NEWS2 rules (FR-006). Source: specs/007-clinical-scoring-module/research.md R1. Scale 2 (hypercapnic patients) is not implemented." Contents:
  - `NUMERIC_BANDS`: each tuple is `(low, high, points)`, inclusive, with `None` for an open end:
    - `respiratory_rate`: `((None, 8, 3), (9, 11, 1), (12, 20, 0), (21, 24, 2), (25, None, 3))`
    - `spo2`: `((None, 91, 3), (92, 93, 2), (94, 95, 1), (96, None, 0))`
    - `systolic_bp`: `((None, 90, 3), (91, 100, 2), (101, 110, 1), (111, 219, 0), (220, None, 3))`
    - `heart_rate`: `((None, 40, 3), (41, 50, 1), (51, 90, 0), (91, 110, 1), (111, 130, 2), (131, None, 3))`
    - `temperature`: `((None, D("35.0"), 3), (D("35.1"), D("36.0"), 1), (D("36.1"), D("38.0"), 0), (D("38.1"), D("39.0"), 1), (D("39.1"), None, 2))`
  - `CATEGORY_BANDS`:
    - `on_oxygen`: `(((True,), 2), ((False,), 0))`
    - `consciousness`: `((("A",), 0), (("C", "V", "P", "U"), 3))`
  - `band_for(points: Sequence[int]) -> str`: `total >= 7` → `"high"`; `total >= 5` → `"medium"`; `3 in points` → `"low-medium"`; else `"low"`.
  - `class News2`:
    - `name = "NEWS2"`.
    - `score(self, vitals)`:
      1. calls `validate_vital_signs(vitals)`;
      2. for each name in `PARAMETERS`: for a numeric parameter, finds the first band with `(low is None or value >= low) and (high is None or value <= high)` and builds `ParameterScore(name, value, points, low, high)`; for a categorical one, finds the row whose values contain the value and builds `ParameterScore(name, value, points, category=values)`;
      3. for temperature, uses `Decimal(str(value)).quantize(Decimal("0.1"))` both for the comparison and as the stored value;
      4. returns `ScoreResult("NEWS2", total, band_for(points), tuple(entries))`.

      If no band matches, raise `AssertionError` (this can't happen with valid input; the T007 coverage test proves it).
  - `NEWS2 = News2()`.

  (FR-002, FR-003, FR-004; research R1, R3; data-model "NEWS2 tables") (backend-dev)
- [X] T005 [TS-07] Create `backend/app/scoring/__init__.py` (depends on T002–T004). Module docstring: "Clinical scoring (TS-07). Callers import only from app.scoring and get the current system from get_scoring_system(); see specs/007-clinical-scoring-module/contracts/scoring-interface.md." Contents:
  - Re-export from `.base`: `PARAMETERS`, `RISK_BANDS`, `VitalSigns`, `ParameterScore`, `ScoreResult`, `ScoringSystem`, `Problem` and `InvalidVitalSigns`.
  - Re-export from `.limits`: `Limit`, `ACCEPTED_LIMITS`, `validate_vital_signs` and `vital_signs_from_mapping`.
  - `def get_scoring_system() -> ScoringSystem:`, with a docstring saying it is "The single selection point. To replace NEWS2, add a module with a ScoringSystem implementation and return it here." The body is `return NEWS2` (import `NEWS2` from `.news2` inside this module only).
  - `__all__` lists exactly the 13 public names of the contract.

  (FR-001, FR-006; contract) (backend-dev)
- [X] T006 [P] [TS-07] Add a section `## Clinical scoring` to `backend/README.md`, before `## Run`. It contains:
  1. One sentence: what it does and that it is pure Python with no database or endpoint (US-03 calls it).
  2. The example from [contracts/scoring-interface.md](contracts/scoring-interface.md).
  3. An input table with the 7 fields, their types and accepted ranges (as in data-model `ACCEPTED_LIMITS`), saying `ACCEPTED_LIMITS` is the single source and API code must reuse it.
  4. The result fields (`system`, `total`, `band`, `parameters` with `parameter`, `value`, `points`, `low`, `high`, `category`), the band identifiers, and that reasons are data to be translated by the UI.
  5. Errors: `InvalidVitalSigns.problems`, with the 6 reason codes in a short table, and a note that messages never contain values.
  6. "Adding another scoring system", the 3 steps from the contract, naming `get_scoring_system()` in `app/scoring/__init__.py`.
  7. A note that NEWS2 is SpO2 Scale 1 only (Scale 2 needs a per-patient flag, a later story), with the RCP source link.

  In `## Test`, add one sentence saying the scoring tests are pure and need nothing extra (FR-010, AC7) (backend-dev)

### Tests

- [X] T007 [P] [TS-07] Create `backend/tests/test_scoring_news2.py` (depends on T005; may import `app.scoring.news2` only to read its tables). Module docstring cites FR-003/FR-004/FR-009 and research R1/R4. Use a helper `normal(**overrides)` that builds `VitalSigns(16, 98, False, 120, 70, "A", Decimal("37.0"))` with overrides, and `score(v) = get_scoring_system().score(v)`. Tests:
  1. **`test_boundary_points` (AC2)**: parametrized over a **hand-written** list of `(parameter, value, points)` taken from the RCP chart in research R1, **not** generated from the module tables. The list contains:
     - **respiratory_rate**: 0→3, 8→3, 9→1, 11→1, 12→0, 20→0, 21→2, 24→2, 25→3, 80→3
     - **spo2**: 0→3, 91→3, 92→2, 93→2, 94→1, 95→1, 96→0, 100→0
     - **systolic_bp**: 0→3, 90→3, 91→2, 100→2, 101→1, 110→1, 111→0, 219→0, 220→3, 300→3
     - **heart_rate**: 0→3, 40→3, 41→1, 50→1, 51→0, 90→0, 91→1, 110→1, 111→2, 130→2, 131→3, 300→3
     - **temperature**: 25.0→3, 35.0→3, 35.1→1, 36.0→1, 36.1→0, 38.0→0, 38.1→1, 39.0→1, 39.1→2, 45.0→2 (as `Decimal`)
     - **on_oxygen**: True→2, False→0
     - **consciousness**: A→0, C→3, V→3, P→3, U→3

     For each, score `normal(**{parameter: value})` and assert that entry's `points`. Also assert `result.total == points`, since all the others are 0.
  2. **`test_entry_range`**: checks that the matched bounds are copied into the entry:
     - heart rate 95 → `ParameterScore("heart_rate", 95, 1, 91, 110, ())`;
     - SpO2 97 → `low == 96`, `high is None`;
     - respiratory rate 5 → `low is None`, `high == 8`;
     - consciousness "V" → `category == ("C", "V", "P", "U")`, with `low` and `high` `None`;
     - on_oxygen True → `category == (True,)`;
     - temperature `36.7` given as a `float` → `value == Decimal("36.7")`, `low == Decimal("36.1")`, `high == Decimal("38.0")`.
  3. **`test_table_coverage` (R4)**: for each parameter in `news2.NUMERIC_BANDS`, check that:
     - the first band's `low` is `None` and the last band's `high` is `None`;
     - each next `low` is the previous `high` + 1 (or + `Decimal("0.1")` for temperature), so there are no gaps or overlaps;
     - every finite bound appears as a value in the hand-written boundary list of test 1.

     Also check that the categorical rows together contain exactly `ACCEPTED_LIMITS[p].allowed`.
  4. **`test_bands` (AC3)**, parametrized `(overrides, total, band)`:
     - `{}` → 0, low;
     - `{"respiratory_rate": 22, "spo2": 95, "heart_rate": 95}` → 4, low;
     - `{"consciousness": "V"}` → 3, low-medium;
     - `{"consciousness": "V", "heart_rate": 95}` → 4, low-medium;
     - `{"respiratory_rate": 21, "spo2": 94, "systolic_bp": 105, "heart_rate": 100}` → 5, medium;
     - `{"systolic_bp": 90, "respiratory_rate": 22}` → 5, medium (a single 3 with total ≥5);
     - `{"systolic_bp": 90, "respiratory_rate": 22, "heart_rate": 95}` → 6, medium;
     - `{"systolic_bp": 90, "respiratory_rate": 22, "on_oxygen": True}` → 7, high;
     - all maximums `{"respiratory_rate": 30, "spo2": 85, "on_oxygen": True, "systolic_bp": 80, "heart_rate": 140, "consciousness": "U", "temperature": Decimal("34.0")}` → 20, high (the maximum: temperature ≤35.0 scores 3).
  5. **`test_worked_examples` (AC1)**: three or more full sets, asserting the whole `ScoreResult` equal to a hand-built expected value (system, total, band and all 7 `ParameterScore` entries):
     - all normal → 0, low;
     - `vital_signs_from_mapping({"respiratory_rate": 22, "spo2": 95, "on_oxygen": False, "systolic_bp": 115, "heart_rate": 95, "consciousness": "A", "temperature": Decimal("37.5")})` → 4, low;
     - RR 26, SpO2 91, on_oxygen True, SBP 95, HR 120, consciousness "A", temperature 38.5 → points 3, 3, 2, 2, 2, 0, 1 → 13, high.
  6. **`test_band_for_rule`**: calls `news2.band_for` directly with:
     - `[0]*7` → low;
     - `[3, 0, 0, 0, 0, 0, 1]` → low-medium;
     - `[2, 2, 0, 0, 0, 0, 0]` → low;
     - `[2, 2, 1, 0, 0, 0, 0]` → medium;
     - `[3, 2, 2, 0, 0, 0, 0]` → high.

  (AC1–AC3, FR-003, FR-004, FR-009, SC-001) (qa-tester)
- [X] T008 [P] [TS-07] Create `backend/tests/test_scoring_limits.py` (depends on T005; imports only from `app.scoring`). Module docstring cites FR-005/FR-011 and research R5–R7. Use `VALID = {"respiratory_rate": 16, "spo2": 98, "on_oxygen": False, "systolic_bp": 120, "heart_rate": 70, "consciousness": "A", "temperature": Decimal("37.0")}`. Tests:
  1. **`test_invalid_value` (AC4)**: parametrized `(parameter, value, reason)` over:
     - `("spo2", 101, "out_of_range")`, `("spo2", -1, "out_of_range")`
     - `("heart_rate", -1, "out_of_range")`, `("heart_rate", 301, "out_of_range")`
     - `("respiratory_rate", 81, "out_of_range")`, `("systolic_bp", 301, "out_of_range")`
     - `("temperature", Decimal("24.9"), "out_of_range")`, `("temperature", Decimal("45.1"), "out_of_range")`
     - `("heart_rate", True, "wrong_type")`, `("heart_rate", 90.5, "wrong_type")`, `("heart_rate", 90.0, "wrong_type")`, `("heart_rate", "90", "wrong_type")`
     - `("temperature", "36.5", "wrong_type")`, `("temperature", True, "wrong_type")`, `("temperature", float("nan"), "out_of_range")`, `("temperature", float("inf"), "out_of_range")`, `("temperature", 1e30, "out_of_range")`, `("temperature", Decimal("1E+30"), "out_of_range")`, `("temperature", 36.55, "too_many_decimals")`, `("temperature", Decimal("36.55"), "too_many_decimals")`
     - `("on_oxygen", 1, "wrong_type")`, `("on_oxygen", "yes", "wrong_type")`
     - `("consciousness", "a", "not_allowed")`, `("consciousness", "X", "not_allowed")`, `("consciousness", " A", "not_allowed")`, `("consciousness", 1, "wrong_type")`

     For each, `vital_signs_from_mapping({**VALID, parameter: value})` raises `InvalidVitalSigns` whose `problems == (Problem(parameter, reason),)`. Also, `get_scoring_system().score(VitalSigns(**{**VALID, parameter: value}))` raises the same, so score() validates (R8).
  2. **`test_missing_and_unknown`**:
     - the mapping without `spo2` → `(Problem("spo2", "missing"),)`;
     - with an extra `"pulse": 70` → `(Problem("pulse", "unknown"),)`;
     - an empty dict → 7 `missing` problems in `PARAMETERS` order.
  3. **`test_several_problems_listed`**: `{**VALID, "spo2": 101, "consciousness": "a"}` without `heart_rate` and with an extra `"x": 1` → the problems are exactly `spo2 out_of_range`, `heart_rate missing`, `consciousness not_allowed`, `x unknown`, in that order (PARAMETERS order, unknown last).
  4. **`test_message_has_no_values`**: for `{**VALID, "spo2": 101, "temperature": Decimal("44.77")}`, `str(exc)` is `"invalid vital signs: spo2: out_of_range; temperature: too_many_decimals"` and contains neither `101` nor `44.77`.
  5. **`test_limits_edges` (FR-011)**: for each parameter in `ACCEPTED_LIMITS` with a minimum and maximum, the minimum and maximum are accepted by `vital_signs_from_mapping`. Minimum − step and maximum + step (step 1, or `Decimal("0.1")` for `decimals == 1`) give `out_of_range`. Each `allowed` value is accepted.
  6. **`test_limits_exported_and_read_only`**:
     - `list(ACCEPTED_LIMITS) == list(PARAMETERS)`;
     - the values match data-model exactly (respiratory_rate 0–80, spo2 0–100, systolic_bp 0–300, heart_rate 0–300, temperature 25.0–45.0 with 1 decimal, on_oxygen `(False, True)`, consciousness `("A", "C", "V", "P", "U")`);
     - assigning `ACCEPTED_LIMITS["spo2"] = ...` raises `TypeError`.
  7. **`test_temperature_normalised`**: `vital_signs_from_mapping({**VALID, "temperature": 37})` gives `temperature == Decimal("37.0")`; `36.7` (float) gives `Decimal("36.7")`.

  (AC4, FR-005, FR-011, SC-002) (qa-tester)
- [X] T009 [P] [TS-07] Create `backend/tests/test_scoring_interface.py` (depends on T005). Module docstring cites FR-001/FR-006/FR-007 and research R9. Tests:
  1. **`test_selection_point` (AC1, AC5)**:
     - `get_scoring_system().name == "NEWS2"`, and the system has a callable `score`;
     - `app.scoring.__all__` equals the 13 names of the contract;
     - calling `get_scoring_system()` twice returns the same object.
  2. **`test_result_shape` (AC1)**: for 3 sample sets, `result.system == "NEWS2"`, `[e.parameter for e in result.parameters] == list(PARAMETERS)`, `result.total == sum(e.points for e in result.parameters)` and `result.band in RISK_BANDS`.
  3. **`test_pure` (FR-007)**: scoring the same `VitalSigns` twice gives equal results. `ScoreResult`, `ParameterScore` and `VitalSigns` are frozen (assigning an attribute raises `dataclasses.FrozenInstanceError`).
  4. **`test_news2_confined` (AC5, SC-004)**: walk `Path(app.__file__).parent.rglob("*.py")`, skip files under the `scoring` folder, and assert that none contains `"news2"` (case-insensitive). Fail with the offending file names.

  (AC1, AC5, FR-001, FR-006, FR-007) (qa-tester)

### Checks and review

- [X] T010 [TS-07] Run `python -m pytest` in `backend/` (depends on T002–T009). Everything passes: the 136 existing tests plus the new ones, in under 30 s (SC-006). Keep the output for the PR (D-27). Also confirm:
  - `git diff --stat main -- backend/requirements.txt backend/app/models.py backend/migrations backend/app/main.py backend/app/auth.py backend/app/db.py` is empty;
  - `git grep -n -i news2 -- backend/app ':!backend/app/scoring'` prints nothing;
  - the quickstart step 2 one-liner prints `NEWS2 3 low-medium`.

  If a check fails, fix it in the owning task (qa-tester)
- [X] T011 [TS-07] Review read-only: `backend/app/scoring/*.py`, the three `backend/tests/test_scoring_*.py` files and the README section. Check:
  - strict types (`bool` rejected for numbers, no coercion of strings, no rounding);
  - NaN and infinity rejected;
  - temperature compared as `Decimal`;
  - every problem reported, with no value in any message;
  - no I/O, logging, environment or network in `app/scoring/`;
  - `ACCEPTED_LIMITS` is read-only;
  - NEWS2 confined to `news2.py`;
  - the tables match the RCP chart (research R1).

  Report findings; don't change code (constitution V, VIII) (security-reviewer)

**Checkpoint**: TS-07 is complete. US-03 and US-04 use only `from app.scoring import ...`, and API input checks reuse `ACCEPTED_LIMITS`.

---

## Phase 4: Polish

- [X] T012 Edit the project docs, after T010–T011:
  - **`docs/PROJECT_STATUS.md`**:
    - Set "Last updated" to the current date. In step 11's notes, mark TS-07 ✅ and set "Next: TS-08 (vital signs simulator)"; set "Current step" and "Next step" to match.
    - Rewrite the "Where we left off" note: TS-07 done (`app/scoring/`, `get_scoring_system()`, `vital_signs_from_mapping`, `ACCEPTED_LIMITS`, NEWS2 Scale 1 checked against the RCP chart), with the local `pytest` result and the review result.
    - Under "Notes for later stories", add three notes:
      - **US-03** validates request bodies with `ACCEPTED_LIMITS` (or `vital_signs_from_mapping`) and maps `InvalidVitalSigns.problems` to a 422 without echoing values. It stores `system`, `total`, `band` and the entries.
      - **US-04** maps `band` to escalation, and NEWS2 stays only in `app/scoring/news2.py`.
      - **Later**: SpO2 Scale 2 needs a per-patient hypercapnic flag.
  - **`docs/BACKLOG.md`**: link `specs/007-clinical-scoring-module` in TS-07's Spec column. Set Status ✅ only when the PR is merged.
  - **`docs/DECISIONS.md`**: add **D-36** after D-35 (today's date, Status "Active"), using the table format of D-35. Content:
    - **Decision**: clinical scoring (TS-07) is a pure standard-library package `backend/app/scoring/` (`base`, `limits`, `news2`, `__init__`).
      - It has a `ScoringSystem` Protocol and one selection point, `get_scoring_system()`, with no registry or environment setting.
      - NEWS2 is table-driven, SpO2 Scale 1 only, checked against the RCP 2017 charts.
      - Explanations and errors are structured data (parameter, value, points, range; reason codes), and messages never hold values.
      - `ACCEPTED_LIMITS` is the single source of input limits for API stories.
    - **Reason**: constitution V (swappable, explainable), D-08, D-23.
    - **Rejected**: Pydantic in the scorer (coerces types), `if/elif` rules (thresholds repeated), and a plugin registry (not needed).

  (orchestrator)

---

## Dependencies & Execution Order

- **Setup**: T001 comes first.
- **Implementation**: T002 has no dependencies. T003 depends on T002. T004 depends on T002 and T003. T005 depends on T002–T004. T006 (README) only needs the contract, so it can run in parallel with T002–T005.
- **Tests**: T007, T008 and T009 each depend on T005 and can run in parallel (different files).
- **Checks**: T010 depends on T002–T009. T011 depends on T010.
- **Polish**: T012 runs last.
- **Story dependencies**: TS-01 (merged), per `docs/BACKLOG.md`.

## Parallel Example

```text
# Round 1 (backend-dev): T001 → T002 → T003 → T004 → T005; T006 (README) in parallel
# Round 2 (qa-tester), in parallel: T007 (news2), T008 (limits), T009 (interface)
# Round 3: T010 (qa-tester) → T011 (security-reviewer) → T012 (orchestrator)
```

## Implementation Strategy

TS-07 is the whole MVP:

1. The package first (T001–T005), then the README (T006).
2. Then the three test files (T007–T009), the full run (T010) and the review (T011).
3. Then the docs (T012).

After T012, commit (`TS-07: clinical scoring module`), push and open the PR. Until TS-09 adds CI, paste the local `python -m pytest` output in the PR description (D-27), with the agent activity log summary (`specs/007-clinical-scoring-module/agent-log.csv`, written through `scripts/log-agent.ps1`). No manual Neon or browser check is needed (quickstart).

## Notes

- The orchestrator assigns each task to its agent and logs `assigned` / `started` / `done` rows (see `docs/agents.md`).
- Testing runs after implementation, as the project template orders it (qa-tester, then security-reviewer).
- Do not add anything not listed here (Principle XII): no endpoint, no storage, no triage-level mapping, no alerts, no SpO2 Scale 2, no registry or settings, no new dependency.
