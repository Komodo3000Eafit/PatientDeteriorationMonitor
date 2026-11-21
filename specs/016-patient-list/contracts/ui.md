# Contract: Patient list page (US-02)

## Page `/patients` (inside `<RequireAuth>`, any signed-in clinician)

Top to bottom:

1. `h1` `app.title` (unchanged).
2. `<RegisterPatientButton />` (US-01, unchanged; nurse only).
3. `Card` titled `patients.title` ("Pacientes" / "Patients") containing the patient table area (below).
4. Health `<section role="status">` (TS-04/TS-13, unchanged; one `/health` check per page load).

## Patient table area

| State | Content |
|---|---|
| First load in flight | `patientList.loading` |
| First load failed | `patientList.loadError` (in `role="alert"`); retried every 15 s |
| Loaded, no active patients | `patientList.empty` + last-update line |
| Loaded, patients | table + last-update line |
| A later refresh failed | last table + last-update line (unchanged) + `patientList.refreshError` in `role="alert"`; removed after the next success |

**Last-update line**: `patientList.lastUpdated` with `{time}` = time text (below) of the last
successful answer, e.g. "Actualizado: hace 15 s (14:32)".

## Table

`<table aria-label="{patients.title}">` (no `<caption>`: "Pacientes" appears only once, in the Card heading; `aria-label` because the shared `Card` has no heading `id` to reference), header row (`<th scope="col">`):

| Column | Header key | Cell |
|---|---|---|
| Patient code | `patientList.colCode` | `<Link to="/patients/<identifier>">` with the code (the only link in the row) |
| Name | `patientList.colName` | name as text |
| Triage level | `patientList.colTriage` | chip: background `--color-triage-N-soft`, border `--color-triage-N`, text `--color-text`, label `triageLevel.N` (D-48) |
| NEWS2 score | `patientList.colScore` | `total` number + `RiskBandBadge` (from `pages/record-reading`, unchanged) — or `patientList.noData` |
| Latest reading | `patientList.colLatest` | time text of `latest_score.recorded_at` — or `patientList.noData` |

Rows in the order received from the API (never re-sorted on the client). The table wrapper scrolls
sideways (`overflow-x: auto`) on narrow screens; the page itself never scrolls sideways. Tokens only.

## Time text

`{relative} ({clock})`, e.g. "hace 3 min (14:32)" / "3 min ago (14:32)":
- relative: `Intl.RelativeTimeFormat(lang, { style: 'short', numeric: 'always' })` in seconds (< 1 min),
  minutes (< 1 h), hours (< 24 h), else days;
- clock: `Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' })`, plus day and short month
  when not today.

## Refresh

Every 15 s after the previous request finishes; paused while `document.hidden`; on becoming visible,
request at once and restart the timer; stopped on leaving the page; never two requests at once;
401 → existing session-expiry handling.

## Texts (`translations.js`)

| Key | es (default) | en |
|---|---|---|
| `patientList.colCode` | Código | Code |
| `patientList.colName` | Nombre | Name |
| `patientList.colTriage` | Nivel de triage | Triage level |
| `patientList.colScore` | Puntaje NEWS2 | NEWS2 score |
| `patientList.colLatest` | Última lectura | Latest reading |
| `patientList.noData` | Sin datos | No data |
| `patientList.empty` | No hay pacientes activos. | There are no active patients. |
| `patientList.loading` | Cargando pacientes… | Loading patients… |
| `patientList.loadError` | No se pudo cargar la lista de pacientes. Se intentará de nuevo. | Could not load the patient list. It will try again. |
| `patientList.refreshError` | No se pudo actualizar la lista. Se muestra la última versión. | Could not update the list. Showing the last version. |
| `patientList.lastUpdated` | Actualizado: {time} | Updated: {time} |

Removed: `patients.placeholder` (es, en). Kept: `patients.title`, `triageLevel.*`, `riskBand.*`.
