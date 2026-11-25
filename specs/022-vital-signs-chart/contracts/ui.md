# Contract: Vital signs chart (US-06)

No API contract: the chart only reads `GET /api/patients/{code}/readings` (US-03,
[readings-api.md](../../017-vital-signs-scoring/contracts/readings-api.md)), default limit 50.

## Mount (US-05 page, one line)

In `PatientDetailPage.jsx`, after the loaded-state block (before `</main>`), so the chart is full
width below the two columns:

```jsx
{view === VIEW.loaded && <VitalSignsChart identifier={identifier} />}
```

plus `import VitalSignsChart from '../vital-signs-chart/VitalSignsChart.jsx'` after the US-08
`DeteriorationPrediction` import. In page order the chart comes after `<DeteriorationPrediction
identifier={identifier} />` (US-08, mounted after the re-triage suggestion section), which is not
moved or changed. Nothing else on the page
changes. Any signed-in clinician (the page is inside `<RequireAuth>`); read-only.

## Section `VitalSignsChart` (`pages/vital-signs-chart/`)

Inside a `Card` titled `vitalsChart.title`. Top to bottom (state `ok` with readings):

1. `<label>` `vitalsChart.parameterLabel` + native `<select>` with six options in this order:
   NEWS2 score (`recordReading.score`, default), `parameter.respiratory_rate`, `parameter.spo2`,
   `parameter.systolic_bp`, `parameter.heart_rate`, `parameter.temperature`.
2. Count line `vitalsChart.count` ("Últimas {count} lecturas" / "Last {count} readings").
3. Chart (line, one dataset): canvas `role="img"`, `aria-label` = `vitalsChart.ariaLabel`.
   - x: category, one step per reading, oldest left; labels `HH:MM:SS` (24-hour), with
     `{day} {month}` prefixed on the first label and when the local day changes;
     x-axis title `vitalsChart.xAxis`.
   - y: linear, auto range (no fixed min/max), title = the chosen parameter's label (with unit).
   - Point markers visible (radius 3); tooltip shows time and formatted value.
   - Colors read at run time from tokens: line/points `--color-primary`, text `--color-text`,
     grid `--color-border`. No legend, no fill, no annotations, no thresholds, no zones, no
     per-point risk colors.
4. Visually hidden `<table>` (text alternative): caption `vitalsChart.tableCaption`, headers
   `vitalsChart.xAxis` and the parameter label; one row per point, oldest first; time as full local
   date and time (24-hour, seconds); value integer, or temperature with one decimal in the language's
   format (`formatDecimal`).
5. Live line `vitalsChart.live` with `{time}` = `formatClockSeconds(lastUpdated, lang)`, e.g.
   "En vivo · Actualizado: 16:05:12".

Other states: `loading` → `vitalsChart.loading`; first load failed → `vitalsChart.loadError`
(`role="alert"`); no readings → `vitalsChart.noReadings` only; refresh failed → last chart + live line +
`vitalsChart.refreshError` (`role="alert"`).

## Refresh

15 s after the previous request finishes (`REFRESH_MS` from US-02, imported); paused while
`document.hidden`; at once when visible again; stopped on unmount; never two requests at once; the
chosen parameter is kept; switching language redraws without a request.

## Texts (`translations.js`)

| Key | es (default) | en |
|---|---|---|
| `vitalsChart.title` | Historial de signos vitales | Vital signs history |
| `vitalsChart.parameterLabel` | Parámetro | Parameter |
| `vitalsChart.xAxis` | Hora de la lectura | Reading time |
| `vitalsChart.count` | Últimas {count} lecturas | Last {count} readings |
| `vitalsChart.ariaLabel` | Gráfico de {parameter} del paciente {code} | Chart of {parameter} for patient {code} |
| `vitalsChart.tableCaption` | Valores del gráfico | Chart values |
| `vitalsChart.noReadings` | Aún no hay lecturas para este paciente. | No readings yet for this patient. |
| `vitalsChart.loading` | Cargando historial… | Loading history… |
| `vitalsChart.loadError` | No se pudo cargar el historial. Se intentará de nuevo. | Could not load the history. It will try again. |
| `vitalsChart.refreshError` | No se pudo actualizar el gráfico. Se muestra la última versión. | Could not update the chart. Showing the last version. |
| `vitalsChart.live` | En vivo · Actualizado: {time} | Live · Updated: {time} |

Reused unchanged: `recordReading.score`, `parameter.*`.
