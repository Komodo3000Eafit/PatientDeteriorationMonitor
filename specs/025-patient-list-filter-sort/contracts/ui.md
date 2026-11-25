# UI Contract: Patient List Filter and Sort (US-09)

This is a frontend-only story; the only "interface" is the UI on `/patients`. There is **no API contract change** — `GET /api/patients` (US-02, [specs/016-patient-list](../../016-patient-list/spec.md)) is used exactly as-is. This document pins the controls, their behavior, accessibility and texts so `qa-tester` can assert them.

## Scope of change on the patient list page

Added (US-09), inside `frontend/src/pages/patient-list/`:

- **Triage filter** (`TriageFilter`): a native `<select>` placed above the patient table (inside or just above the table's `Card`, after the register button and the suggestions banner, before the table).
- **Sortable column headers**: the four data columns (triage level, NEWS2 score, patient code, latest reading) become sortable via a `<button>` inside each `<th>`; the active header carries `aria-sort`.
- **Result count** and **filtered-empty** message.

Unchanged (US-02, AC13): the patient-code link, `ScoreBadge`, D-48 triage colors, 15 s refresh, last-update line, failed-refresh message, nurse-only register button, open-suggestions banner, health section, and the five columns themselves. No backend route/query/response changes.

## Triage filter control

- A `<select>` with an associated visible label (`patientList.filterLabel`, e.g. "Filtrar por nivel de triage").
- Options, in order: "Todos" (`patientList.filterAll`), then "Triage I"…"Triage V" using `triageLevel.1`…`triageLevel.5`.
- Default selected option: "Todos" (no filter) on every page open. Not persisted.
- Changing the selection filters the already-loaded rows in the browser; it MUST NOT trigger a `GET /api/patients`.
- When a non-"Todos" option is selected, only rows with that `triage_level` are shown; order follows the current sort.

## Sortable column headers

- Each sortable `<th>` contains a `<button>` whose **visible text is the existing column label, unchanged** (`patientList.colTriage`, `colScore`, `colCode`, `colLatest`) and whose accessible name (`aria-label`) states the column and that it sorts (e.g. `patientList.sortByTriage` = "Ordenar por nivel de triage"). The header's text content therefore stays exactly as in US-02, so US-02's header assertions (`PatientTable.test.jsx`) pass unchanged (constitution v1.4.0 page-extension exception, D-58).
- First activation of a column uses its default direction (triage asc / score desc / code asc / latest desc, see data-model R6). Activating the already-active column flips the direction.
- Exactly one column is active at a time. The active `<th>` has `aria-sort="ascending"` or `"descending"`; all other sortable `<th>` have `aria-sort="none"` (or no active state). A visible, decorative `lucide-react` chevron (e.g. `ChevronUp`/`ChevronDown`, `aria-hidden`) indicates direction; the state is conveyed to assistive technology by `aria-sort`, so color/icon is never the only cue.
- Sorting reorders the already-loaded rows in the browser; it MUST NOT trigger a `GET /api/patients`.
- Before any header is activated (`column === null`): no `<th>` shows an active sort; rows are in the server's order.

## Behavior (maps to acceptance criteria)

| Behavior | AC |
|---|---|
| Selecting a triage level shows only those patients, in the current sort | AC1 |
| "Todos" shows all patients again; it is the default | AC2 |
| Clicking a header sorts by it; the header is marked active with `aria-sort` | AC3 |
| Clicking the active header flips direction; first click uses the column default | AC4 |
| No active header ⇒ server order; filter and sort are independent (clearing filter keeps sort) | AC5 |
| Filter + sort combine (filtered rows, ordered by the chosen column/direction) | AC6 |
| Sorting by score or latest reading groups no-reading patients at the end, both directions | AC7 |
| Chosen filter and sort survive the 15 s refresh (re-applied to the new list) | AC8 |
| Filter matching no patient shows the filtered-empty message; the filter stays usable | AC9 |
| Result count "N de M pacientes" shown when a filter is active | AC10 |
| All new texts localized (ES default / EN); triage options via `triageLevel.*`; "Todos"/"All" | AC11 |
| Filter `<select>` and header `<button>`s keyboard-operable with visible focus; `aria-sort` exposes state; color never the only cue | AC12 |
| Patient-code link, `ScoreBadge`, refresh, last-update, failed-refresh, register button, banner, health section unchanged; no backend change | AC13 |

## Result count and filtered-empty

- **Result count** (`patientList.resultCount`, e.g. "{shown} de {total} pacientes" / "{shown} of {total} patients"): shown when a filter is active, reflecting rows shown vs total loaded. (It MAY also be shown with no filter; the AC only requires it when filtering.)
- **Filtered-empty** (`patientList.filteredEmpty` = "No hay pacientes en este nivel." / "No patients at this level."): shown when a filter is active and no row matches. Distinct from the US-02 empty state (`patients.length === 0` → `patientList.empty` "No hay pacientes activos."). The filter control stays rendered and usable so the user can change or clear it.

## New translation keys (both `es` and `en` in `frontend/src/i18n/translations.js`)

| Key | Spanish | English |
|---|---|---|
| `patientList.filterLabel` | Filtrar por nivel de triage | Filter by triage level |
| `patientList.filterAll` | Todos | All |
| `patientList.sortByTriage` | Ordenar por nivel de triage | Sort by triage level |
| `patientList.sortByScore` | Ordenar por puntaje NEWS2 (0–20) | Sort by NEWS2 score (0–20) |
| `patientList.sortByCode` | Ordenar por código de paciente | Sort by patient code |
| `patientList.sortByLatest` | Ordenar por última lectura | Sort by latest reading |
| `patientList.resultCount` | {shown} de {total} pacientes | {shown} of {total} patients |
| `patientList.filteredEmpty` | No hay pacientes en este nivel. | No patients at this level. |

(Exact wording may be refined during implementation, but keys, both languages, and the use of `triageLevel.*` for the options are fixed. New terms are added to `docs/GLOSSARY.md` in the same PR.)

## Styling / accessibility constraints

- Design tokens only (no raw hex); the raw-color guard test MUST keep passing.
- Icons only from `lucide-react`, decorative (`aria-hidden`, `focusable="false"`, em-sized, `currentColor`).
- Visible focus on the `<select>` and each header `<button>`; operable by keyboard (Tab to reach, Enter/Space to activate the header buttons, native select for the filter).
- WCAG AA contrast maintained; the active-sort state is conveyed by `aria-sort` and an icon, not color alone.
