# Contract: Export control and CSV util (US-10)

Folder: `frontend/src/pages/export-readings/` (new, owned by US-10).

## `readingsCsv.js` (pure, no React, no network)

| Export | Signature | Behavior |
|---|---|---|
| `CSV_COLUMNS` | `string[]` | `['recorded_at','respiratory_rate','spo2','on_oxygen','systolic_bp','heart_rate','consciousness','temperature','news2_total','risk_band']` |
| `csvField` | `(value) => string` | `String(value)`. If it starts with `=` `+` `-` `@` `\t` `\r`, prefix `'`. Then, if it contains `,` `"` `\r` `\n`, wrap it in `"` and double the inner `"` |
| `buildReadingsCsv` | `(readings) => string` | Header record + one record per reading, **in the given order**. Fields per [data-model.md](../data-model.md), every field through `csvField`, each record ending with `\r\n`; `[]` → header + `\r\n` |
| `exportFileName` | `(identifier, date = new Date()) => string \| null` | `` `${identifier}-vital-signs-${YYYY}-${MM}-${DD}.csv` `` from the local date (zero-padded); `null` when `!isPatientCode(identifier)` |

Examples:

| Input | Output |
|---|---|
| `csvField(37)` | `37` |
| `csvField(false)` | `false` |
| `csvField('=SUM(A1)')` | `'=SUM(A1)` |
| `csvField('-5')` | `'-5` |
| `csvField('a,b')` | `"a,b"` |
| `csvField('say "hi"')` | `"say ""hi"""` |
| `csvField('=1,2')` | `"'=1,2"` |
| `exportFileName('PAT-001', new Date(2026, 10, 22))` | `PAT-001-vital-signs-2026-11-22.csv` |
| `exportFileName('../x', …)` | `null` |

## `downloadCsv.js`

`downloadCsv(text, filename)`: builds a `Blob` (`text/csv;charset=utf-8`) and an object URL, then
creates a hidden `<a download={filename}>`, clicks it, removes it and revokes the URL. It has no
return value and no logging.

## `ExportReadingsButton.jsx`

- **Props**: `identifier` (patient code from `useParams()` on the detail page).
- **Mount**: `PatientDetailPage.jsx`, inside `.topRow`, on the line right after
  `<RecordReadingButton identifier={identifier} />`, as
  `<ExportReadingsButton identifier={identifier} />` (plus its import). Nothing else in US-05
  changes.
- **Renders**: `null` when `!isPatientCode(identifier)`. Otherwise its own wrapper `div`
  (`ExportReadingsButton.module.css`, tokens only) with the shared `Button` (`variant="secondary"`)
  containing `<Download aria-hidden="true" focusable="false" size="1.25em" />` from `lucide-react`
  and the label `t('exportReadings.button')`, or `t('exportReadings.busy')` while running. It is
  shown to every signed-in role and makes no request on render.
- **On click**:
  1. Set busy and disable the button. Clear any previous error.
  2. `apiGet('/api/patients/' + identifier + '/readings/export')`.
  3. If `Array.isArray(body?.readings)`, call
     `downloadCsv(buildReadingsCsv(body.readings), exportFileName(identifier))`. Otherwise treat
     it as an error.
  4. On any error, show `<p role="alert">{t('exportReadings.error')}</p>` and download nothing. A
     401 is already handled by the client (session cleared, redirect to `/login`).
  5. Clear busy.
- **Never** logs, recomputes a score, sorts or reformats values beyond `buildReadingsCsv`.

## Translations (`frontend/src/i18n/translations.js`, both languages)

| Key | es (default) | en |
|---|---|---|
| `exportReadings.button` | Exportar CSV | Export CSV |
| `exportReadings.busy` | Exportando… | Exporting… |
| `exportReadings.error` | No se pudo exportar el CSV. Inténtalo de nuevo. | Could not export the CSV. Please try again. |

The CSV header and values are not translated.

## Glossary (`docs/GLOSSARY.md`, §4 UI table, same PR)

| Code / API (English) | UI (Spanish) | Definition | Source |
|---|---|---|---|
| **vital signs CSV export** = `ExportReadingsButton` · `GET /api/patients/{code}/readings/export` | "Exportar CSV" (button) · "Exportando…" (busy) · "No se pudo exportar el CSV. Inténtalo de nuevo." (error) | Control on the patient detail page that downloads every stored reading of the patient, oldest first, as `<code>-vital-signs-<YYYY-MM-DD>.csv`: fixed English columns `recorded_at … temperature, news2_total, risk_band`, stored values and stored score, never recomputed; formula-trigger values are prefixed with `'`. Any signed-in clinician. English UI: "Export CSV" / "Exporting…" / "Could not export the CSV. Please try again." | `pages/export-readings/`; `app/readings_export_api.py`; US-10; D-53 |
