# Research: Vital Signs Chart (US-06)

No `NEEDS CLARIFICATION` items remain after `/speckit-clarify` (session 2026-11-22). Format:
Decision / Rationale / Alternatives.

## R1. Chart library and versions

- **Decision**: `chart.js` **4.6.1** and `react-chartjs-2` **5.3.1**, both pinned exactly (no caret),
  license **MIT**. `chart.js` brings one transitive runtime dependency, `@kurkle/color` 0.3.4 (MIT).
  `react-chartjs-2` 5.3.1 declares peers `chart.js ^4.1.1` and `react ^16.8 || … || ^19` (project
  React 19.3). Both versions were published more than two weeks ago (2026-10-22 and 2025-10-27).
- **Rationale**: chosen by the user (decision 4); the most used React + canvas chart pair, tree-shakable
  (only the registered controllers, elements and scales are bundled).
- **Verified in the practice run**: installing `chart.js` 4.6.1 + `react-chartjs-2` 5.3.1 (pinned)
  pulls only `@kurkle/color` 0.3.4; all three MIT, no install scripts; `npm audit --audit-level=high`
  clean. Bundle impact = size of the built JS before vs after (`npm run build`), recorded in D-54.
- **Alternatives**: Recharts (SVG, larger, more dependencies); hand-drawn SVG (re-implements axes,
  ticks and tooltips; Principle XII); a time scale with a date adapter (third dependency, rejected in
  clarify Q1).

## R2. Only what is needed is registered

- **Decision**: in `VitalSignsChart.jsx`, `ChartJS.register(LineController, LineElement,
  PointElement, LinearScale, CategoryScale, Tooltip)`; no `Legend` (one line, the selector names it),
  no `Filler`, no annotation plugin (no risk zones, Principle V).
- **Rationale**: smallest bundle; makes "no thresholds or zones" structural, not just a setting.

## R3. Even spacing, time labels

- **Decision**: x-axis `type: 'category'`; labels are the reading times as `HH:MM:SS`
  (24-hour, `formatClockSeconds` from `pages/patient-list/formatTime.js`, imported unchanged, D-52),
  prefixed with the short date (`Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' })`) on the
  first label and whenever the local day changes. Readings from the API (newest first) are reversed
  once to draw oldest → newest.
- **Rationale**: clarified (even spacing, `HH:MM:SS`); no date adapter needed.

## R4. Parameter definitions (UI only)

- **Decision**: `chartParameters.js` exports an ordered list of six entries
  `{ key, labelKey, value(reading) }`:
  - `score` → `recordReading.score` ("Puntaje NEWS2"), `reading.score.total` (stored, never recomputed);
  - `respiratory_rate`, `spo2`, `systolic_bp`, `heart_rate` → `parameter.<key>` (existing labels with
    units), the integer field;
  - `temperature` → `parameter.temperature`, `Number(reading.temperature)` (one-decimal string, US-03).
  Default `score`. No thresholds, no ranges, no axis min/max (the library picks the y range).
- **Rationale**: existing translated labels already carry the units (glossary); one place maps
  parameters to fields; nothing NEWS2-specific beyond reading the stored total (Principle V).

## R5. Colors from design tokens at run time

- **Decision**: `readChartColors()` reads `getComputedStyle(document.documentElement)` for
  `--color-primary` (line and points), `--color-text` (ticks, axis titles) and `--color-border`
  (grid), trimmed; an empty value is left `undefined` so Chart.js uses its defaults (jsdom/tests).
  Read once per render; no raw color in source, so `noRawColors.test.js` keeps passing.
- **Rationale**: canvas cannot use `var(--…)`; reading the computed token keeps `tokens.css` the single
  source (D-43). No new token is needed.

## R6. Accessibility and text alternative

- **Decision**: the `<Line>` canvas gets `role="img"` and `aria-label` = `vitalsChart.ariaLabel`
  ("Gráfico de {parameter} del paciente {code}"); a visually hidden `<table>` (CSS-module clip class)
  with headers "Hora de la lectura" and the parameter label lists every plotted point (full local
  date-time 24-hour with seconds, value formatted with `formatDecimal` from `utils/formatNumber.js`
  for temperature, integers as is), built from the same array as the chart. Point markers visible
  (`pointRadius` 3), so color is not the only cue. The selector is a native `<select>` with a `<label>`.
- **Rationale**: canvas content is invisible to screen readers; a table is the standard alternative
  and is easy to test (jsdom cannot draw canvas).

## R7. Refresh

- **Decision**: own hook `useReadingsHistory(identifier)` in the US-06 folder, same rules as US-02's
  `usePatientList` (which is specific to `/api/patients` and is not modified): request
  `apiGet('/api/patients/{code}/readings')` (default limit 50); next request 15 s after the previous
  one finishes (`REFRESH_MS` imported from `../patient-list/usePatientList.js`); paused while
  `document.hidden`, request at once when visible; cleanup on unmount; state `{ readings, lastUpdated,
  status: 'loading'|'ok'|'error', refreshFailed }`; an answer without a `readings` array is a failure;
  401 handled by the API client.
- **Rationale**: the US-02 hook cannot be reused unchanged (hard-coded path); a ~50-line copy of the
  pattern is simpler than generalizing US-02's code (which D-52 forbids changing).
- **Alternatives**: generalizing `usePatientList` (modifies US-02 code); `setInterval` (overlap).

## R8. Mount point (US-05 page)

- **Decision**: one line in `PatientDetailPage.jsx`, right after the loaded-state block:
  `{view === VIEW.loaded && <VitalSignsChart identifier={identifier} />}` (plus its import line).
  Shown only for a loaded patient (not on not-found / error states), full width below the two columns.
- **Rationale**: Principle III allows mounting a component; nothing else on the US-05 page changes.

## R9. Testing a canvas chart in jsdom

- **Decision**: tests `vi.mock('react-chartjs-2', …)` with a stub `Line` that renders
  `<canvas role="img" aria-label={…}>` and exposes `data`/`options` (e.g. as `data-*` JSON or via a
  captured props spy), so tests assert the labels order, values, axis titles, no annotation/zone
  plugin, point radius and colors; the hidden table is asserted with Testing Library. A separate small
  test imports the real module to check that the registered components are exactly those of R2.
- **Rationale**: jsdom has no canvas 2D context; mocking the React wrapper is the standard approach and
  keeps tests fast and deterministic.

## R10. Bundle

- **Decision**: static import (no `React.lazy`); measure `dist/assets/*.js` total before/after and
  record it in D-54. Practice run: the bundle grows about 56 kB gzipped (98.85 → 154.96 kB;
  319549 → 480180 bytes), accepted for the academic scope. These numbers predate US-08; they are
  re-measured at T001/T011 after merging `origin/main`, and D-54 records the new figures.
- **Rationale**: Principle XII; one dependency pair, measured; lazy loading can be a later decision if
  the size matters.
