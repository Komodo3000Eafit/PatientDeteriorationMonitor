# Pull Request record — US-06 Vital Signs Chart

**Story**: US-06 — "As a doctor, I want a chart of a patient's vital signs history, so that I can see how they evolve."
**Spec folder**: [specs/022-vital-signs-chart/](./) ([spec.md](spec.md), [plan.md](plan.md), [tasks.md](tasks.md))
**Branch**: `022-vital-signs-chart`
**Decision**: D-54 (chart.js + react-chartjs-2, pinned, MIT)

## What was built

A `VitalSignsChart` section mounted with one line on the patient detail page (`/patients/<code>`), visible to any signed-in clinician, read-only. It plots one chosen parameter at a time (NEWS2 score by default, or respiratory rate, SpO2, systolic BP, heart rate, temperature) over the patient's last (up to 50) readings, oldest → newest, reading the existing US-03 readings history with no new backend endpoint. The NEWS2 line uses the stored `score.total` and is never recomputed. No NEWS2 thresholds or risk zones are drawn (Principle V). Colors come from the design tokens at run time; the chart has an accessible name and a visually hidden text-alternative table; it refreshes every 15 s (paused in a hidden tab) and shows a "En vivo · Actualizado: HH:MM:SS" line.

## Who did what (agent activity)

| Agent | Tasks | Work |
|---|---|---|
| orchestrator | T001–T016 (coordination) | Assigned and verified every task against the acceptance criteria; recorded D-54, the glossary entries, backlog/status and this PR record; logged the security review on the reviewer's behalf. |
| qa-tester | T001, T009, T010, T011 | Baseline measurement; `chartParameters.test.js` (11 tests, AC2–AC4); `VitalSignsChart.test.jsx` (28 tests, AC1–AC11); full validation and scope diffs. |
| frontend-dev | T002–T008 | Added the two pinned dependencies; the 11 `vitalsChart.*` texts (es/en); `chartParameters.js`, `chartColors.js`, `useReadingsHistory.js`, `VitalSignsChart.jsx` + CSS module; the one-line mount on `PatientDetailPage.jsx`. |
| security-reviewer | T012 | Read-only review: dependencies, data handling, auth surface, no raw colors, Principle V, scope — all PASS, no findings. |

## Test counts and bundle size

| Metric | Baseline (T001) | After US-06 (T011) | Delta |
|---|---|---|---|
| Frontend tests | 653 pass | 692 pass (+39 new) | +39 |
| Backend tests | 625 pass | 625 pass | 0 (no backend change) |
| `dist/assets/*.js` | 322,204 bytes | 482,568 bytes | +160,364 bytes |
| gzipped JS | 99.54 kB | 155.66 kB | +56.12 kB |

> Note: in the full-suite run, `src/pages/register-patient/RegisterPatientButton.test.jsx` (US-01) can time out under slow jsdom (real-timer `waitFor`); it passes 5/5 in isolation. Environment timing flake, unrelated to US-06.

## Dependencies

- `chart.js` **4.6.1** (MIT), `react-chartjs-2` **5.3.1** (MIT), both pinned exactly (no caret); transitive `@kurkle/color` **0.3.4** (MIT).
- `npm audit --audit-level=high`: **0 vulnerabilities.**

## Security findings

None. All six review points PASS (T012).

## Changes outside the story's folder

- `frontend/src/pages/patient-detail/PatientDetailPage.jsx` (US-05): exactly one import line + one mount line (allowed by constitution III / D-52).
- `frontend/src/pages/patient-detail/PatientDetailPage.test.jsx:265` (US-05): narrowed to count only the `?limit=1` readings call, under the D-52 narrowing exception (the mounted chart adds its own no-limit readings request); intent unchanged. Committed earlier on the branch.
- `frontend/src/pages/patient-detail/PatientDetailPage.test.jsx` lines 167 (`historyRows()`) and 222 (US-05): each lookup scoped to its own section, under the D-52 exception, because the chart adds a hidden table and a selector option with the same label. Committed earlier on the branch (`4d6652b`).
- `frontend/src/setupTests.js`: no-op `HTMLCanvasElement.prototype.getContext` and `ResizeObserver` stubs (test setup; jsdom has neither). Committed earlier on the branch.
- `docs/DECISIONS.md` (D-54), `docs/GLOSSARY.md`, `docs/BACKLOG.md`, `docs/PROJECT_STATUS.md`.

## Ready for

Commit (`US-06: Vital signs chart`), push and PR. CI runs the backend tests, frontend tests + build and the dependency check. The orchestrator does not commit, push or merge.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
