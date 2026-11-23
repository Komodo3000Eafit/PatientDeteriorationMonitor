# Data Model: Export Vital Signs to CSV (US-10)

**No schema change and no migration.** This story only reads existing tables.

## Stored data read (unchanged)

| Table | Used for | Notes |
|---|---|---|
| `patients` | `find_patient` by `identifier` (patient code) | Any `status` (active or discharged) |
| `vital_signs` | One CSV row per reading | Ordered `recorded_at` asc, then `id` asc (save order) |
| `reading_scores` | `news2_total` (`total`) and `risk_band` (`band`) per reading | Read exactly as stored; never recomputed (D-50) |

The join is `vital_signs` ⋈ `reading_scores` on `reading_scores.vital_sign_id = vital_signs.id`.
Every reading has exactly one stored score (D-50), so the inner join is complete.

## Reading object (input to the CSV)

This is the reading object of [readings-api.md](../017-vital-signs-scoring/contracts/readings-api.md),
built by the existing `to_response` without changes. The CSV uses these fields:

| CSV column | Source field | Type in JSON | Written as |
|---|---|---|---|
| `recorded_at` | `recorded_at` | string, ISO 8601 UTC | As received, no conversion |
| `respiratory_rate` | `respiratory_rate` | integer | Decimal digits |
| `spo2` | `spo2` | integer | Decimal digits |
| `on_oxygen` | `on_oxygen` | boolean | `true` / `false` |
| `systolic_bp` | `systolic_bp` | integer | Decimal digits |
| `heart_rate` | `heart_rate` | integer | Decimal digits |
| `consciousness` | `consciousness` | string `A`/`C`/`V`/`P`/`U` | As received |
| `temperature` | `temperature` | string, one decimal | As received (`"37.0"` → `37.0`) |
| `news2_total` | `score.total` | integer ≥ 0 | Decimal digits |
| `risk_band` | `score.band` | string `low`/`low-medium`/`medium`/`high` | As received |

Ignored: `score.system` and `score.entries`.

## CSV export (built in the browser, not stored)

- **Text**: the header record, then one record per reading in the order received. Each record ends
  with `\r\n`. UTF-8 with no BOM. Every field goes through `csvField` (the injection guard, then
  quoting).
- **Filename**: `<patient code>-vital-signs-<YYYY-MM-DD>.csv`, using the local export date. It
  exists only when the code matches `^[A-Z0-9-]{1,20}$`.
- **Lifecycle**: built on click, handed to the browser as a Blob, and the object URL is revoked
  right after. Nothing is stored or cached.

## Validation rules

- Patient code: `find_patient` returns 404 for a badly formatted code (no query) or an unknown
  code. The frontend checks `isPatientCode` before calling.
- Response: the frontend accepts only a body whose `readings` is an array. Anything else is
  treated as an error, and no file is downloaded.
