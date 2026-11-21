# Contract: Patient Detail UI (US-05)

The body of `frontend/src/pages/patient-detail/PatientDetailPage.jsx` is replaced. The route
`/patients/:identifier` already exists (TS-13) inside `<RequireAuth>`; `App.jsx` is **not** changed.
Tokens only; icons from `lucide-react` only (decorative); all text from `i18n`
(`useLanguage().t`), Spanish default + English. `StatusBadge` is **not** used.

## Page flow

1. `const { identifier } = useParams()`.
2. If `!isPatientCode(identifier)` → render `<NotFoundPage />`, make **no** backend call (kept
   from the current placeholder).
3. Otherwise, on mount load three blocks (independent `apiGet` calls, see research R4):
   - patient: `GET /api/patients/{identifier}`
   - current reading: `GET /api/patients/{identifier}/readings?limit=1` → `readings[0]` or none
   - history: `GET /api/patients/{identifier}/triage-events`
4. Keep the mounted line `<RecordReadingButton identifier={identifier} />` (nurse-only; renders
   nothing for a doctor).

## States

| State | When | What is shown |
|---|---|---|
| Loading | requests in flight | a translated "loading" text (`patientDetail.loading`) |
| Loaded | patient found | three blocks (below) + the record-reading button |
| Patient not found | patient endpoint returns 404 | `patientDetail.notFoundTitle` + `patientDetail.notFoundBody` + a `Link` to `/patients` (`nav.backToPatients`); no crash |
| Load error | 503 / network / timeout on any call | `patientDetail.loadErrorTitle` + `patientDetail.loadErrorBody` + a retry `Button` (`patientDetail.retry`) and the back link; never the raw server text |
| Session expired | a stored-token call returns 401 | the existing `onUnauthorized` redirect to `/login` (client.js); the page does not handle it itself |

## Block 1 — Patient data (`Card`)

- `name`, `age`, `sex` (translated via `patientDetail.sex.*`), `admitted_at`
  (`new Date(admitted_at).toLocaleString(lang)`).
- Current triage level via `<TriageLevelBadge level={patient.triage_level} />` (passed through
  unchanged).
- `status` via a translated text (`patientDetail.status.active` / `patientDetail.status.discharged`).
- **No monitoring-status traffic light** and **no `StatusBadge`.**

## Block 2 — Current reading, score and reason

- When `readings[0]` exists: render `<ReadingResult reading={readings[0]} />` (reused from US-03).
  It already shows `recorded_at`, the NEWS2 score, the risk band via `RiskBandBadge` (band-tinted,
  not `StatusBadge`) and the per-parameter reason table in ES/EN. `formatReason` / `formatValue`
  are reused through `ReadingResult`.
- When there is no reading: show the translated "no readings yet" state
  (`patientDetail.noReadingsTitle` + `patientDetail.noReadingsBody`); no band, no fabricated time.
- The "time of the last reading" shown in this area comes from the current reading's
  `recorded_at` when present; when absent, the "no readings yet" text stands in its place.

## Block 3 — Triage history (`Card`)

- A list/table of `triage_events` newest-first (the endpoint already orders them).
- Per entry: `occurred_at` (`toLocaleString(lang)`), previous level
  (`<TriageLevelBadge>` when present, else `patientDetail.noPreviousLevel` / "—"), new level
  (`<TriageLevelBadge>`), NEWS2 score (the number, or `patientDetail.noScore` when `null`),
  `reason` (shown as returned — it is English text from the backend; the source and labels are
  translated), and the source via `patientDetail.source.initial` / `.automatic` / `.manual`.
- Column headers are translated (`patientDetail.col.*`).

## i18n keys to add (both `es` and `en`)

`patientDetail.*` (new): `heading` (page `<h1>`, may reuse existing `patientDetail.title` with
`{code}`), `loading`, `notFoundTitle`, `notFoundBody`, `loadErrorTitle`, `loadErrorBody`, `retry`,
`noReadingsTitle`, `noReadingsBody`, `noPreviousLevel`, `noScore`,
`sex.female` / `sex.male` / `sex.other`, `status.active` / `status.discharged`,
`source.initial` / `source.automatic` / `source.manual`,
`col.occurredAt` / `col.previousLevel` / `col.newLevel` / `col.score` / `col.reason` / `col.source`,
and section headings `section.patient` / `section.reading` / `section.history`.

Reused unchanged: `triageLevel.*`, `riskBand.*` (via `RiskBandBadge`), `nav.backToPatients`,
`recordReading.*` / `parameter.*` / `consciousness.*` / `yesNo.*` (via `ReadingResult`).

The now-unused `patientDetail.placeholder` key is removed in both languages.

## Glossary

Add the patient-detail UI texts and the triage-event source labels (initial / automatic / manual)
to `docs/GLOSSARY.md` in this PR (constitution workflow step 2). The triage, risk-band and reading
terms already exist from TS-12 / US-03.

## Accessibility / styling

- Icons (if any, e.g. a back-arrow or history icon from `lucide-react`) are decorative:
  `aria-hidden="true"`, `focusable="false"`, `size="1.25em"`, `currentColor`.
- Tokens only in `PatientDetailPage.module.css`; the raw-color and contrast guard tests keep
  passing.
- Headings use a sensible hierarchy (`<h1>` page title, `<h2>` per section, reusing
  `ReadingResult`'s own `<h2>` for the reading block).
