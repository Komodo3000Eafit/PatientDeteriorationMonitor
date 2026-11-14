# Contract: Scoring Interface (TS-07)

The public Python interface of `app.scoring`. Later stories (US-03, US-04) import **only** from `app.scoring`, never from `app.scoring.news2` (FR-006). Types are defined in [data-model.md](../data-model.md).

## Public names (`from app.scoring import ...`)

| Name | Kind | Purpose |
|---|---|---|
| `get_scoring_system()` | function → `ScoringSystem` | The single selection point. Returns the NEWS2 instance today |
| `VitalSigns` | frozen dataclass | Input: the 7 TS-03 fields |
| `vital_signs_from_mapping(data)` | function → `VitalSigns` | Validates a plain mapping (e.g. a request body as a dict) and builds `VitalSigns`. Raises `InvalidVitalSigns` |
| `validate_vital_signs(vitals)` | function → `None` | Raises `InvalidVitalSigns` if a `VitalSigns` holds a bad value |
| `ACCEPTED_LIMITS` | read-only mapping `str → Limit` | Accepted value ranges, for reuse by US-03 (FR-011) |
| `Limit` | frozen dataclass | One parameter's limit |
| `PARAMETERS` | tuple of `str` | Parameter identifiers in fixed order |
| `RISK_BANDS` | tuple of `str` | `("low", "low-medium", "medium", "high")` |
| `ScoringSystem` | Protocol | `name: str`; `score(vitals) -> ScoreResult` |
| `ScoreResult`, `ParameterScore` | frozen dataclasses | Output |
| `InvalidVitalSigns`, `Problem` | exception, frozen dataclass | Errors |

## Behaviour

1. `get_scoring_system().score(vitals)`:
   - validates first, and raises `InvalidVitalSigns` listing every problem, with no partial result;
   - otherwise returns a `ScoreResult` with `system == "NEWS2"`, 7 entries in `PARAMETERS` order, `total == sum(points)` and `band` in `RISK_BANDS`.
2. `vital_signs_from_mapping(data)`:
   - reports `missing` for each absent parameter and `unknown` for each extra key;
   - also reports the value problems of the parameters that are present;
   - raises once with all of them.
3. Scoring is pure: no I/O, clock or environment. The same input gives an equal result.
4. Exceptions never contain input values. `str(InvalidVitalSigns)` is `invalid vital signs: <parameter>: <reason>; ...`.

## Example

```python
from decimal import Decimal
from app.scoring import get_scoring_system, vital_signs_from_mapping

vitals = vital_signs_from_mapping({
    "respiratory_rate": 22, "spo2": 95, "on_oxygen": False, "systolic_bp": 115,
    "heart_rate": 95, "consciousness": "A", "temperature": Decimal("37.5"),
})
result = get_scoring_system().score(vitals)
# result.system == "NEWS2", result.total == 4, result.band == "low"
# result.parameters[0] == ParameterScore("respiratory_rate", 22, 2, 21, 24, ())
```

## Adding another scoring system

1. Add `app/scoring/<name>.py` with a class that has `name` and `score(vitals)`. `score()` calls `validate_vital_signs(vitals)` first and returns a `ScoreResult` using the same `RISK_BANDS`.
2. Change the one line in `get_scoring_system()` to return it.
3. Add its own tests. Callers don't change.
