# Implementation Plan: Patient List Filter and Sort

**Branch**: `025-patient-list-filter-sort` | **Date**: 2026-11-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/025-patient-list-filter-sort/spec.md`

## Summary

US-09 adds a triage-level filter and column-header sorting to the existing patient list page (`/patients`, US-02). It is **frontend-only**: the filter and sort run in the browser on the list that `usePatientList` already holds, so there is no new request, no backend route, no query parameter and no migration. The server's default order ("who needs attention first") is the view when no column header is active, and the filter and sort are independent. Patients without readings are grouped at the end when sorting by NEWS2 score or latest reading time. New UI texts are added to `translations.js` (Spanish default, English switch) and the glossary; decision D-53 records the approach.

**Technical approach**: introduce a small pure helper `filterAndSort.js` (filter predicate + stable comparator, no React, unit-tested) and derive the shown rows inside `PatientTable` with `useMemo` from the API rows plus the filter/sort state. Add a triage-level `<select>` above the table (new `TriageFilter`) and make the four sortable `<th>` headers activatable buttons carrying `aria-sort`. No change to `usePatientList`, `ScoreBadge`, `RiskBandBadge`, `RegisterPatientButton`, `OpenSuggestionsBanner`, the health section or the backend.

## Technical Context

**Language/Version**: JavaScript (ES modules), React 19, Vite; Node 26 toolchain (frontend only — no backend change in this story)

**Primary Dependencies**: react, react-router, lucide-react (icons), the existing i18n context (`useLanguage`); no new dependency

**Storage**: N/A — reads `GET /api/patients` (US-02) only; filter/sort state is in-memory React state, not persisted

**Testing**: Vitest + @testing-library/react (component tests via `renderApp` with a stubbed backend); plain Vitest unit tests for the pure helper. Existing raw-color and contrast guard tests must keep passing

**Target Platform**: Modern browsers; the React build served by the FastAPI App Service (TS-11)

**Project Type**: Web application (`backend/` + `frontend/`); this story touches `frontend/` only

**Performance Goals**: Filtering/sorting is instant for tens of active patients (academic scale); 0 extra network requests caused by filter/sort (SC-005)

**Constraints**: No backend change, no new endpoint/query parameter, no migration (spec Out of Scope, D-49). Design tokens only (no raw colors), icons only from `lucide-react`, WCAG AA. Must not modify another functional story's code beyond mounting the controls (Principle III)

**Scale/Scope**: One page (`/patients`); ~2 new files + edits to `PatientTable.jsx` and `translations.js`; tens of patients, no pagination

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] I. Spec-driven and traceable: every task traces to a US-09 acceptance criterion; tasks will carry AC references
- [x] II. Small Scrum story: one story, frontend-only, implementable in 5–10 minutes
- [x] III. Independence: depends only on merged US-02 (per docs/BACKLOG.md); reuses US-02 artifacts by importing without changing them; edits `PatientTable.jsx` and `translations.js`, both US-02's own files that this story legitimately extends (it is the US-02 page gaining its filter/sort; no other story's code is touched beyond that page)
- [x] IV. Multi-agent: frontend-dev builds the UI and helper; qa-tester writes the tests; work logged in `agent-log.csv`
- [x] V. Clinical logic: no scoring, band or prediction logic added; the page still only displays backend values (`total`, `band`, `triage_level`), never recomputing NEWS2 — the sort compares stored values only
- [x] VI. Data privacy: tests use synthetic patients (`PAT-NNN`) and demo users only; no secrets
- [x] VII. Tests: this is a UI feature, not a scoring/API/security path, but every AC still gets at least one automated test (FR-013); the pure comparator is unit-tested
- [x] VIII. Security baseline: no new endpoint; the existing `GET /api/patients` auth (401 when signed out) is unchanged; no input reaches the server
- [x] IX. Deployable at low cost: no new service; ships with the existing App Service build
- [x] X. Stack: React frontend only; no stack change
- [x] XI. Language: all new UI text in `translations.js` (Spanish default + English), glossary terms reused (`triageLevel.*`), new terms added to `docs/GLOSSARY.md` in this PR
- [x] XII. Simplicity: one pure helper + `useMemo` derivation + a `<select>` and header buttons; no state library, no new dependency, no persistence

**Result**: PASS. No violations; Complexity Tracking not required.

### Note on Principle III (editing US-02 files)

US-09 edits `frontend/src/pages/patient-list/PatientTable.jsx` and `frontend/src/i18n/translations.js`, which US-02 introduced. This is allowed and intended: US-09 is defined in the backlog as "filter and sort the patient list" — it extends the very page US-02 built, which is the natural owner of the controls. The change adds behavior (filter/sort of already-loaded rows) without altering US-02's existing behavior (AC13 pins the patient-code link, `ScoreBadge`, refresh, last-update, failed-refresh, register button, banner and health section as unchanged). No code belonging to any *other* functional story is touched. If this were disallowed, the only alternative (a separate wrapper component re-implementing the table) would duplicate US-02 and conflict with its tests, which is worse for Principle XII. Recorded as D-57.

## Project Structure

### Documentation (this feature)

```text
specs/025-patient-list-filter-sort/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (client-side view state; no DB entities)
├── quickstart.md        # Phase 1 output (manual + test validation)
├── contracts/
│   └── ui.md            # Phase 1 output (controls, behavior, a11y, texts)
├── checklists/
│   └── requirements.md  # From /speckit-specify (all items passing)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
frontend/
└── src/
    ├── pages/
    │   └── patient-list/              # US-02's folder; US-09 adds here
    │       ├── PatientTable.jsx           # EDIT: derive rows via filterAndSort; add filter + sortable headers
    │       ├── PatientTable.module.css    # EDIT: styles for the filter control and header sort buttons/indicators (tokens only)
    │       ├── PatientTable.test.jsx      # unchanged (US-02 ACs still hold)
    │       ├── TriageFilter.jsx           # NEW: triage-level <select> ("Todos" + Triage I–V)
    │       ├── filterAndSort.js           # NEW: pure filter predicate + stable comparator
    │       ├── filterAndSort.test.js      # NEW: unit tests for the helper
    │       └── PatientListFilterSort.test.jsx  # NEW: US-09 AC tests (component)
    └── i18n/
        └── translations.js               # EDIT: new patientList.* keys (ES + EN)
```

**Structure Decision**: Web application (Option 2). US-09 works entirely inside `frontend/src/pages/patient-list/` (US-02's folder) plus the shared `translations.js`. No `backend/` change. New files are the pure helper, its unit test, the `TriageFilter` control and the US-09 component test; `PatientTable.jsx`/`.module.css` and `translations.js` are edited.

## Complexity Tracking

No constitution violations; this section is intentionally empty.
