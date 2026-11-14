# Research: Clinical Scoring Module (TS-07)

All decisions keep to D-23 (simplest thing that works): Python 3.13 standard library only, no new dependency, no database, no endpoint.

## R1. NEWS2 table checked against the official RCP chart

- **Decision**: the spec table (FR-003) and bands (FR-004) are confirmed exactly. No change.
- **Source**: Royal College of Physicians, *National Early Warning Score (NEWS) 2*, 2017.
  - Chart 1, "The NEWS scoring system": https://www.rcp.ac.uk/media/alxev00t/news2-chart-1_the-news-scoring-system_0_0.pdf (read 2026-11-13).
  - Chart 2, "NEWS thresholds and triggers": https://www.rcp.ac.uk/media/2acdezkd/news2-chart-2_news-thresholds-and-triggers_0.pdf.
  - Resource page: https://www.rcp.ac.uk/resources/national-early-warning-score-news-2/.
- **Chart 1, as read**:

  | Parameter | 3 | 2 | 1 | 0 | 1 | 2 | 3 |
  |---|---|---|---|---|---|---|---|
  | Respiration rate (per minute) | ≤8 | | 9–11 | 12–20 | | 21–24 | ≥25 |
  | SpO2 Scale 1 (%) | ≤91 | 92–93 | 94–95 | ≥96 | | | |
  | Air or oxygen? | | Oxygen | | Air | | | |
  | Systolic blood pressure (mmHg) | ≤90 | 91–100 | 101–110 | 111–219 | | | ≥220 |
  | Pulse (per minute) | ≤40 | | 41–50 | 51–90 | 91–110 | 111–130 | ≥131 |
  | Consciousness | | | | Alert | | | CVPU |
  | Temperature (°C) | ≤35.0 | | 35.1–36.0 | 36.1–38.0 | 38.1–39.0 | ≥39.1 | |

- **Chart 2, bands**: aggregate 0–4 → low; a red score of 3 in any single parameter → low-medium; 5–6 → medium; 7 or more → high. Chart 2 lists the "single 3" row separately from the aggregate rows. The spec's reading (a single 3 only changes the band while the total is ≤4) is the usual one, because 5–6 and ≥7 are already higher bands.
- **Not used**: SpO2 Scale 2 (also on Chart 1: ≤83 / 84–85 / 86–87 / 88–92 or ≥93 on air / 93–94, 95–96, ≥97 on oxygen). It needs a per-patient "hypercapnic respiratory failure" flag that the data model does not have. It is out of scope and noted for a later story (FR-010).
- **Alternatives considered**: trusting secondary calculators (some call the single-3 band "medium"). Rejected because the RCP chart is the authority.

## R2. Package layout and selection point

- **Decision**: a small package `backend/app/scoring/`:
  - `base.py`: the generic types, the band identifiers and the error.
  - `limits.py`: the accepted value ranges and validation (generic).
  - `news2.py`: the NEWS2 tables and band rule.
  - `__init__.py`: `get_scoring_system()`, which returns the NEWS2 instance, and the re-exports callers need.
- **Rationale**: four short files. Only `news2.py` knows NEWS2. Replacing NEWS2 means adding a file (for example `colombia.py`) and changing one line in `get_scoring_system()`.
- **Alternatives considered**: one file (mixes generic and NEWS2 code, so FR-006 is harder to check); an environment setting or plugin registry (nothing needs it yet, XII); an abstract base class (a `typing.Protocol` needs no inheritance and is enough).

## R3. Table-driven NEWS2

- **Decision**:
  - Numeric parameters use a tuple of `(low, high, points)` bands, with `None` for an open end. Bounds are inclusive and ordered.
  - Categorical parameters (oxygen, consciousness) use a tuple of `(values, points)`.
  - Each threshold appears exactly once. The scorer finds the matching band and copies its bounds into the explanation entry.
  - Temperature bounds are `Decimal("35.0")` etc.
- **Rationale**: the result's "range" comes straight from the same row that gave the points, so the explanation can never disagree with the score. Tests can also check that the bands cover the accepted range with no gap or overlap.
- **Alternatives considered**: `if/elif` chains (each threshold written twice, easy to get out of step with the explanation).

## R4. Independent expected values in tests

- **Decision**: boundary tests list the expected `(value, points)` pairs by hand from the RCP chart (R1), on both sides of every threshold. They do not derive them from `news2.py`'s tables. A separate test walks the NEWS2 tables and checks:
  - the bands are contiguous, with no gap or overlap;
  - they cover the full accepted range;
  - every table bound appears in the hand-written boundary list.
- **Rationale**: if expected values were generated from the table, a typo in the table would pass its own test. The coverage test makes sure no threshold is left untested.

## R5. Strict types and exact temperature comparison

- **Decision**:
  - **Integers** (respiratory rate, SpO2, systolic BP, heart rate): must be `int` and not `bool`. Python's `True` is an `int`, so `isinstance(v, bool)` is checked first.
  - **`on_oxygen`**: must be exactly `bool`.
  - **`consciousness`**: must be a `str` that is exactly one of `A`, `C`, `V`, `P`, `U` (no `.strip()` or `.upper()`).
  - **`temperature`**: `int`, `float` or `Decimal`, not `bool` and not `str`. It is converted with `Decimal(str(value))` (`float` 36.7 → `Decimal("36.7")`, not the binary 36.69999…). It must be finite and have at most one decimal place (`d == d.quantize(Decimal("0.1"))`). The explanation entry holds the value as a `Decimal` with exactly one decimal (`37` → `Decimal("37.0")`).
  - A non-integral number for an integer field (e.g. `90.5` or `90.0`) is a `wrong_type`, not rounded.
- **Rationale**: matches the clarified spec (strict types, FR-005) and the TS-03 columns (`SmallInteger`, `Boolean`, `String(1)`, `Numeric(3,1)`). It avoids float boundary errors such as 35.0 vs 35.05.
- **Alternatives considered**: Pydantic models (already installed through FastAPI, but they coerce `"36"` and `1` by default; strict mode adds config to learn, and the scorer should not depend on the web layer); accepting floats for integer fields when integral (a hidden coercion the spec rejects).

## R6. Errors as data

- **Decision**: `InvalidVitalSigns(ValueError)` with `.problems`, a tuple of `Problem(parameter, reason)`.
  - `reason` is one of the fixed codes `missing`, `unknown`, `wrong_type`, `out_of_range`, `too_many_decimals` and `not_allowed`.
  - All problems are collected before raising. At most one problem is reported per parameter: the first failing check in the order type → range/decimals.
  - `str(exc)` lists the problems as `parameter: reason` for logs and test output. It holds no values (so nothing is echoed) and no sentences to translate.
- **Rationale**: FR-005 says to list every offending parameter, and the user asked for reason codes, not free text. US-03 can map the problems to a 422 response.

## R7. Single source for limits (FR-011)

- **Decision**: `ACCEPTED_LIMITS: Mapping[str, Limit]` in `limits.py`, in the fixed parameter order, wrapped in `types.MappingProxyType` so it is read-only. `Limit` is a frozen dataclass with these fields:
  - `kind`: `"integer" | "decimal" | "boolean" | "code"`;
  - `minimum` and `maximum`, or `allowed`;
  - `decimals`, set to 1 for temperature.

  `validate()` reads only this mapping. US-03 will build its request checks from the same object. The values:
  - respiratory rate 0–80;
  - SpO2 0–100;
  - systolic BP 0–300;
  - heart rate 0–300;
  - temperature 25.0–45.0 with 1 decimal;
  - `on_oxygen` `True`/`False`;
  - consciousness `A`, `C`, `V`, `P`, `U`.
- **Rationale**: these are generic plausibility limits, not NEWS2 rules (FR-011). Another scoring system uses the same inputs.

## R8. Validation is part of scoring

- **Decision**: `vital_signs_from_mapping(data)` validates a plain mapping (missing and unknown keys, then values) and returns a `VitalSigns`. Every `ScoringSystem.score(vitals)` implementation also calls `validate_vital_signs(vitals)` first, so a `VitalSigns` built directly with bad values is never scored (FR-005: never scored).
- **Rationale**: frozen dataclasses don't check types. Validating in `score()` costs microseconds and closes the gap. NEWS2 then calls one shared function, so it keeps no validation logic of its own.

## R9. Checking FR-006 automatically

- **Decision**: a test reads every `.py` file under `backend/app/` outside `app/scoring/` and fails if it finds the text `news2` (case-insensitive). Today that set is `main.py`, `auth.py`, `db.py`, `models.py`, `passwords.py` and `seed_demo_users.py`. Callers use `from app.scoring import get_scoring_system`.
- **Rationale**: a simple text check is enough for SC-004 and needs no import-graph tool. Thresholds themselves can't be grepped reliably, but this check plus code review (security-reviewer) covers them.
