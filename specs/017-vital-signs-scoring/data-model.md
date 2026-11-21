# Data Model: Save and Score Vital-Sign Readings (US-03)

Sources: [spec.md](spec.md), [research.md](research.md) R1–R3, `backend/app/models.py` (TS-03),
`backend/app/scoring/base.py` (TS-07).

## Existing entities (unchanged)

- **Patient** (`patients`): addressed by its patient code (`identifier`). Only `status = active`
  patients accept an entered reading (409 otherwise); the history answers for any status.
- **Reading** (`vital_signs`, model `VitalSign`): `id`, `patient_id`, `recorded_at` (server time,
  database default), `respiratory_rate`, `spo2`, `on_oxygen`, `systolic_bp`, `heart_rate`,
  `consciousness`, `temperature` (`Numeric(3, 1)`). Still created only by `record_reading`.
- **User** (`users`): `role = nurse` may enter readings; any signed-in user may read the history.

## New entity: stored score (`reading_scores`, model `ReadingScore`)

Exactly one per reading; written in the same transaction as the reading; never updated or
deleted by the app (only by the demo reset).

| Column | Type | Rules |
|---|---|---|
| `id` | Integer, Identity, PK | Internal; never returned by the API |
| `vital_sign_id` | Integer, FK → `vital_signs.id` `ON DELETE RESTRICT` | NOT NULL, **UNIQUE** (one score per reading) |
| `system` | String(20) | NOT NULL; the scoring system name, `NEWS2` today |
| `total` | SmallInteger | NOT NULL; check `total >= 0`; the **NEWS2 score** |
| `band` | String(20) | NOT NULL; check `band IN ('low', 'low-medium', 'medium', 'high')`; the **risk band** |
| `entries` | JSON | NOT NULL; list of 7 explanation entries in `PARAMETERS` order (below) |

Constraint names follow the models' naming convention (`pk_reading_scores`,
`uq_reading_scores_vital_sign_id`, `fk_reading_scores_vital_sign_id_vital_signs`,
`ck_reading_scores_total`, `ck_reading_scores_band`).

### Explanation entry (one object in `entries`)

Built from `ParameterScore` by `score_values()`; codes and numbers only, no sentences.

| Key | Type | Meaning |
|---|---|---|
| `parameter` | string | One of `respiratory_rate`, `spo2`, `on_oxygen`, `systolic_bp`, `heart_rate`, `consciousness`, `temperature` |
| `value` | integer · boolean · string | The reading's value; temperature as a string with one decimal (`"38.4"`) |
| `points` | integer 0–3 | Points this parameter adds to the NEWS2 score |
| `low` | integer · string · null | Inclusive lower bound of the matched range; `null` = open end or a category parameter; temperature as string |
| `high` | integer · string · null | Inclusive upper bound; `null` = open end or a category parameter; temperature as string |
| `category` | array | Matched values for `on_oxygen` (`[true]` / `[false]`) and `consciousness` (`["A"]` / `["C","V","P","U"]`); `[]` for numeric parameters |

Example (respiratory rate 22): `{"parameter": "respiratory_rate", "value": 22, "points": 2, "low": 21, "high": 24, "category": []}`.
Example (temperature 35.0): `{"parameter": "temperature", "value": "35.0", "points": 3, "low": null, "high": "35.0", "category": []}`.

## Write flow (`record_reading`)

1. `result = get_scoring_system().score(vitals)` — validates; `InvalidVitalSigns` → nothing added.
2. Add `VitalSign(patient_id, **vitals)`; flush (gets `id`, `recorded_at` from the database).
3. Add `ReadingScore(vital_sign_id=row.id, **score_values(result))`; flush.
4. Return the `VitalSign`. The caller commits (API, simulator) or rolls back.

## Migration `0002_reading_scores`

1. Create `reading_scores` as above.
2. Online mode only: for each batch of 500 `vital_signs` rows by `id`, score and insert their
   `reading_scores` rows. An invalid stored reading raises `InvalidVitalSigns`; the single upgrade
   transaction rolls everything back.
3. `downgrade()` drops `reading_scores`. Scores are derived from readings; upgrading again
   recreates the table and rebuilds every score through the backfill.
4. Deploy order: the migration runs before the new code is live; the simulator must not run
   during the US-03 deploy, or a reading saved by the old code would have no score (D-50).

## Demo reset (`reset_demo_patients`)

Delete order becomes: alerts → triage events → **reading scores of the demo patients' readings**
→ readings (all FKs are `RESTRICT`).

## Read flow (GET history)

`SELECT vital_signs + reading_scores JOIN ON vital_sign_id WHERE patient_id = ? ORDER BY
recorded_at DESC, vital_signs.id DESC LIMIT ?` — stored scores are read, never recomputed.
