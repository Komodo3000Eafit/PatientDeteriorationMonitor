---

description: "Task list for US-06 vital signs chart"
---

# Tasks: Vital Signs Chart

**Input**: Design documents from `specs/022-vital-signs-chart/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/ui.md](contracts/ui.md), [quickstart.md](quickstart.md)

**Tests**: MANDATORY. This story adds an authenticated clinical view, two runtime dependencies (security control: dependency audit) and refresh behavior (constitution Principle VII; spec FR-015): at least one test per acceptance criterion AC1–AC12. Per the project template, qa-tester writes and runs the tests after implementation, then security-reviewer reviews.

**Organization**: one story (US-06); story tasks carry the `[US-06]` label.

## Format: `[ID] [P?] [Story] Description (agent)`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks).
- **(agent)**: Owner agent at the end of the line: frontend-dev, qa-tester, security-reviewer or orchestrator.
- All paths are relative to the repository root. Frontend commands run from `frontend/`; backend from `backend/` (venv active).
- Edit files with the file tools (Edit/Write), never PowerShell (non-ASCII text such as `Parámetro`, `…`, `°C`; CLAUDE.md). Keep files UTF-8.
- **Only these paths change**: `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/pages/vital-signs-chart/*` (new), `frontend/src/pages/patient-detail/PatientDetailPage.jsx` (**one import line and one mount line only**), `frontend/src/i18n/translations.js`, `docs/DECISIONS.md`, `docs/GLOSSARY.md`, `docs/BACKLOG.md`, `docs/PROJECT_STATUS.md` and this story's `agent-log.csv`. Two further changes were **already made by the user's direct request** during `/speckit-analyze` remediation (2026-11-22) and must not be redone: `frontend/src/setupTests.js` (minimal `HTMLCanvasElement.prototype.getContext` no-op stub, technical test setup, finding C2) and `frontend/src/pages/patient-detail/PatientDetailPage.test.jsx:265` (US-05; finding C1; see T011). **Do not modify** US-02 (`pages/patient-list/*`), US-03 (`pages/record-reading/*`, `utils/*`, `backend/app/readings_api.py`), US-04 (`RetriageSuggestion*`) or the rest of US-05 (`PatientDetailPage.jsx` beyond the two lines, its CSS and tests) — import only (constitution v1.3.0, D-52). No backend change, no migration, no new token unless recorded in D-53.
- Agents log each step from the repo root, **one command at a time, never in parallel**: `/opt/homebrew/bin/pwsh -NoProfile -File scripts/log-agent.ps1 -Agent <agent> -Task <Txxx> -Action <assigned|started|done|failed|finding|verified|rework> -Details "<text>"` (writes `specs/022-vital-signs-chart/agent-log.csv`).
- Synthetic data only.

---

## Phase 1: Setup

- [ ] T001 [US-06] Baseline before any change: in `frontend/` run `npm ci`, `npm test` and `npm run build` (record the passing test count and the total size of `dist/assets/*.js`, e.g. `wc -c dist/assets/*.js | tail -1`, which works on macOS and Linux); in `backend/` run `python -m pytest -q`. Record the numbers for D-53 and the PR. Do not edit files (qa-tester)
- [ ] T002 [US-06] Add the dependencies: in `frontend/` run `npm install chart.js@4.6.1 react-chartjs-2@5.3.1 --save-exact`. Check `package.json` `dependencies` adds exactly these two, pinned without caret, and nothing else changes (runtime or dev); `package-lock.json` adds them plus the transitive `@kurkle/color` (MIT). Run `npm audit --audit-level=high` (must pass; if a version is flagged, stop and report to the orchestrator), `npm test` and `npm run build` (still pass with the libraries installed but unused). Depends on T001 (AC12, FR-013) (frontend-dev)

---

## Phase 2: Foundational

None. US-03 (`GET /api/patients/{code}/readings`, `utils/formatNumber.js`), US-05 (`PatientDetailPage`), US-02 (`formatClockSeconds`, `REFRESH_MS`), TS-12 (`Card`, tokens, guard tests), TS-13 (`renderApp`, `fakeBackend` with its `readings` handler) are merged and reused unchanged.

---

## Phase 3: US-06 Vital signs chart 🎯 MVP

**Goal**: On `/patients/<code>`, any signed-in clinician sees a chart of the stored NEWS2 score (default) or one chosen vital sign over the last (up to) 50 readings, oldest to newest, refreshed every 15 s, with an accessible text alternative and no risk zones.

**Independent Test**: `npm test` passes with the new tests; manually, with the simulator in `--demo`, a new point appears on `/patients/PAT-005` within 15 s and the selector switches the parameter ([quickstart.md](quickstart.md) §2).

### Implementation (frontend-dev)

- [ ] T003 [P] [US-06] Add to `frontend/src/i18n/translations.js`, in `es` and `en`, exactly the 11 keys and texts of [contracts/ui.md](contracts/ui.md) §Texts (`vitalsChart.title`, `.parameterLabel`, `.xAxis`, `.count` with `{count}`, `.ariaLabel` with `{parameter}` and `{code}`, `.tableCaption`, `.noReadings`, `.loading`, `.loadError`, `.refreshError`, `.live` with `{time}`); change no existing key (reuse `recordReading.score` and `parameter.*`). Depends on T002 (AC10, FR-011) (frontend-dev)
- [ ] T004 [P] [US-06] Create `frontend/src/pages/vital-signs-chart/chartParameters.js` (research R4, data-model.md "Chart parameter"): export `CHART_PARAMETERS`, an ordered array of exactly six entries `{ key, labelKey, value }`: `score` → `'recordReading.score'`, `r => r.score.total`; `respiratory_rate`, `spo2`, `systolic_bp`, `heart_rate` → `'parameter.<key>'`, `r => r.<key>`; `temperature` → `'parameter.temperature'`, `r => Number(r.temperature)`; and `DEFAULT_PARAMETER = 'score'`. No `on_oxygen`, no `consciousness`, no thresholds, ranges or min/max. Also export `toPoints(readings, parameterKey)` returning `[{ recordedAt: Date, value: number }]` from the readings **reversed** (API is newest first → oldest first). Depends on T002 (AC2–AC4, FR-003, FR-004) (frontend-dev)
- [ ] T005 [P] [US-06] Create `frontend/src/pages/vital-signs-chart/chartColors.js` (research R5): `readChartColors()` reads `getComputedStyle(document.documentElement).getPropertyValue(...)` for `--color-primary`, `--color-text`, `--color-border`, trims each, and returns `{ line, text, grid }` with `undefined` for empty values (so Chart.js defaults apply in jsdom). No hex, `rgb(`, named colors or any raw color in this file. Depends on T002 (AC11, FR-012) (frontend-dev)
- [ ] T006 [P] [US-06] Create `frontend/src/pages/vital-signs-chart/useReadingsHistory.js` (research R7, data-model.md "Section state"): `useReadingsHistory(identifier)` returns `{ readings, lastUpdated, status, refreshFailed }` (`status` `'loading' | 'ok' | 'error'`). Request `apiGet('/api/patients/' + encodeURIComponent(identifier) + '/readings')` with **no** `limit` (API default 50). Import `REFRESH_MS` from `../patient-list/usePatientList.js` (do not modify that file). Schedule the next request `REFRESH_MS` after each request finishes; never two at once; `document.visibilitychange`: hidden → clear timer, visible → request at once (if none in flight) and restart; unmount → clear timer, remove listener, ignore late answers. An answer without a `readings` array counts as a failure. Success → `readings = body.readings`, `lastUpdated = new Date()`, `status = 'ok'`, `refreshFailed = false`; failure with data → keep data, `refreshFailed = true`; failure without data → `status = 'error'`. 401 is handled by the API client. Depends on T002 (AC8, AC9, FR-009, FR-010) (frontend-dev)
- [ ] T007 [US-06] Create `frontend/src/pages/vital-signs-chart/VitalSignsChart.jsx` and `VitalSignsChart.module.css` ([contracts/ui.md](contracts/ui.md) §Section; research R2, R3, R5, R6):
  - `import { Chart as ChartJS, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip } from 'chart.js'` and `ChartJS.register(...)` with **exactly** those six; `import { Line } from 'react-chartjs-2'`. No Legend, Filler, annotation or any other plugin.
  - Props `{ identifier }`; uses `useReadingsHistory`, `useLanguage()` (`{ lang, t }`), `useState(DEFAULT_PARAMETER)` for the parameter (kept across refreshes and language switches).
  - Inside `<Card title={t('vitalsChart.title')}>`: states per data-model.md (loading text; first-load error `role="alert"`; `readings.length === 0` → only `vitalsChart.noReadings`, no selector/chart). With readings: `<label htmlFor>` + native `<select>` with the six `CHART_PARAMETERS` options in order (text `t(labelKey)`); count line `t('vitalsChart.count', { count: readings.length })`; `<Line>` with `data = { labels, datasets: [{ data: values, borderColor: colors.line, pointBackgroundColor: colors.line, pointRadius: 3, fill: false }] }` and `options = { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, scales: { x: { type: 'category', title: { display: true, text: t('vitalsChart.xAxis') }, ticks: { color: colors.text }, grid: { color: colors.grid } }, y: { type: 'linear', title: { display: true, text: t(param.labelKey) }, ticks: { color: colors.text, callback: format }, grid: { color: colors.grid } } } }` — **no `min`/`max`/`suggestedMax`**, no per-point colors. Pass `role="img"` and `aria-label={t('vitalsChart.ariaLabel', { parameter: t(param.labelKey), code: identifier })}` to `<Line>`.
  - x labels: `formatClockSeconds(point.recordedAt, lang)` imported from `../patient-list/formatTime.js` (unchanged), prefixed with `new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(d) + ' '` on the first label and whenever the local day differs from the previous point.
  - Values: temperature via `formatDecimal` from `../../utils/formatNumber.js` (unchanged) with one decimal in the language's format; integers as is (tooltip callback and y tick callback use the same formatter).
  - Hidden table (class `visuallyHidden`, clip technique) with `<caption>{t('vitalsChart.tableCaption')}</caption>`, headers `vitalsChart.xAxis` and the parameter label, one row per point oldest first: full local date-time `Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'medium', hourCycle: 'h23' })` and the formatted value — built from the same points array as the line.
  - Live line `t('vitalsChart.live', { time: formatClockSeconds(lastUpdated, lang) })` whenever `lastUpdated`; `refreshFailed` → `<p role="alert">{t('vitalsChart.refreshError')}</p>`.
  - Colors from `readChartColors()`; CSS module: chart container with a fixed height token-based (e.g. `height: 18rem`), `max-width: 100%`, no raw color, no inline style except what `react-chartjs-2` sets internally.
  Depends on T003, T004, T005, T006 (AC2–AC11, FR-003–FR-012) (frontend-dev)
- [ ] T008 [US-06] Mount in `frontend/src/pages/patient-detail/PatientDetailPage.jsx`: add `import VitalSignsChart from "../vital-signs-chart/VitalSignsChart.jsx";` next to the other page imports, and the single line `{view === VIEW.loaded && <VitalSignsChart identifier={identifier} />}` right after the loaded-state block (before `</main>`). Change nothing else in the file (match its double-quote style). Depends on T007 (AC1, FR-001) (frontend-dev)

### Tests (qa-tester)

- [ ] T009 [P] [US-06] Create `frontend/src/pages/vital-signs-chart/chartParameters.test.js`: exactly six parameters in order (`score`, `respiratory_rate`, `spo2`, `systolic_bp`, `heart_rate`, `temperature`), no `on_oxygen`/`consciousness`; default `score`; `score` reads `score.total` as stored (a reading whose vitals would score differently keeps its stored total); temperature `"38.4"` → `38.4`; `toPoints` reverses newest-first input to oldest-first. Depends on T004 (AC2–AC4) (qa-tester)
- [ ] T010 [P] [US-06] Create `frontend/src/pages/vital-signs-chart/VitalSignsChart.test.jsx` (header copies the exact Spanish texts from `translations.js`; `vi.mock('react-chartjs-2', () => ({ Line: (props) => <canvas role={props.role} aria-label={props['aria-label']} data-chart={JSON.stringify({ data: props.data, options: props.options })} /> }))` or an equivalent props spy; `renderApp(['/patients/PAT-005'])`, `signInForTest(DOCTOR | NURSE)`, `stubBackend({ readings: (url) => … })` that answers the US-05 `?limit=1` call and the chart's no-limit call separately (branch on `new URL(url).searchParams.get('limit')`), plus the other US-05 calls (`/api/patients/PAT-005`, `/triage-events`) as the existing US-05 tests do; `vi.useFakeTimers({ shouldAdvanceTime: true })` where timing matters; no network):
  - AC1: chart section "Historial de signos vitales" shown for doctor and nurse below the existing blocks; the US-05 blocks still render; not shown (and no no-limit readings request) on the not-found state.
  - AC2: the chart request has no `limit`; labels and values are oldest → newest from a newest-first stub.
  - AC3: default y title "Puntaje NEWS2", values = stored `score.total`, x title "Hora de la lectura", labels `HH:MM:SS` with the date on the first label and on a day change.
  - AC4: selector has exactly six options in order; choosing each changes the y title to its `parameter.*` label and the values; no oxygen/consciousness option.
  - AC5: canvas has `role="img"` and name "Gráfico de Puntaje NEWS2 del paciente PAT-005" (and updates when the parameter changes); hidden table has one row per point with the same values and times; `pointRadius` > 0.
  - AC6: options contain no `annotation` plugin, no `min`/`max`/`suggestedMin`/`suggestedMax`, no `fill: true`, no per-point color arrays; only the six registered components (spy `ChartJS.register` or check `ChartJS.registry`).
  - AC7: `{"readings": []}` → "Aún no hay lecturas para este paciente."; no select, no canvas.
  - AC8: after 15 s a second no-limit request is made and a new point appears; "En vivo · Actualizado: HH:MM:SS" changes; the chosen parameter stays; hidden tab → no request; visible → request at once; unmount → no more requests; no overlapping request while one is pending.
  - AC9: loading text; first request 500 → "No se pudo cargar el historial. Se intentará de nuevo." and a retry after 15 s; later 500 → last chart kept + "No se pudo actualizar el gráfico. Se muestra la última versión."; 401 → `currentPath()` becomes `/login`.
  - AC10: switch to EN → "Vital signs history", "Reading time", "NEWS2 score", "Live · Updated:", temperature with a dot vs comma in es; no extra request on the switch; parameter kept.
  - AC11: with token values stubbed via `getComputedStyle` (e.g. `vi.spyOn(window, 'getComputedStyle')`), the dataset `borderColor` equals the stubbed `--color-primary` value; without CSS, colors are `undefined`.
  Then run `npm test` and `npm run build`. Depends on T008 (AC1–AC11) (qa-tester)
- [ ] T011 [US-06] Full validation ([quickstart.md](quickstart.md) §1): `npm test`, `npm run build` (record `dist/assets/*.js` total and the difference from T001 for D-53), `npm audit --audit-level=high` in `frontend/`; `python -m pytest -q` in `backend/`. All previously passing tests still pass (counts ≥ T001 plus new); `styles/noRawColors.test.js`, `contrast.test.js`, `tokens.test.js` and all US-05 tests pass; `git diff --stat -- backend frontend/src/pages/patient-list frontend/src/pages/record-reading frontend/src/utils frontend/src/styles .github` is empty; `git diff frontend/src/pages/patient-detail/PatientDetailPage.jsx` shows only the import and the mount line; `package.json` diff shows only the two pinned dependencies. Report counts next to the baseline.
  **Allowed paths beyond the story's own files** (approved directly by the user, 2026-11-22; already applied, verify only):
  - `frontend/src/pages/patient-detail/PatientDetailPage.test.jsx:265` (US-05), D-52 narrowing exception: the test "AC10/AC12 all three read endpoints are called for a valid code" now counts only the `?limit=1` call to `/api/patients/PAT-001/readings`, because the mounted chart legitimately adds its own no-limit readings request; the test's intent ("the page asks for the latest reading") is unchanged. US-05 file passed 13/13 after the edit.
  - `frontend/src/setupTests.js`: minimal no-op `HTMLCanvasElement.prototype.getContext` stub (technical test setup, no story code) so tests that render the real Chart.js through the mounted chart (US-05, route tests) do not log jsdom canvas errors; full suite 636/636 after the edit. Check that `npm test` output shows no canvas "Not implemented" / "Failed to create chart" errors once `chart.js` is installed. Depends on T009, T010 (AC12, SC-005–SC-007) (qa-tester)

### Review (security-reviewer)

- [ ] T012 [US-06] Review (read-only, change no code): the two new dependencies and the transitive `@kurkle/color` (versions pinned, MIT, audit clean, no install scripts or unexpected transitive packages in the lock diff); the chart renders no server text (only numbers and translated labels); the request uses `encodeURIComponent` on the code and stays inside the authenticated page; no raw colors or inline styles added in source; no NEWS2 thresholds/zones (Principle V); US-02/03/04/05 code unchanged except the two allowed lines. Return findings as a report; the orchestrator logs them (constitution VIII) (security-reviewer)

---

## Phase 4: Polish

- [ ] T013 [P] Edit `docs/DECISIONS.md`: add **D-53** after D-52 (date 2026-11-22, Status "Active") with the text of [plan.md](plan.md) §"D-53", the exact installed versions, licenses (MIT, including `@kurkle/color`), the measured bundle impact from T011 (before → after JS size), the audit result, the test setup note (canvas `getContext` stub in `frontend/src/setupTests.js`, since jsdom has no canvas), and the rejected options from [research.md](research.md) R1–R3, R10 (FR-014) (orchestrator)
- [ ] T014 [P] Edit `docs/GLOSSARY.md` (D-40): add **vital signs chart** = `VitalSignsChart` ("Historial de signos vitales"; one parameter at a time; NEWS2 score by default; oldest → newest; refreshed every 15 s) and **live update line** ("En vivo · Actualizado: HH:MM:SS" / "Live · Updated: HH:MM:SS"); cite `translations.js` (`vitalsChart.*`), US-06, D-53 (FR-014) (orchestrator)
- [ ] T015 [P] Edit `docs/BACKLOG.md` and `docs/PROJECT_STATUS.md`: mark US-06 done and link `specs/022-vital-signs-chart/spec.md`; update "Last updated" and the US-06…US-10 status; add a note: **US-08** (prediction) and **US-10** (export) may import `chartParameters.js` / `useReadingsHistory.js` unchanged (D-52) (FR-014) (orchestrator)
- [ ] T016 Check `specs/022-vital-signs-chart/agent-log.csv` (every task has assigned/started/done; log T012 findings with `-Action finding`), and prepare the PR record: link to `specs/022-vital-signs-chart/`, who did what per agent, T001 and T011 test counts and bundle sizes, dependency versions and audit result, security findings and resolutions, and a "Changes outside the story's folder" note listing `PatientDetailPage.test.jsx:265` (US-05, narrowed to the `?limit=1` call under the D-52 exception, approved directly by the user) and `setupTests.js` (canvas stub, test setup); end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Depends on T011–T015 (orchestrator)

---

## Dependencies & Execution Order

- **Setup**: T001 → T002.
- **Implementation**: T003, T004, T005, T006 in parallel after T002 → T007 → T008.
- **Tests**: T009 after T004 (can run alongside T007/T008); T010 after T008. T011 after T009 and T010.
- **Review**: T012 after T011.
- **Polish**: T013, T014, T015 in parallel after T011; T016 last.
- **Story dependencies**: US-03 and US-05 (merged; v1.3.0, D-52); helpers from US-02 and US-03 imported unchanged.

## Parallel Example

```text
# Round 1: T001 (qa-tester baseline) → T002 (frontend-dev dependencies)
# Round 2: frontend-dev T003 + T004 + T005 + T006 → T007 → T008   ||   qa-tester T009 (after T004)
# Round 3: qa-tester T010 → T011
# Round 4: T012 (security-reviewer) → T013 + T014 + T015 → T016 (orchestrator)
```

## Implementation Strategy

US-06 is the whole MVP:

1. Baseline and dependencies (T001–T002), staying green.
2. Texts, parameters, colors, refresh hook (T003–T006); section component (T007); mount (T008).
3. Tests for AC1–AC12 and full validation with bundle size (T009–T011).
4. Security review (T012); D-53, glossary, backlog/status, PR record (T013–T016).

After T016, commit (`US-06: Vital signs chart`), push and open the PR; CI runs tests, build and the dependency check.

## Notes

- One log command at a time; the orchestrator logs on behalf of the read-only security-reviewer.
- Do not add anything not listed (Principle XII): no date adapter, no annotation plugin, no lazy loading, no export, no prediction, no backend change, no change to US-02/03/04/05 code beyond the two mount lines.
