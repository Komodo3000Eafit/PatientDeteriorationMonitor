# Implementation Plan: Vital Signs Chart

**Branch**: `022-vital-signs-chart` | **Date**: 2026-11-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/022-vital-signs-chart/spec.md`

## Summary

On the patient detail page, a new chart section (one mounted line) shows how one chosen vital sign —
the stored NEWS2 score by default, or respiratory rate, SpO2, systolic BP, heart rate, temperature —
evolved over the last (up to) 50 readings, oldest to newest, evenly spaced with `HH:MM:SS` labels.
Data comes from the existing US-03 readings history; no backend change. Built with `chart.js` 4.6.1 +
`react-chartjs-2` 5.3.1 (pinned, MIT, D-54), colors read from tokens at run time, an accessible name
and a hidden table as text alternative, refreshed every 15 s (paused in a hidden tab) with a
"En vivo · Actualizado: HH:MM:SS" line. No NEWS2 thresholds or zones.

## Technical Context

**Language/Version**: JavaScript (ES modules), React 19.3, Vite 8; backend unchanged (Python 3.13, FastAPI)

**Primary Dependencies**: existing React, `react-router` 8.5.2, `lucide-react` 1.77.0; **new**: `chart.js` 4.6.1 and `react-chartjs-2` 5.3.1 (exact pins, MIT; transitive `@kurkle/color` 0.3.4, MIT)

**Storage**: none; reads `GET /api/patients/{code}/readings` (US-03)

**Testing**: Vitest + jsdom + React Testing Library; `react-chartjs-2` mocked (jsdom has no canvas), `renderApp` + `fakeBackend` (`readings` handler), `vi.useFakeTimers` for the refresh. Baseline counts recorded in the first task

**Target Platform**: one Azure App Service serving the React build (D-39); local Vite dev server

**Project Type**: web application; this story touches `frontend/` and docs only

**Performance Goals**: ≤ 50 points per chart; one request every 15 s per open, visible detail page; bundle impact measured and recorded (D-54)

**Constraints**: exactly two new runtime dependencies, pinned; no raw colors (guard test); no NEWS2 rules outside `app.scoring` (no thresholds, zones or fixed NEWS2 scale); US-03/US-05/US-02 code only imported or mounted (D-52); Spanish default + English

**Scale/Scope**: 1 mount line, 1 section component, 1 hook, 1 parameter list, 11 translation keys per language, ~25 tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] I. Spec-driven and traceable: every file maps to AC1–AC12; tests name the AC they verify
- [x] II. Small Scrum story: one story (US-06), frontend only
- [x] III. Independence: depends on US-03 and US-05 (merged), as in `docs/BACKLOG.md`; US-05's page gets one mount line (allowed); US-03's API and helpers (`formatDecimal`), US-02's `formatClockSeconds` and `REFRESH_MS` are imported unchanged (D-52); no team-session story (US-07–US-10) is touched or depended on
- [x] IV. Multi-agent: frontend-dev (chart, hook, texts, dependency), qa-tester (tests, audit, bundle size), security-reviewer (dependency risk, no server text), orchestrator (D-54, glossary, log)
- [x] V. Clinical logic: stored NEWS2 totals are only plotted; no thresholds, risk zones, fixed NEWS2 scale or risk coloring; no re-triage logic
- [x] VI. Data privacy: synthetic data only; no secrets
- [x] VII. Tests: no new API endpoint; the new view and its failure/refresh behavior are covered by automated tests; the dependency check runs in CI
- [x] VIII. Security baseline: view inside `<RequireAuth>` (detail page); read-only; no server text rendered; new dependencies audited (`npm audit --audit-level=high`)
- [x] IX. Deployable at low cost: no new service; static assets only
- [x] X. Stack: React; `chart.js`/`react-chartjs-2` are frontend libraries within the React stack (justified below)
- [x] XI. Language: English code/docs; Spanish default + English texts; glossary gains the new UI terms in this PR
- [x] XII. Simplicity: two dependencies only (no date adapter, no annotation plugin, no lazy loading); one small hook; justified in Complexity Tracking

**Post-design re-check (after Phase 1)**: still all pass.

## Project Structure

### Documentation (this feature)

```text
specs/022-vital-signs-chart/
├── spec.md
├── plan.md              # This file
├── research.md          # R1–R10
├── data-model.md        # Fields used, parameters, points, section state
├── quickstart.md
├── contracts/ui.md      # Mount line, section, chart, texts
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
frontend/
├── package.json / package-lock.json         # EDIT: chart.js 4.6.1, react-chartjs-2 5.3.1 (exact)
└── src/
    ├── pages/vital-signs-chart/
    │   ├── VitalSignsChart.jsx              # NEW: section, selector, chart, hidden table, live line
    │   ├── VitalSignsChart.module.css       # NEW: tokens only; visually hidden table class
    │   ├── useReadingsHistory.js            # NEW: fetch + 15 s chained refresh + visibility pause
    │   ├── chartParameters.js               # NEW: six parameters (label key, value accessor)
    │   ├── chartColors.js                   # NEW: read --color-primary/--color-text/--color-border at run time
    │   ├── VitalSignsChart.test.jsx         # NEW
    │   └── chartParameters.test.js          # NEW
    ├── pages/patient-detail/PatientDetailPage.jsx   # EDIT: one import + one mount line (US-05; allowed)
    └── i18n/translations.js                 # EDIT: vitalsChart.* (es, en)

docs/
├── DECISIONS.md       # EDIT: D-54
├── GLOSSARY.md        # EDIT: vital signs chart, live update line
├── BACKLOG.md         # EDIT: US-06 done, spec link
└── PROJECT_STATUS.md  # EDIT: US-06 done
```

**Structure Decision**: frontend only. All new code lives in `pages/vital-signs-chart/` (owned by
US-06); the US-05 page gets one import (after the US-08 `DeteriorationPrediction` import) and one
mount line right after the loaded-state block (before `</main>`), so the chart stays below the two
columns; in page order it is still after `<DeteriorationPrediction identifier={identifier} />` (US-08,
merged, unchanged); no backend file changes.

## D-54 (to record in `docs/DECISIONS.md`)

Vital signs chart (US-06): `chart.js` 4.6.1 and `react-chartjs-2` 5.3.1, pinned exactly, MIT
(transitive `@kurkle/color` 0.3.4, MIT); only `LineController`, `LineElement`, `PointElement`,
`LinearScale`, `CategoryScale` and `Tooltip` registered; even spacing (category axis, `HH:MM:SS`
labels), no date adapter; colors read from tokens at run time (`--color-primary`, `--color-text`,
`--color-border`); no legend, fill, annotations, thresholds or zones (Principle V); accessible name on
the canvas and a visually hidden table as text alternative; data from the US-03 readings history
(limit 50), refreshed every 15 s like D-49. `npm audit --audit-level=high` clean. Static import;
bundle grows about 56 kB gzipped (JS 98.85 → 154.96 kB, practice run before US-08; re-measured at
T001/T011 after merging `origin/main`, and the new figures go here and in D-54). Test setup:
jsdom has no canvas and no `ResizeObserver`, so `src/setupTests.js` stubs
`HTMLCanvasElement.prototype.getContext` and `ResizeObserver` with no-ops (already committed);
component tests mock `react-chartjs-2`.
Rejected: Recharts, hand-drawn SVG, time scale + date adapter, annotation plugin, lazy loading.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Two new runtime dependencies (`chart.js`, `react-chartjs-2`) | Axes, ticks, tooltips and responsive canvas drawing for a line chart; chosen by the user (decision 4) | Hand-drawn SVG re-implements axes, tick formatting, tooltips and resizing, with more untested code (Principle XII); a date adapter would be a third dependency and is avoided by even spacing |
