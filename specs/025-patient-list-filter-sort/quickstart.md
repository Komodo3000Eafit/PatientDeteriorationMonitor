# Quickstart & Validation: Patient List Filter and Sort (US-09)

How to run and verify US-09. It is frontend-only; no backend, database or migration is involved.

## Prerequisites

- Frontend dependencies installed: from `frontend/`, `npm ci` (first time) or `npm install`.
- No `DATABASE_URL`, no backend run, no Neon branch needed for the automated tests (the backend is stubbed in component tests, and the helper tests are pure).
- To see it in a browser against real data: run the backend and the simulator per [DEVELOPMENT.md](../../../DEVELOPMENT.md), sign in, and open `/patients` with several active patients (some without readings).

## Automated tests (primary validation)

From `frontend/`:

```bash
# Run the US-09 unit + component tests
npx vitest run src/pages/patient-list/filterAndSort.test.js
npx vitest run src/pages/patient-list/PatientListFilterSort.test.jsx

# Full frontend suite + build (must stay green, including the US-02 tests and the raw-color/contrast guards)
npm test
npm run build
```

**Expected**: all tests pass, including the pre-existing `PatientTable.test.jsx` (US-02 behavior unchanged) and the style guard tests.

## What the tests cover (traceability)

- `filterAndSort.test.js` — pure helper: filter by each level and "all"; sort by `triage`/`score`/`code`/`latest` in each direction; no-reading grouping at the end for `score`/`latest` in both directions (AC7); stability on equal keys; `column: null` returns the server order unchanged (AC5); input not mutated.
- `PatientListFilterSort.test.jsx` — page behavior with `renderApp` + stubbed backend and synthetic patients:
  - AC1/AC2 filter hides/shows rows; "Todos" default.
  - AC3/AC4 header click sorts and sets `aria-sort`; second click flips; first click uses the column default.
  - AC5 server order before any header click; AC5/independence: clearing the filter keeps the sort, choosing a sort keeps the filter.
  - AC6 filter + sort combined.
  - AC8 chosen filter/sort survive a 15 s refresh (fake timers, a changed second response).
  - AC9 filtered-empty message distinct from the empty state; filter stays usable.
  - AC10 result count.
  - AC11 both languages (ES default, EN switch) with no extra `GET /api/patients`.
  - AC12 `<select>` and header `<button>`s reachable/operable by keyboard; `aria-sort` present.
  - AC13 patient-code link still navigates, `ScoreBadge` still rendered, register button role rule and health section unchanged; both doctor and nurse see the controls.

## Manual smoke check (optional)

1. Open `/patients` with ≥ 3 active patients at different triage levels, at least one without readings.
2. Confirm the list first appears in the server's order (highest score first, then triage, then code). No column shows an active sort.
3. Pick "Triage II" in the filter → only Triage II patients remain; the result count shows "N de M pacientes".
4. Click the **NEWS2 score** header → rows sort highest first; click again → lowest first, with no-reading patients staying at the end both times.
5. Click the **Código** header → ascending by code; the score sort indicator clears.
6. Change the language to English → labels, the filter options, the result count and messages switch; the current filter/sort stay; no network request fires.
7. Pick a triage level with no patients → "No hay pacientes en este nivel." / "No patients at this level." appears; change the filter back to recover the list.
8. Leave the page idle ~15 s → the list refreshes (US-02) and your filter/sort are still applied.
9. Keyboard only: Tab to the filter and change it; Tab to a column header and press Enter/Space to sort and flip; focus is visible throughout.

## Done when

- Every US-09 acceptance criterion has at least one passing automated test (FR-013).
- `npm test` and `npm run build` pass; the raw-color and contrast guards pass.
- `docs/GLOSSARY.md`, `docs/BACKLOG.md`, `docs/PROJECT_STATUS.md` and `docs/DECISIONS.md` (D-57) are updated in the PR.
