# Data Model: Vital Signs Simulator (TS-08)

No table, column or migration is added. This story writes to the existing TS-03 tables ([003 data model](../003-db-tables-migrations/data-model.md)) and adds two in-code constants.

## Tables used

| Table | How TS-08 uses it |
|---|---|
| `patients` | The demo-patient command creates PAT-001 to PAT-006, and reset restores their `triage_level` and `status`. The simulator reads `status = 'active'` patients. |
| `vital_signs` | One row per reading, written **only** by `record_reading` (R1). `recorded_at` uses the database default (now). Reset deletes the demo patients' rows. |
| `triage_events` | One `source = 'initial'` event per created or reset demo patient. Reset deletes the demo patients' other rows. |
| `alerts` | Not written. Reset deletes the demo patients' rows (US-04 creates them later). |
| `users` | Not used. |

### Initial triage event (per demo patient)

| Column | Value |
|---|---|
| `patient_id` | the demo patient |
| `previous_level` | `NULL` |
| `new_level` | the patient's initial triage level |
| `score` | `NULL` |
| `reason` | `Initial triage level (demo data)` |
| `source` | `initial` |
| `created_by_id` | `NULL` |

## `DEMO_PATIENTS` (in `app/demo_patients.py`)

Fixed, synthetic, and the only patients reset can touch. The names are clearly fictional and the identifiers follow `PAT-NNN`.

| identifier | name | age | sex | scenario | initial triage level |
|---|---|---|---|---|---|
| PAT-001 | Paciente Demo Uno | 34 | female | stable | 4 |
| PAT-002 | Paciente Demo Dos | 58 | male | stable | 5 |
| PAT-003 | Paciente Demo Tres | 67 | female | slow | 3 |
| PAT-004 | Paciente Demo Cuatro | 45 | male | slow | 4 |
| PAT-005 | Paciente Demo Cinco | 72 | male | rapid | 3 |
| PAT-006 | Paciente Demo Seis | 51 | female | rapid | 4 |

**Rule**: every row's scenario is a key of `SCENARIOS`, which a test checks. Any active patient not in this table uses `stable`.

## `SCENARIOS` (in `app/simulator.py`)

Each numeric parameter has a start value and a final value. `progress = min(step / steps, 1)`. The value is `start + (final - start) * progress` plus noise drawn uniformly from `[-noise, +noise]`, then rounded and clamped to `ACCEPTED_LIMITS` (research R2, R3, R5).

| Parameter | noise | stable (steps 1) | slow (steps 12) | rapid (steps 4) |
|---|---|---|---|---|
| respiratory_rate | ±1 | 16 → 16 | 16 → 24 | 17 → 30 |
| spo2 | ±1 | 97 → 97 | 97 → 92 | 96 → 88 |
| systolic_bp | ±3 | 125 → 125 | 125 → 102 | 122 → 88 |
| heart_rate | ±3 | 76 → 76 | 78 → 112 | 80 → 135 |
| temperature (°C) | ±0.1 | 36.8 → 36.8 | 36.9 → 38.4 | 37.0 → 39.4 |
| on_oxygen | — | never | yes from progress 0.75 | yes from progress 0.6 |
| consciousness | — | always A | always A | C from progress 0.9 |

- **SpO2 noise** is also capped at 100 by the clamp.
- **Step 0** (the first reading) is the start state.
  - Rapid reaches its final state at step 4: oxygen from step 3, "C" at step 4.
  - Slow reaches its final state at step 12: oxygen from step 9.
- **No sudden jumps**: between consecutive steps, a value changes by at most `|final - start| / steps + 2 × noise` plus 1 for rounding (0.1 for temperature). Tests use this bound.
- **Expected trend**, checked in tests through `get_scoring_system()` and never in the simulator:
  - stable stays in the lowest band at every step;
  - slow and rapid have a higher total at their final step than at step 0, and are in the highest band at their final state;
  - rapid is in the highest band by step 3, i.e. the 4th round (SC-002).

## Reading generation input → output

`generate_vitals(scenario, seed, identifier, step) -> VitalSigns`

- **Inputs**: a scenario name (a key of `SCENARIOS`), a seed (`int`), an identifier (`str`) and a step (`int ≥ 0`).
- **Output**: a TS-07 `VitalSigns` with exact types:
  - `int` for respiratory_rate, spo2, systolic_bp and heart_rate;
  - `bool` for on_oxygen;
  - `str` `"A"` or `"C"` for consciousness;
  - `Decimal` with one decimal for temperature.
- **Pure**: the same inputs always give the same output, with no I/O.

## State over time

```text
demo patient:  (absent) --create--> active, initial level, 1 initial event, step 0
               any state --reset (confirmed)--> active, initial level, 1 initial event, 0 readings, 0 alerts (step 0)
simulator:     each round: step = readings so far → one new reading → step + 1
```
