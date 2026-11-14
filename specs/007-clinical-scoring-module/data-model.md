# Data Model: Clinical Scoring Module (TS-07)

All types are in-memory Python objects (frozen dataclasses). Nothing is stored; there is no table or migration. The input fields match the TS-03 `vital_signs` columns.

## Parameter identifiers (fixed order)

`PARAMETERS = ("respiratory_rate", "spo2", "on_oxygen", "systolic_bp", "heart_rate", "consciousness", "temperature")`

Explanation entries and `ACCEPTED_LIMITS` always use this order.

## VitalSigns (input) — `base.py`

| Field | Type | Unit / values |
|---|---|---|
| `respiratory_rate` | `int` | breaths/min |
| `spo2` | `int` | % |
| `on_oxygen` | `bool` | `True` = supplemental oxygen, `False` = air |
| `systolic_bp` | `int` | mmHg |
| `heart_rate` | `int` | beats/min |
| `consciousness` | `str` | `A`, `C`, `V`, `P`, `U` |
| `temperature` | `Decimal` (also accepts `int`/`float`) | °C, at most 1 decimal |

Built directly or with `vital_signs_from_mapping(data)`. It carries no patient id or time.

## Limit and ACCEPTED_LIMITS — `limits.py`

`Limit(kind, minimum=None, maximum=None, allowed=(), decimals=0)`

| Parameter | kind | minimum | maximum | allowed | decimals |
|---|---|---|---|---|---|
| `respiratory_rate` | `integer` | 0 | 80 | | 0 |
| `spo2` | `integer` | 0 | 100 | | 0 |
| `on_oxygen` | `boolean` | | | `(False, True)` | |
| `systolic_bp` | `integer` | 0 | 300 | | 0 |
| `heart_rate` | `integer` | 0 | 300 | | 0 |
| `consciousness` | `code` | | | `("A", "C", "V", "P", "U")` | |
| `temperature` | `decimal` | `Decimal("25.0")` | `Decimal("45.0")` | | 1 |

`ACCEPTED_LIMITS` is a read-only mapping (FR-011). Bounds are inclusive.

## Problem and InvalidVitalSigns — `base.py`

- `Problem(parameter: str, reason: str)`: `parameter` is a parameter identifier, or the unknown key as given.
- `reason` codes:

  | Code | When |
  |---|---|
  | `missing` | a required parameter is absent |
  | `unknown` | a key that is not one of the 7 parameters |
  | `wrong_type` | the value has the wrong type for its `kind` (incl. `bool` for a number, a non-`int` for an integer, a `str` temperature) |
  | `out_of_range` | a number below `minimum` or above `maximum`, or a non-finite temperature (NaN, infinity) |
  | `too_many_decimals` | the temperature is within range but has more than `decimals` decimals (checked after the range) |
  | `not_allowed` | `on_oxygen` or `consciousness` is the right type but not in `allowed` (e.g. `"a"`, `"X"`) |

- `InvalidVitalSigns(ValueError)`: `.problems: tuple[Problem, ...]`, ordered like `PARAMETERS`, with unknown keys last. There is at most one problem per parameter and it is never empty. `str()` is `"invalid vital signs: spo2: out_of_range; consciousness: not_allowed"`, with no values.

## ParameterScore (explanation entry) — `base.py`

| Field | Type | Meaning |
|---|---|---|
| `parameter` | `str` | parameter identifier |
| `value` | `int` / `bool` / `str` / `Decimal` | the value scored (temperature normalised to 1 decimal) |
| `points` | `int` | points given |
| `low` | `int` / `Decimal` / `None` | inclusive lower bound of the matched range (`None` = open, or categorical) |
| `high` | `int` / `Decimal` / `None` | inclusive upper bound (`None` = open, or categorical) |
| `category` | `tuple` | for categorical parameters, the values of the matched row, e.g. `(True,)` or `("C", "V", "P", "U")`. It is empty for numeric ones |

Example: heart rate 95 → `ParameterScore("heart_rate", 95, 1, 91, 110, ())`. SpO2 97 → `("spo2", 97, 0, 96, None, ())`. Consciousness V → `("consciousness", "V", 3, None, None, ("C", "V", "P", "U"))`.

## ScoreResult — `base.py`

| Field | Type | Rule |
|---|---|---|
| `system` | `str` | the scoring system's name, `"NEWS2"` |
| `total` | `int` | always the sum of `parameters[*].points` |
| `band` | `str` | one of `RISK_BANDS` |
| `parameters` | `tuple[ParameterScore, ...]` | exactly 7 entries, in `PARAMETERS` order |

`RISK_BANDS = ("low", "low-medium", "medium", "high")` (generic, `base.py`).

## ScoringSystem (interface) — `base.py`

`typing.Protocol` with:

- `name: str`;
- `score(vitals: VitalSigns) -> ScoreResult`, which raises `InvalidVitalSigns`.

## NEWS2 tables — `news2.py` only

- **Numeric**: `{parameter: ((low, high, points), ...)}`, ordered and contiguous. For example respiratory rate is `((None, 8, 3), (9, 11, 1), (12, 20, 0), (21, 24, 2), (25, None, 3))`.
- **Categorical**: `{"on_oxygen": (((True,), 2), ((False,), 0)), "consciousness": ((("A",), 0), (("C", "V", "P", "U"), 3))}`.
- **Band rule**: `≥7 → high`; else `≥5 → medium`; else `any points == 3 → low-medium`; else `low`.
- Values are as in [research.md R1](research.md). No other module holds these numbers.

## Relationships

`VitalSigns` → `ScoringSystem.score()` → `ScoreResult` (with 7 `ParameterScore`). On invalid input: `InvalidVitalSigns` (with ≥1 `Problem`) and no result. `ACCEPTED_LIMITS` drives the validation. Later, US-03 stores `system`, `total`, `band` and the entries, and US-04 maps `band` to an escalation.
