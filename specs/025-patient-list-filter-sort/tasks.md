---
description: "Task list for US-09 Patient List Filter and Sort"
---

# Tasks: Patient List Filter and Sort (US-09)

**Input**: Design documents from `/specs/025-patient-list-filter-sort/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui.md, quickstart.md

**Tests**: This is a UI feature, not a scoring/prediction/API/security critical path, so tests are not mandated by Principle VII. However, FR-013 requires at least one automated test per acceptance criterion, so test tasks are included and required for this story.

**Organization**: One story per feature (project convention). All tasks belong to US-09. Phases below group setup, the pure helper, the UI, tests and docs.

## Format: `[ID] [P?] [Story] Description (agent)`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: `[US9]` for every implementation task (one story per feature)
- **(agent)**: Owner agent at the end of the line
- Exact file paths are given in each task
- Last two tasks of the story: tests by `qa-tester`, then review by `security-reviewer`; the PR record (T011, orchestrator) closes the feature
- Agents log each step from the repo root, **one row at a time, never in parallel** (concurrent appends corrupt the CSV): `/opt/homebrew/bin/pwsh -NoProfile -File scripts/log-agent.ps1 -Agent <agent> -Task <Txxx> -Action <assigned|started|done|failed|finding|verified|rework> -Details "<text>"` (writes `specs/025-patient-list-filter-sort/agent-log.csv`); the orchestrator logs on behalf of the read-only security-reviewer

## Path Conventions

Web app layout. US-09 is **frontend-only**: all paths are under `frontend/src/`. No `backend/` change, no migration.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the working branch and a green baseline before adding behavior.

- [X] T001 Confirm branch `025-patient-list-filter-sort` is checked out and up to date with `main`; from `frontend/` run `npm ci` and confirm `npm test` and `npm run build` are green before any change (baseline for US-02 tests and the raw-color/contrast guards) (frontend-dev)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure filter/sort logic that the UI and most tests depend on. No DB, no API, no migration (US-09 is frontend-only; data-model.md adds no entity).

**⚠ CRITICAL**: T002 blocks the UI wiring (T003–T005) and the helper unit test (T006).

- [X] T002 [US9] Create the pure helper `frontend/src/pages/patient-list/filterAndSort.js` exporting `filterAndSort(patients, filter, sort)` per data-model.md: (1) filter — if `filter.triageLevel !== null` keep only rows with `triage_level === filter.triageLevel`, else keep all, without reordering; (2) sort — if `sort.column === null` return the filtered rows in original API order; for `column 'triage'` (key `triage_level`, number) and `'code'` (key `identifier`, `localeCompare`) stable-sort all filtered rows by `sort.direction`; for `column 'score'` (key `latest_score.total`) and `'latest'` (key `latest_score.recorded_at` as a timestamp) partition into rows with `latest_score != null` and `latest_score == null`, stable-sort only the non-null group by key/direction, and append the null group at the end in original API order regardless of direction; the function MUST be pure (no mutation of the input array) and MUST NOT read or interpret `band`/NEWS2 thresholds (Principle V). Also export the sort-column default-direction map (triage `asc`, score `desc`, code `asc`, latest `desc`) for the UI to reuse (frontend-dev)

**Checkpoint**: `filterAndSort` is importable and pure; UI and tests can build on it.

---

## Phase 3: User Story US-09 — Filter and sort the patient list (the whole feature)

**Goal**: A triage-level filter and column-header sorting on `/patients`, applied in the browser to the already-loaded list, with the server's order as the default and no backend change.

**Independent Test**: Open `/patients` with several active patients (some without readings); confirm the default (server) order, filter by one triage level, sort by each column header (and flip), see the result count and filtered-empty message, switch language, and confirm the 15 s refresh keeps the filter/sort — all with zero extra `GET /api/patients` calls. Covered by the automated tests in T008–T009.

### Translations (do first so the UI can reference keys)

- [X] T003 [P] [US9] Add the new `patientList.*` keys to BOTH the `es` and `en` blocks of `frontend/src/i18n/translations.js` exactly as in contracts/ui.md: `filterLabel` ("Filtrar por nivel de triage" / "Filter by triage level"), `filterAll` ("Todos" / "All"), `sortByTriage`, `sortByScore`, `sortByCode`, `sortByLatest` (the four "Ordenar por …" / "Sort by …" labels), `resultCount` ("{shown} de {total} pacientes" / "{shown} of {total} patients") and `filteredEmpty` ("No hay pacientes en este nivel." / "No patients at this level."); reuse the existing `triageLevel.1`…`triageLevel.5` for the option labels (do not add new triage keys); keep both language blocks in sync (frontend-dev)

### UI components

- [X] T004 [P] [US9] Create `frontend/src/pages/patient-list/TriageFilter.jsx` (and `TriageFilter.module.css`, tokens only): a native `<select>` with an associated visible label `patientList.filterLabel`; options in order "Todos" (`patientList.filterAll`, value = all) then `triageLevel.1`…`triageLevel.5` (values 1–5); controlled via `value`/`onChange` props (the parent holds the filter state); default selection "Todos"; keyboard-operable with visible focus; texts via `useLanguage().t`; no raw colors (frontend-dev)

- [X] T005 [US9] Edit `frontend/src/pages/patient-list/PatientTable.jsx` (US-02's component; allowed only under the **page-extension exception of constitution v1.4.0, D-58**: the list MUST behave exactly as in US-02 while "Todos" is selected and no header has been clicked, and US-02's `PatientTable.test.jsx` MUST pass **unedited**) to add filter/sort on top of the list from `usePatientList` (do not change `usePatientList`): hold `filter` (`{ triageLevel: null }` default) and `sort` (`{ column: null, direction: 'asc' }` default) in `useState`; compute the shown rows with `useMemo(() => filterAndSort(patients, filter, sort), [patients, filter, sort])` so the choice re-applies to every 15 s refresh; render `<TriageFilter>` above the table (the filter is a `<select>`, and sort buttons appear only inside the table header; no other button is added — TS-05's `language.test.jsx` counts every button on `/patients`); make the four data `<th>` (triage level, NEWS2 score, patient code, latest reading) contain a `<button>` whose **visible text is the existing column label unchanged** (`patientList.colTriage` / `colScore` / `colCode` / `colLatest`) and whose `aria-label` is the matching `sortBy*` key, so each header's text content stays exactly as in US-02 (its tests compare it at lines 152 and 458) — clicking sets that column with its default direction, clicking the active column flips direction; set `aria-sort="ascending"|"descending"` on the active `<th>` and `"none"` on the others, with a decorative `lucide-react` chevron (e.g. `ChevronUp`/`ChevronDown`, `aria-hidden`, `focusable="false"`, em-sized, `currentColor`) as the visible indicator (never color alone); show `patientList.resultCount` when a filter is active; when a filter is active and no row matches, render `patientList.filteredEmpty` (distinct from the US-02 `patientList.empty`) while keeping `<TriageFilter>` rendered and usable; map rows with `filterAndSort` output only, leaving the existing patient-code `<Link>`, `ScoreBadge`, "Sin datos" handling, D-48 triage colors, last-update line and failed-refresh message unchanged (AC13) (frontend-dev)

- [X] T006 [US9] Edit `frontend/src/pages/patient-list/PatientTable.module.css` (US-02's file; page-extension exception of constitution v1.4.0, D-58: add rules only, change no existing rule) to style the filter control and the header sort buttons/indicators using design tokens only (no raw hex); keep visible focus styles; keep the existing table/scroll styles and the page-width class untouched (frontend-dev)

### Docs (same PR, per constitution and the spec FRs)

- [X] T007 [P] [US9] Update docs in the same PR: add the new UI texts to `docs/GLOSSARY.md` (filter label, "Todos"/"All", the four sort labels, result count, filtered-empty) under the patient-list entries; **update the existing D-57 row** in `docs/DECISIONS.md` (already committed in `c76cd8d`; do not add a second D-57) so it matches what was built: browser-side filter and sort on the `GET /api/patients` answer with no backend change, the server's default order, the four sort columns and their default directions, the no-reading grouping, and the named US-02 edits (`PatientTable.jsx`, `PatientTable.module.css`) under the page-extension exception of constitution v1.4.0 (D-58); do not edit D-58; mark US-09 ✅ with its spec link in `docs/BACKLOG.md` and update `docs/PROJECT_STATUS.md` (step 12/final-session stories) (frontend-dev)

### Tests (FR-013: at least one automated test per acceptance criterion) and review — last two tasks of the story

- [X] T008 [P] [US9] Write unit tests `frontend/src/pages/patient-list/filterAndSort.test.js` for the pure helper: filter by each level and "all"; sort by `triage`/`score`/`code`/`latest` in each direction; no-reading (`latest_score == null`) rows grouped at the end for `score`/`latest` in BOTH directions and never ranked as 0/newest (AC7); stability on equal keys (equal rows keep API order); `column: null` returns the filtered rows in exact API order (AC5); input array not mutated; empty input (qa-tester)

- [X] T009 [US9] Write component tests `frontend/src/pages/patient-list/PatientListFilterSort.test.jsx` using `renderApp` + `stubBackend` with synthetic patients (`PAT-NNN`, including one with `latest_score: null`) and demo users, following the `PatientTable.test.jsx` patterns (fake timers for the 15 s refresh): AC1 filter shows only the chosen level; AC2 "Todos" default and restore; AC3 header click sorts and sets `aria-sort`; AC4 second click flips, first click uses the column default; AC5 server order before any header click AND filter/sort independence (clearing filter keeps sort; choosing sort keeps filter); AC6 filter+sort combined; AC7 no-reading rows last when sorting by score/time; AC8 filter/sort survive a 15 s refresh with a changed second response; AC9 filtered-empty message distinct from the empty state, filter stays usable; AC10 result count; AC11 both languages (ES default, EN switch) with no extra `GET /api/patients` (assert the `/api/patients` call count is unchanged by filter/sort/language — SC-005); AC12 `<select>` and header `<button>`s reachable/operable by keyboard with `aria-sort` exposed; AC13 patient-code link still navigates, `ScoreBadge` still rendered, register button role rule and health section unchanged, and both DOCTOR and NURSE see the controls; then run `npm test` and `npm run build` and confirm the full frontend suite (including `PatientTable.test.jsx` and the raw-color/contrast guards) is green; confirm `git diff main -- frontend/src/pages/patient-list/PatientTable.test.jsx frontend/src/pages/patient-list/usePatientList.js frontend/src/pages/patient-list/ScoreBadge.jsx frontend/src/pages/patient-list/formatTime.js` is empty (D-58 condition 2: US-02's tests pass unedited) (qa-tester)

- [X] T010 [US9] Security review (read-only, reports findings; does not change code): confirm US-09 adds no new endpoint, query parameter or network call and no backend change; the only data source is the existing authenticated `GET /api/patients` (401 when signed out, unchanged); no secrets, no real patient data (tests use `PAT-NNN` synthetic data); no raw user input is rendered as HTML (filter is a fixed `<select>`; sort is driven by code); design tokens only and WCAG AA preserved; the only US-02 files edited are `PatientTable.jsx` and `PatientTable.module.css` (D-58), both named in D-57 and in the PR notes; record findings and resolution in the PR per `docs/agents.md` (security-reviewer)

- [X] T011 Check `specs/025-patient-list-filter-sort/agent-log.csv` (every task T001–T010 has assigned/started/done rows; T010 findings logged with `-Action finding`) and write the PR notes: link to `specs/025-patient-list-filter-sort/`; who did what per agent (from the log); the T001 baseline and T009 test counts; T010 security findings and how each was resolved; and a **"US-02 edits under D-58"** section naming `frontend/src/pages/patient-list/PatientTable.jsx` and `frontend/src/pages/patient-list/PatientTable.module.css`, stating that the list behaves as in US-02 with "Todos" and no header clicked and that US-02's `PatientTable.test.jsx` passes unedited (constitution v1.4.0 page-extension exception); end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Depends on T007–T010 (orchestrator)

**Checkpoint**: US-09 is fully functional and independently testable; US-02 behavior is unchanged; all tests and the build are green.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: T001 first — establishes a green baseline.
- **Foundational (Phase 2)**: T002 depends on T001; blocks T005, T006 and T008.
- **Story (Phase 3)**: after T002. Translations (T003) and the `TriageFilter` (T004) can start right after T002 in parallel; `PatientTable` wiring (T005) needs T002, T003 and T004; CSS (T006) needs T005; docs (T007) can go any time after the behavior is agreed; tests T008/T009 need the code they assert; the review T010 follows; the PR record T011 is last.

### Within the story

- T002 (pure logic) before T005 (UI uses it) and T008 (unit test of it).
- T003 (keys) + T004 (control) before T005 (table references both).
- T005 before T006 (CSS targets the new markup) and before T009 (component test asserts the UI).
- T008 and T009 before T010 (review after a green suite).
- T007 and T010 before T011 (the PR record names the D-57/D-58 edits and the review findings).

### Parallel opportunities

- [P] T003 (translations) and T004 (`TriageFilter`) — different files, both only need T002.
- [P] T007 (docs) — independent files, can run alongside coding once behavior is settled.
- [P] T008 (helper unit test) — different file; can be written against T002 while the UI (T005/T006) is in progress.

---

## Parallel Example

```text
# After T001 → T002 are done, launch together:
Task T003: Add patientList.* keys to frontend/src/i18n/translations.js (es + en)
Task T004: Create frontend/src/pages/patient-list/TriageFilter.jsx (+ .module.css)
Task T008: Write frontend/src/pages/patient-list/filterAndSort.test.js

# Then T005 (PatientTable wiring) → T006 (CSS) → T009 (component tests) → T010 (review) → T011 (PR record)
```

---

## Implementation Strategy

Single story, incremental within the feature:

1. T001 baseline green.
2. T002 pure helper (the risky logic), unit-testable in isolation.
3. T003 + T004 keys and control in parallel.
4. T005 + T006 wire the table and style it.
5. T007 docs (glossary, D-57, backlog, status) in the same PR.
6. T008 + T009 tests prove every AC and keep the US-02 suite and guards green.
7. T010 security review.
8. T011 agent-log check and PR notes (including the "US-02 edits under D-58" section); then open the PR with CI green.

---

## Notes

- [P] = different files, no dependency on an incomplete task.
- Every implementation task carries `[US9]` for traceability (spec → plan → tasks → code → tests).
- US-09 is frontend-only: no `backend/` edit, no Alembic migration, no new dependency.
- Do not modify `usePatientList`, `ScoreBadge`, `formatTime`, `PatientTable.test.jsx`, `RiskBandBadge`, `RegisterPatientButton`, `OpenSuggestionsBanner`, `PatientListPage.jsx`, the health section, or any other story's code (Principle III). The only US-02 files US-09 edits are `PatientTable.jsx` and `PatientTable.module.css`, under the page-extension exception of constitution v1.4.0 (D-58): baseline behavior unchanged when the feature is not used, US-02's tests passing unedited, and both edits named in D-57 and the PR notes. New keys go into the shared `translations.js`.
- Keep `.kiro/skills/` and `.claude/skills/` and any agent-file changes in sync if touched (none expected for US-09).
- Record which agent did what in the PR description (`docs/agents.md`).
