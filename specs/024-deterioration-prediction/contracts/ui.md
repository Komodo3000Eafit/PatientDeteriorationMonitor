# Contract: DeteriorationPrediction component (US-08)

**File**: `frontend/src/pages/patient-detail/DeteriorationPrediction.jsx` + `DeteriorationPrediction.module.css`

**Props**: `identifier` (patient code).

**Mount**: one line on `PatientDetailPage.jsx`, directly below the US-04 retriage `<section>`: `<DeteriorationPrediction identifier={identifier} />` (plus its import). `RecordReadingButton` and the retriage section are unchanged.

**Data**: `apiGet(\`/api/patients/${identifier}/prediction\`)` once on mount and when `identifier` changes. No polling, no live refresh after recording a reading.

## States

| State | Shown |
|---|---|
| Before the first successful answer (loading) | nothing (no score, band or message) |
| `rising: true` | `Card` with `TrendingUpIcon` (lucide-react, `aria-hidden`), title `prediction.title`, text `prediction.rising`, the scores oldest → newest (`prediction.scores` label, values joined with an arrow), the newest band as `<RiskBandBadge band={latest_band} />` |
| `reason: not_rising` or `missing_score` | short note `prediction.none` |
| `reason: not_enough_readings` | short note `prediction.notEnough` |
| 404 | nothing (the page shows its own not-found card; no second message) |
| 5xx, network error, timeout | short note `prediction.loadError` (never raw server text) |
| 401 | nothing from the component; re-thrown so the client's `onUnauthorized` handler clears the session and redirects |

The component never computes a score, band or prediction; it only renders the answer. State is kept as data / translation keys so switching language re-renders without a new request.

## Translations (`i18n/translations.js`)

| Key | es (default) | en |
|---|---|---|
| `prediction.title` | Predicción de deterioro | Deterioration prediction |
| `prediction.rising` | El puntaje NEWS2 subió en las últimas 3 lecturas. | The NEWS2 score rose across the last 3 readings. |
| `prediction.scores` | Puntajes (más antiguo → más reciente) | Scores (oldest → newest) |
| `prediction.latestBand` | Banda de riesgo actual | Current risk band |
| `prediction.none` | Sin predicción de deterioro. | No deterioration prediction. |
| `prediction.notEnough` | Se necesitan al menos 3 lecturas para la predicción de deterioro. | At least 3 readings are needed for the deterioration prediction. |
| `prediction.loadError` | No se pudo cargar la predicción de deterioro. | The deterioration prediction could not be loaded. |

Final wording may be adjusted by frontend-dev, keeping the glossary term "predicción de deterioro" / "deterioration prediction" and never "tendencia de empeoramiento" / "worsening trend".

## Styling

CSS Module only; existing tokens: `--color-warning` (border and icon tint only) and `--color-warning-soft` (background), text `--color-text`. No raw colors, no new token. Color is never the only cue (icon + title text). Raw-color and contrast guard tests must pass.
