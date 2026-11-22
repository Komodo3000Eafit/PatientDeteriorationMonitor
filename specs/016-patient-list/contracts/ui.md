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

**Last-update line**: `patientList.lastUpdated` with `{time}` = the exact local time of the last
successful answer with seconds, 24-hour (`Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit',
second: '2-digit', hourCycle: 'h23' })`), e.g. "Actualizado: 16:05:12" / "Updated: 16:05:12" (change request
2026-11-21; no relative part).

## Table

`<table aria-label="{patients.title}">` (no `<caption>`: "Pacientes" appears only once, in the Card heading; `aria-label` because the shared `Card` has no heading `id` to reference), header row (`<th scope="col">`):

| Column | Header key | Cell |
|---|---|---|
| Patient code | `patientList.colCode` | `<Link to="/patients/<identifier>">` with the code (the only link in the row) |
| Name | `patientList.colName` | name as text |
| Triage level | `patientList.colTriage` | chip: background `--color-triage-N-soft`, border `--color-triage-N`, text `--color-text`, label `triageLevel.N` (D-48) |
| NEWS2 score | `patientList.colScore` | `ScoreBadge` (below) — or `patientList.noData` |
| Latest reading | `patientList.colLatest` | time text of `latest_score.recorded_at` — or `patientList.noData` |

Rows in the order received from the API (never re-sorted on the client). The table wrapper scrolls
sideways (`overflow-x: auto`) on narrow screens; the page itself never scrolls sideways. Tokens only.

**Page width (change request 2026-11-21):** only the patient list page is wider: `PatientListPage`
puts a class from its own CSS module on its `<main>` (e.g. `max-width: 64rem`), so on screens
1024 px wide or more all five columns are visible without horizontal scrolling. `styles/global.css`
(`main { max-width: 40rem }`) and every other page stay unchanged; below that width the table
wrapper scrolls sideways as before.

## Score badge (`ScoreBadge`, change request 2026-11-21)

New US-02 component in `pages/patient-list/` (`ScoreBadge.jsx` + `.module.css`), props `total`, `band`:

- One pill: decorative band icon, then the visible text `"{total} · {band label}"`, e.g. "19 · Alta" /
  "19 · High".
- Accessible name `patientList.scoreLabel` = "Puntaje NEWS2 19, riesgo Alta" / "NEWS2 score 19, risk High"
  (e.g. `role="img"` with `aria-label`, or a visually hidden text with the visible text `aria-hidden`).
- Tone, icon and label key come from `bandStatus(band)` in `utils/bandStatus.js`, imported unchanged;
  the soft background, solid border and dark text use the same tokens as `RiskBandBadge` for each tone,
  so colors and icons are identical to US-03. Tokens only; icons from `lucide-react`, `aria-hidden`,
  `focusable="false"`.
- An unknown band shows the fallback label ("Desconocida" / "Unknown") with the score; `latest_score = null`
  shows `patientList.noData` ("Sin datos"), never a badge.
- `RiskBandBadge` (US-03) is not modified or used by the table.

## Time text

`{relative} ({clock})`, e.g. "hace 3 min (14:32)" / "3 min. ago (14:32)":
- relative: `Intl.RelativeTimeFormat(lang, { style: 'short', numeric: 'always' })` in seconds (< 1 min),
  minutes (< 1 h), hours (< 24 h), else days;
- clock: `Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })` (24-hour
  clock in every language), plus day and short month when not today.

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
| `patientList.colScore` | Puntaje NEWS2 (0–20) | NEWS2 score (0–20) |
| `patientList.scoreLabel` | Puntaje NEWS2 {score}, riesgo {band} | NEWS2 score {score}, risk {band} |
| `patientList.colLatest` | Última lectura | Latest reading |
| `patientList.noData` | Sin datos | No data |
| `patientList.empty` | No hay pacientes activos. | There are no active patients. |
| `patientList.loading` | Cargando pacientes… | Loading patients… |
| `patientList.loadError` | No se pudo cargar la lista de pacientes. Se intentará de nuevo. | Could not load the patient list. It will try again. |
| `patientList.refreshError` | No se pudo actualizar la lista. Se muestra la última versión. | Could not update the list. Showing the last version. |
| `patientList.lastUpdated` | Actualizado: {time} | Updated: {time} |

Removed: `patients.placeholder` (es, en). Kept: `patients.title`, `triageLevel.*`, `riskBand.*`.
