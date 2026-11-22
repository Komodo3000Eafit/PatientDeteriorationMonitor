# Phase 0 Research: Patient List Filter and Sort (US-09)

No `NEEDS CLARIFICATION` remained after `/speckit-clarify` (three questions resolved the control shape, the audience and filter/sort independence). This file records the design decisions that shape Phase 1, each with rationale and the alternatives rejected.

## R1. Where filtering and sorting happen

- **Decision**: Entirely in the browser, on the array `usePatientList` already holds. No new request, no query parameter, no backend change.
- **Rationale**: PROJECT_STATUS (US-09 note, D-49) states "filters and sorts on top of the `GET /api/patients` answer; the default order stays the server's." Scale is academic (tens of patients), so client-side work is instant and avoids any backend/migration effort (Principle XII). Keeps US-09 independent and small (Principle III).
- **Alternatives rejected**: server-side `?triage_level=&sort=` parameters (needs a backend change and new tests, violates the stated scope and D-49); fetching per filter (extra requests, breaks SC-005's "0 extra requests").

## R2. How the shown rows are derived

- **Decision**: In `PatientTable`, compute the displayed rows with `useMemo(() => filterAndSort(patients, filter, sort), [patients, filter, sort])`, where `patients` is the API array from `usePatientList`. Filter/sort are component state (`useState`).
- **Rationale**: `usePatientList` stays untouched (it owns fetching/refresh). Deriving from its output means the chosen filter/sort automatically re-apply to each 15-second refresh (AC8/FR-007) with no extra wiring. `useMemo` avoids re-sorting on unrelated renders.
- **Alternatives rejected**: pushing filter/sort into `usePatientList` (couples view state to data fetching, risks changing US-02 refresh behavior); sorting in render without memoization (re-sorts every render — unnecessary, though harmless at this scale).

## R3. Keeping the server's default order and making sort optional

- **Decision**: Model sort as `{ column: null | 'triage' | 'score' | 'code' | 'latest', direction: 'asc' | 'desc' }`. When `column === null`, `filterAndSort` returns the (filtered) rows in their original API order, unchanged. Filtering never reorders.
- **Rationale**: Directly satisfies AC5/FR-005 ("exactly the order received" when no header is active) and the independence rule: the default order is simply "no column chosen", reachable without a reset control.
- **Alternatives rejected**: defaulting `column` to `'score'` (would re-sort on load and could reorder ties differently from the server; contradicts "exactly the order the server returned").

## R4. Stable sort and tie-breaking

- **Decision**: Use a stable comparator. `Array.prototype.sort` is guaranteed stable (ES2019+), so equal keys keep their relative API order. No secondary tie-break key is added beyond that stability.
- **Rationale**: AC7 edge case and FR-006 require rows not to jump between refreshes; relying on sort stability keeps equal-key rows in the server's "who needs attention first" order for free, which is the most sensible secondary order already.
- **Alternatives rejected**: explicit multi-key comparators (more code, and the server order is already the desired tie-break); unstable sort (rows could flicker on refresh).

## R5. Patients without readings when sorting by score or time

- **Decision**: `filterAndSort` partitions rows into "has reading" (`latest_score != null`) and "no reading" (`latest_score == null`). When sorting by `score` or `latest`, only the "has reading" group is sorted by the key/direction; the "no reading" group is always appended at the end in original API order, regardless of direction. When sorting by `triage` or `code`, no partition is needed (every patient has those values). "No reading" patients are never treated as score 0 or newest/oldest time.
- **Rationale**: AC7/FR-006. Mirrors US-02's own rule (patients without readings come last). A missing score sorting as 0 would wrongly rank a brand-new patient above a low-risk one on a descending sort.
- **Alternatives rejected**: coercing `null` to `0`/`-Infinity`/`now` (wrong clinical meaning, fails AC7); dropping no-reading patients when sorting (they must still be visible).

## R6. Sort columns and default directions

- **Decision**: Four sortable columns, each with a default direction on first click (second click flips):
  - **Triage level** (`triage_level`): default ascending by number = most urgent first (Triage I = 1).
  - **NEWS2 score** (`latest_score.total`): default descending = highest first.
  - **Patient code** (`identifier`): default ascending, by string comparison (`localeCompare`).
  - **Latest reading** (`latest_score.recorded_at`): default descending = most recent first (compare as timestamps).
- **Rationale**: Matches AC4/FR-004 and the triage column (most urgent) / score column (highest) semantics clinicians expect when clicking to prioritise. Patient-code string order is acceptable because codes are `PAT-<digits>` of equal width in practice (spec Assumptions); no zero-padding logic is added (Principle XII).
- **Alternatives rejected**: numeric parse of the code's digits (extra parsing for no real benefit at this scale); a single global direction toggle shared across columns (less intuitive — each column has a natural "most useful first").

## R7. Control shape and accessibility

- **Decision**: The triage-level filter is a native `<select>` (`TriageFilter`) above the table with options "Todos" + "Triage I"…"Triage V". Sorting is driven by the four sortable `<th>`: each contains a `<button>` that sets/flips the sort; the active `<th>` gets `aria-sort="ascending" | "descending"` and a visible direction indicator (a `lucide-react` chevron icon, decorative, plus the arrow conveyed to AT via `aria-sort`). Color is never the only cue.
- **Rationale**: Clarification (Session 2026-11-21) chose clickable column headers. `aria-sort` on `<th>` is the standard a11y pattern for sortable tables. A native `<select>` is keyboard-operable and localizable with no custom widget (Principle XII, WCAG AA).
- **Alternatives rejected**: a custom dropdown widget (more code, a11y risk); making the whole `<th>` clickable without a `<button>` (worse keyboard/focus semantics); color-only sort indicator (fails WCAG AA / FR-011).

## R8. New UI texts and glossary

- **Decision**: Add `patientList.*` keys for the filter label, "Todos"/"All", the four sort-column accessible labels (e.g. "Ordenar por nivel de triage"), ascending/descending descriptions, the result count ("{shown} de {total} pacientes"), and the filtered-empty message ("No hay pacientes en este nivel."), in both `es` and `en`. Reuse `triageLevel.1`…`triageLevel.5` for the option labels. Add the new terms to `docs/GLOSSARY.md` in the same PR.
- **Rationale**: Principle XI and D-40; the triage option labels must match the rest of the app.
- **Alternatives rejected**: inline literals (breaks i18n and the glossary rule).

## R9. Testing strategy

- **Decision**: Unit-test `filterAndSort.js` directly (pure function: every column/direction, the null-score grouping, stability, empty input, the default `column: null` passthrough). Component-test the page with `renderApp` + stubbed backend for the AC-level behaviors (filter hides rows, header click sorts and flips with `aria-sort`, independence, combined filter+sort, result count, filtered-empty message, both languages, both roles, keyboard, link + `ScoreBadge` still work, controls survive a 15 s refresh).
- **Rationale**: The comparator is the risky logic and is cheapest to test in isolation; the component tests prove the ACs against the real page. Follows the existing `PatientTable.test.jsx` patterns (fake timers, `stubBackend`, synthetic data).
- **Alternatives rejected**: only component tests (ordering edge cases are tedious to assert through the DOM); only unit tests (would not cover a11y/`aria-sort`, refresh persistence or i18n).
