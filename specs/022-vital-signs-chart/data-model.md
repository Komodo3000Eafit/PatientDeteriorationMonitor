# Data Model: Vital Signs Chart (US-06)

No backend change, no database change. The chart reads the US-03 readings history.

## Source: `GET /api/patients/{code}/readings` (US-03, unchanged)

Default limit 50, newest first. Fields used per reading (names from
[readings-api.md](../017-vital-signs-scoring/contracts/readings-api.md)):

| Field | Type in the answer | Used as |
|---|---|---|
| `recorded_at` | ISO 8601 string | x label (`HH:MM:SS`, date when it changes) and table time |
| `score.total` | integer ≥ 0 | value for "NEWS2 score" (stored, never recomputed) |
| `respiratory_rate`, `spo2`, `systolic_bp`, `heart_rate` | integer | value as is |
| `temperature` | one-decimal string | `Number(...)` for drawing; shown with `formatDecimal` |
| `on_oxygen`, `consciousness`, `score.band`, `score.entries` | — | not used |

## Chart parameter (UI only, `chartParameters.js`)

| key | label key | value |
|---|---|---|
| `score` (default) | `recordReading.score` | `r.score.total` |
| `respiratory_rate` | `parameter.respiratory_rate` | `r.respiratory_rate` |
| `spo2` | `parameter.spo2` | `r.spo2` |
| `systolic_bp` | `parameter.systolic_bp` | `r.systolic_bp` |
| `heart_rate` | `parameter.heart_rate` | `r.heart_rate` |
| `temperature` | `parameter.temperature` | `Number(r.temperature)` |

## Chart point (UI only)

`{ recordedAt: Date, value: number }` built from the readings **reversed** (oldest → newest). The same
array feeds the line and the hidden table.

## Section state (`useReadingsHistory`)

| State | Shown |
|---|---|
| `loading` | `vitalsChart.loading` |
| `error` (first load failed) | `vitalsChart.loadError` (`role="alert"`), retry every 15 s |
| `ok`, `readings = []` | `vitalsChart.noReadings`; no selector, no chart |
| `ok`, readings | selector + count line + chart + hidden table + live line |
| `ok` + `refreshFailed` | last chart + live line (last success) + `vitalsChart.refreshError` (`role="alert"`) |

Transitions as in US-02 (D-49): success → `ok`, clears `refreshFailed`; failure with data →
`refreshFailed`; failure without data → `error`; 401 → session-expiry handling. The chosen parameter
is component state and survives refreshes and language switches.
