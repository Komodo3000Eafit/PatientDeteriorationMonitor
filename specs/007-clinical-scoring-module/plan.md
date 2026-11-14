# Implementation Plan: Clinical Scoring Module

**Branch**: `007-clinical-scoring-module` | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-clinical-scoring-module/spec.md`

## Summary

TS-07 adds a pure-Python scoring package, `backend/app/scoring/`, with no new dependency, database, endpoint or UI. It has four files:

- **`base.py`**: the generic types. These are the frozen dataclasses `VitalSigns`, `ParameterScore` and `ScoreResult`, plus a `ScoringSystem` Protocol (`name`, `score(vitals)`). It also holds the error `InvalidVitalSigns`, which carries every `Problem(parameter, reason)` with no sentences or values, and the generic `PARAMETERS` and `RISK_BANDS`.
- **`limits.py`**: `ACCEPTED_LIMITS`, the read-only accepted value ranges that US-03 will reuse (FR-011). It also has the strict validation that collects all problems at once: `validate_vital_signs`, and `vital_signs_from_mapping` for plain dicts. It is not NEWS2-specific.
- **`news2.py`**: NEWS2 Scale 1, table-driven. Each threshold appears once as `(low, high, points)` and the explanation entry is copied from the matched row. The band rule lives here too. The table was checked against the RCP 2017 Chart 1 and Chart 2 (research R1).
- **`__init__.py`**: `get_scoring_system()`, the single selection point (returns NEWS2), plus the public re-exports.

Tests are hand-written from the RCP chart, so they don't depend on the implementation tables. They cover both sides of every threshold, every band, worked examples, every invalid input, the limits at their edges, and a check that no code outside `app/scoring/` mentions NEWS2. `backend/README.md` gets a "Clinical scoring" section.

## Technical Context

**Language/Version**: Python 3.13 (unchanged).

**Primary Dependencies**: none new. Standard library only: `dataclasses`, `decimal`, `typing`, `types`, `collections.abc`. Existing packages are not used by the module.

**Storage**: N/A. Nothing is stored (US-03 stores scores).

**Testing**: pytest (existing), parametrized, with no fixtures from `conftest.py` needed and no database or network.

**Target Platform**: the backend (local Windows laptops; Azure App Service from TS-10). The module is imported by later API code.

**Project Type**: web application (backend + frontend). This story touches only the backend.

**Performance Goals**: scoring is microseconds per set. The full backend suite stays under 30 s (SC-006).

**Constraints**:

- Pure, deterministic, no I/O (FR-007).
- No NEWS2 knowledge outside `app/scoring/news2.py` (FR-006).
- Strict types with no coercion (R5).
- Errors hold no input values (R6).

**Scale/Scope**: 4 small source files (about 250 lines in total), 3 test files, and 1 README section. Plus the docs updates (`PROJECT_STATUS`, `BACKLOG`, `DECISIONS` D-36).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Spec-driven and traceable**: every file maps to an FR or AC (traceability below). Test names reference the AC they verify.
- [x] **II. Small Scrum story**: one module with no endpoint and no UI.
- [x] **III. Independence**: depends only on TS-01, as in `docs/BACKLOG.md`. It adds new files only and changes no other story's code (except one README section).
- [x] **IV. Multi-agent**: each task has an owner agent, logged in `agent-log.csv`:
  - **backend-dev**: the `app/scoring/` package and the `backend/README.md` section.
  - **qa-tester**: the three `test_scoring_*.py` files and running the full suite.
  - **security-reviewer**: input validation, no value echo in errors, no I/O, and the isolation check.
  - **orchestrator**: `PROJECT_STATUS.md`, `BACKLOG.md`, `DECISIONS.md` (D-36) and the agent log.
  - frontend-dev and devops are not needed, and no manual check is needed (quickstart).
- [x] **V. Clinical logic**: this story delivers the replaceable module itself. NEWS2 is confined to `news2.py`, enforced by a test (R9). Every point is explained by parameter, value and range (FR-002), which later alerts (US-04) will show.
- [x] **VI. Data privacy**: no patient data at all. Tests use made-up values only, and there are no secrets.
- [ ] **VII. Tests**: scoring is a critical path and is fully covered (FR-009). **Exception**: CI doesn't exist until TS-09, so tests run locally and the output is pasted in the PR (Complexity Tracking, D-27).
- [x] **VIII. Security baseline**: strict input validation with all problems reported, and errors never echo values. There are no endpoints, authentication or secrets in this story.
- [x] **IX. Deployable at low cost**: no new service or dependency.
- [x] **X. Stack**: Python backend.
- [x] **XI. Language**: code and docs in English. There are no UI texts, and reasons are codes the UI can translate later.
- [x] **XII. Simplicity**:
  - The standard library only.
  - A Protocol instead of class hierarchies, and one selection function instead of a registry or environment setting.
  - Table-driven rules, and no Pydantic in the module.
  - Nothing is added "for later" except what the spec requires (FR-011 limits export).

**Post-design re-check (after Phase 1)**: all items still pass, and only the Principle VII exception (CI in TS-09) remains. Phase 1 added two small things, both from the spec:

- validation inside `score()` (R8), so a directly built `VitalSigns` is never scored with bad values (FR-005);
- a table coverage test (R4), so every threshold is covered by an independent expected value.

## Project Structure

### Documentation (this feature)

```text
specs/007-clinical-scoring-module/
├── spec.md
├── plan.md                    # This file
├── research.md                # Phase 0: RCP chart check, layout, strict types, errors, limits
├── data-model.md              # Phase 1: VitalSigns, Limit, Problem, ParameterScore, ScoreResult, NEWS2 tables
├── quickstart.md              # Phase 1: run the tests; optional shell check; isolation grep
├── contracts/
│   └── scoring-interface.md   # Phase 1: public names of app.scoring, behaviour, how to add a system
├── checklists/
│   └── requirements.md
└── tasks.md                   # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── README.md                       # CHANGED: "Clinical scoring" section (interface, limits, errors, adding a system)
├── app/
│   └── scoring/
│       ├── __init__.py             # NEW: get_scoring_system() + public re-exports (contract)
│       ├── base.py                 # NEW: PARAMETERS, RISK_BANDS, VitalSigns, ParameterScore, ScoreResult, ScoringSystem, Problem, InvalidVitalSigns
│       ├── limits.py               # NEW: Limit, ACCEPTED_LIMITS, validate_vital_signs, vital_signs_from_mapping
│       └── news2.py                # NEW: NEWS2 tables, band rule, News2 class (name "NEWS2")
└── tests/
    ├── test_scoring_news2.py       # NEW: boundaries (both sides, hand-written from RCP), bands, worked examples, table coverage, total = sum
    ├── test_scoring_limits.py      # NEW: invalid input (each reason code, several at once, no values in message), limits edge accepted / one step past rejected
    └── test_scoring_interface.py   # NEW: get_scoring_system() satisfies the contract, score() validates, purity (same input → equal result), no "news2" outside app/scoring

docs/PROJECT_STATUS.md              # CHANGED: TS-07 done; Scale 2 note for later
docs/BACKLOG.md                     # CHANGED: TS-07 spec link and status
docs/DECISIONS.md                   # CHANGED: D-36
```

**Structure Decision**: this is the existing web-application layout. The scoring code is a sub-package of `app/` so it is imported as `app.scoring`, like `app.auth`. Generic code (`base`, `limits`) is kept apart from the NEWS2 file, so the isolation rule is a simple file boundary.

### Design notes

- **`base.py`**:
  - `@dataclass(frozen=True)` everywhere. `ScoreResult.parameters` and `ParameterScore.category` are tuples, so results are immutable and comparable.
  - `ScoringSystem` is a `typing.Protocol` (not `runtime_checkable`; the tests check the attributes directly).
  - `InvalidVitalSigns.__init__(problems)` stores a tuple and builds the message `"invalid vital signs: " + "; ".join(f"{p.parameter}: {p.reason}")`.
- **`limits.py`**:
  - `_check(parameter, value, limit) -> str | None` returns the first failing reason code (type → range or decimals → allowed).
  - `validate_vital_signs(vitals)` runs `_check` for each `PARAMETERS` entry and raises if any reason was found.
  - `vital_signs_from_mapping(data)` adds `missing`/`unknown`, raises if needed, then builds `VitalSigns(**data)`. The temperature is normalised with `Decimal(str(v)).quantize(Decimal("0.1"))` after it is validated.
  - Unknown keys are reported in sorted order after the known parameters.
- **`news2.py`**:
  - `_NUMERIC_BANDS` and `_CATEGORY_BANDS` are module-level tuples (data-model).
  - `_score_numeric(parameter, value)` returns the first band with `(low is None or value >= low) and (high is None or value <= high)`. Temperature is compared as `Decimal`.
  - `_band(points)` holds the rule from the data model.
  - The `News2` class has `name = "NEWS2"` and `score(vitals)`, which validates first, then builds the 7 entries in `PARAMETERS` order, the total and the band.
  - A module-level `NEWS2 = News2()`.
  - Tests may import `app.scoring.news2` to read its tables (the coverage test). Nothing in `app/` outside the package may.
- **`__init__.py`**: `def get_scoring_system() -> ScoringSystem: return NEWS2`. It has an explicit `__all__` matching the contract.
- **README section**:
  - a short example (from the contract);
  - a table of the input fields with the accepted ranges, pointing at `ACCEPTED_LIMITS` as the source;
  - the result fields, the band identifiers and the reason codes;
  - "Adding another scoring system" in 3 steps;
  - a note that SpO2 Scale 2 is not implemented.

### Traceability

| Requirement / AC | Delivered by |
|---|---|
| FR-001, AC1 (generic interface, result shape) | `base.py`, `__init__.py`; `test_scoring_interface.py` |
| FR-002 (structured entries) | `base.ParameterScore`, `news2.py` copies the matched row; `test_scoring_news2.py` worked examples |
| FR-003, AC2 (NEWS2 points) | `news2.py` tables (research R1); `test_scoring_news2.py` boundaries + table coverage |
| FR-004, AC3 (bands) | `base.RISK_BANDS`, `news2._band`; `test_scoring_news2.py` band tests |
| FR-005, AC4 (invalid input) | `limits.py`, `score()` validates (R8); `test_scoring_limits.py` |
| FR-006, AC5 (isolation, one selection point) | file boundary + `get_scoring_system()`; `test_scoring_interface.py` grep test |
| FR-007 (pure) | no I/O imports; `test_scoring_interface.py` repeat-equal test |
| FR-008 (no new dependency) | standard library only; `requirements.txt` unchanged |
| FR-009, AC6 (tests) | three `test_scoring_*.py` files; full `python -m pytest` |
| FR-010, AC7 (docs) | `backend/README.md`, `PROJECT_STATUS.md` (+ Scale 2 note), `BACKLOG.md` |
| FR-011 (exported limits) | `limits.ACCEPTED_LIMITS` re-exported from `app.scoring`; `test_scoring_limits.py` edge tests |

### Test plan (summary, qa-tester)

- **Boundaries**: a hand-written list of `(parameter, value, points)` from Chart 1, covering both sides of each threshold. For example:
  - RR 8/9, 11/12, 20/21, 24/25;
  - SpO2 91/92, 93/94, 95/96;
  - SBP 90/91, 100/101, 110/111, 219/220;
  - HR 40/41, 50/51, 90/91, 110/111, 130/131;
  - temperature 35.0/35.1, 36.0/36.1, 38.0/38.1, 39.0/39.1;
  - on_oxygen `True`/`False`;
  - consciousness A, C, V, P, U.

  Each test changes one parameter in an otherwise all-normal set and checks that parameter's points and range.
- **Table coverage**: the NEWS2 numeric bands are contiguous and cover `ACCEPTED_LIMITS` exactly from minimum to maximum. Every bound appears in the boundary list.
- **Bands**:
  - total 0 → low;
  - 4 without a 3 → low;
  - a single 3 with total 3 and with total 4 → low-medium;
  - 5 and 6 (one of them with a 3) → medium;
  - 7 → high;
  - maximum 20 → high.
- **Worked examples** (whole result checked, including every entry):
  - all normal → 0/low;
  - RR 22, SpO2 95, HR 95, the rest normal → 4/low;
  - consciousness V only → 3/low-medium;
  - RR 21, SpO2 94, SBP 105, HR 100 → 5/medium;
  - RR 26, SpO2 91, oxygen, SBP 95, HR 120, temperature 38.5 → 13/high.
- **Invalid input**:
  - each reason code;
  - `True` for `heart_rate`, `90.5` and `90.0` for an integer, `"36.5"` for temperature, `36.55`, `NaN`;
  - `"a"` and `"X"` for consciousness, `1` and `"yes"` for `on_oxygen`;
  - SpO2 101 and -1, temperature 24.9 and 45.1;
  - a missing key, an extra key, and three problems at once (all listed);
  - the message contains no submitted value;
  - a directly built bad `VitalSigns` is rejected by `score()`.
- **Limits**: each exported minimum and maximum is accepted, and one step past is rejected (1 for integers, 0.1 for temperature). `ACCEPTED_LIMITS` cannot be modified.
- **Interface**:
  - `get_scoring_system().name == "NEWS2"`;
  - the result has 7 entries in `PARAMETERS` order;
  - `total == sum(points)` for a sample of sets;
  - scoring the same set twice gives equal results;
  - no `news2` text in `backend/app/**/*.py` outside `app/scoring/`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle VII: tests not yet run in CI | CI is built in TS-09 (D-27) | Building CI here would merge two stories; local test output is pasted in the PR until then |
