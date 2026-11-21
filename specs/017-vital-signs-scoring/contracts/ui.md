# Contract: Record Reading UI (US-03)

Page `/patients/:identifier/readings/new`, the result view, and the nurse-only button. Reuses
Button, Card, `OctagonXIcon`, `useAuth`, `useLanguage`, `isPatientCode`, `apiPost`, tokens only
(D-43), icons from `lucide-react` only (D-46). The frontend never computes points, the NEWS2
score or the risk band.

## Route (App.jsx, route registration)

```jsx
<Route path="/patients/:identifier/readings/new" element={<RecordReadingPage />} />
```

Inside the `<RequireAuth>` group. Ranks above `/patients/:identifier` (more segments, D-45). If
`isPatientCode(identifier)` is false the page renders `<NotFoundPage />`.

## Roles

| Signed-in role | Shows |
|---|---|
| `nurse` | Title + form (below); after a 201, the result view |
| any other (`doctor`) | Title, message `recordReading.nursesOnly`, link `recordReading.backToPatient` → `/patients/<code>`; no form |
| signed out | Redirect to `/login` (existing `<RequireAuth>`) |

## Form (inside one Card), top to bottom, every field full width

Title: `recordReading.title` with the patient code ("Registrar signos vitales · PAT-001").

| # | Field | Control | Client check (no ranges) |
|---|---|---|---|
| 1 | `respiratory_rate` | text, `inputMode="numeric"`, unit "resp/min" | filled, `^\d+$` |
| 2 | `spo2` | text, `inputMode="numeric"`, unit "%" | filled, `^\d+$` |
| 3 | `on_oxygen` | `fieldset` + 2 native radios Sí / No, none pre-selected | chosen |
| 4 | `systolic_bp` | text, `inputMode="numeric"`, unit "mmHg" | filled, `^\d+$` |
| 5 | `heart_rate` | text, `inputMode="numeric"`, unit "lpm" / "bpm" | filled, `^\d+$` |
| 6 | `consciousness` | `fieldset` + 5 native radios, each "A — Alerta" … "U — No responde", none pre-selected | chosen |
| 7 | `temperature` | text, `inputMode="decimal"`, unit "°C" | filled, `^\d+([.,]\d)?$`; a comma is sent as a dot |

Submit: shared Button, full width, `recordReading.submit`; disabled while saving (plus a
synchronous guard against double submit). Sent body: integers as numbers, temperature as a
number, `on_oxygen` boolean, `consciousness` letter.

Each field error is a `<p>` with `OctagonXIcon` next to the field, linked by `aria-describedby`;
the field gets `aria-invalid="true"`.

## Errors after sending (typed values always kept; never server text or a value)

| Answer | Shows |
|---|---|
| 422 with `detail[i].loc[1]` = one of the 7 parameter codes | next to that field, by reason (change request 2026-11-20): `missing` → `recordReading.required`; `out_of_range` with `ctx.min`/`ctx.max` → `recordReading.rangeError` with `{min}`, `{max}` (formatted by language, see "Number format") and `{unit}` = `unit.<parameter>`; `too_many_decimals` → `recordReading.decimalsError`; `not_allowed` with `ctx.allowed` → `recordReading.allowedError` with `{values}` = `ctx.allowed.join(', ')`; `wrong_type`, or any reason whose `ctx` is missing or malformed → `recordReading.valueRejected`. Only `ctx` (the rule) is shown, never the submitted value |
| 422 entry whose `loc[1]` is not one of the 7 parameter codes (e.g. an unknown key), or whose `loc` has no second element (body not an object), or no parseable detail | general `recordReading.errorInvalid` |
| 404 | `recordReading.errorNotFound` |
| 409 | `recordReading.errorDischarged` |
| 403 | `recordReading.nursesOnly` |
| 401 | none: existing session-expiry handling sends the user to `/login` |
| 5xx, network, timeout | `recordReading.errorFailed` |

`ApiError` (api/client.js) gains `detail`: the parsed body's `detail` array for a 422, otherwise
`null`. Its message stays `HTTP <status>`.

## Result view (`ReadingResult`, after 201; rendered from the answer only)

- Heading `recordReading.resultTitle`; `recorded_at` shown as local date-time.
- "Puntaje NEWS2: 5" (`score.total`) and "Banda de riesgo:" followed by the **risk band badge**
  (`RiskBandBadge`, change request 2026-11-20, see below).
- A table, one row per entry in order: parameter name (`parameter.<code>`), value (on oxygen →
  `yesNo.true/false`; consciousness → letter + `consciousness.<code>`; temperature formatted by
  language: `36,8` / `36.8`), points, reason from `formatReason(entry, t, lang)`:
  - `low` and `high` → "21–24" (temperature "38,1–39,0" in Spanish, "38.1–39.0" in English);
    only `high` → "≤ 8"; only `low` → "≥ 25"
  - category → "Sí" / "No" for on oxygen, letters joined by ", " for consciousness ("C, V, P, U")
- Buttons/links: `recordReading.another` (clears the form, shows it again) and
  `recordReading.backToPatient` → `/patients/<code>`.

## Risk band badge (`RiskBandBadge`, change request 2026-11-20)

`frontend/src/pages/record-reading/RiskBandBadge.jsx` (+ `.module.css`), props `{ band }`. Same
look as `StatusBadge` (pill, 2px solid border, soft background, `--color-text` label, weight 600):
a decorative `lucide-react` icon (`aria-hidden="true"`, `focusable="false"`, currentColor) and the
label `t(labelKey)`. It renders whatever `bandStatus(band)` returns; it never computes a band.

`frontend/src/utils/bandStatus.js` — the **single mapping** (unit-tested):

| `band` | Tone (border / background tokens) | Icon (`lucide-react`) | Label key | Color |
|---|---|---|---|---|
| `low` | `--color-stable` / `--color-stable-soft` | `CheckCircle` | `riskBand.low` | green |
| `low-medium` | `--color-warning` / `--color-warning-soft` | `TriangleAlert` | `riskBand.low-medium` | yellow |
| `medium` | `--color-band-medium` / `--color-band-medium-soft` (**new**) | `CircleAlert` | `riskBand.medium` | orange |
| `high` | `--color-critical` / `--color-critical-soft` | `OctagonX` | `riskBand.high` | red |
| anything else | `--color-no-data` / `--color-no-data-soft` | `CircleDashed` | `riskBand.unknown` | grey |

`bandStatus(band)` → `{ tone: 'stable' | 'warning' | 'band-medium' | 'critical' | 'no-data',
icon: <name>, labelKey }`. The CSS module has one class per tone using only these tokens.

New tokens in `tokens.css` (amends D-43 in part, recorded in D-50):
`--color-band-medium: #EA580C` (border and icon only, never text; on its soft color 3.11:1) and
`--color-band-medium-soft: #FFEDD5` (background; `--color-text` on it 12.77:1).
`monitoring_status` / `StatusBadge` are unchanged; **US-02 decides** how bands map to the
monitoring status.

## Number format (change request 2026-11-20)

`frontend/src/utils/formatNumber.js`: `formatDecimal(value, lang)` takes a number or numeric
string and returns it with `,` as the decimal separator when `lang === 'es'` and `.` otherwise;
whole numbers and non-numeric text are returned unchanged. Used by `formatValue`, `formatReason`
and the `rangeError` message. Input parsing is unchanged (comma or dot accepted, sent as a dot).

## Nurse-only button (`RecordReadingButton`)

Shared Button with the `Activity` icon (decorative, `aria-hidden`), text
`recordReading.button`, navigates to `/patients/<code>/readings/new`; renders nothing for other
roles. Mounted with one line on `PatientDetailPage` (`<RecordReadingButton identifier={identifier} />`),
which US-05 keeps.

## Texts (translations.js, es default / en)

| Key | es | en |
|---|---|---|
| `recordReading.button` | Registrar signos vitales | Record vital signs |
| `recordReading.title` | Registrar signos vitales · {code} | Record vital signs · {code} |
| `recordReading.submit` | Guardar lectura | Save reading |
| `recordReading.nursesOnly` | Solo el personal de enfermería puede registrar signos vitales. | Only nurses can record vital signs. |
| `recordReading.backToPatient` | Volver al paciente | Back to the patient |
| `recordReading.required` | Campo obligatorio. | Required field. |
| `recordReading.wholeNumber` | Escribe un número entero. | Enter a whole number. |
| `recordReading.oneDecimal` | Escribe un número con máximo un decimal. | Enter a number with at most one decimal. |
| `recordReading.valueRejected` | Valor no aceptado. Revisa el dato. | Value not accepted. Check it. |
| `recordReading.errorInvalid` | Algunos datos no son válidos. Revisa el formulario. | Some data is not valid. Check the form. |
| `recordReading.errorNotFound` | No se encontró el paciente. | Patient not found. |
| `recordReading.errorDischarged` | El paciente está dado de alta; no se pueden registrar lecturas. | The patient is discharged; readings cannot be recorded. |
| `recordReading.errorFailed` | No se pudo guardar la lectura. Inténtalo de nuevo. | The reading could not be saved. Try again. |
| `recordReading.resultTitle` | Lectura guardada | Reading saved |
| `recordReading.score` | Puntaje NEWS2 | NEWS2 score |
| `recordReading.band` | Banda de riesgo | Risk band |
| `recordReading.points` | Puntos | Points |
| `recordReading.value` | Valor | Value |
| `recordReading.reason` | Motivo | Reason |
| `recordReading.another` | Registrar otra lectura | Record another reading |
| `parameter.respiratory_rate` | Frecuencia respiratoria (resp/min) | Respiratory rate (breaths/min) |
| `parameter.spo2` | Saturación de oxígeno SpO2 (%) | Oxygen saturation SpO2 (%) |
| `parameter.on_oxygen` | Oxígeno suplementario | Supplemental oxygen |
| `parameter.systolic_bp` | Presión arterial sistólica (mmHg) | Systolic blood pressure (mmHg) |
| `parameter.heart_rate` | Frecuencia cardiaca (lpm) | Heart rate (bpm) |
| `parameter.consciousness` | Nivel de conciencia (ACVPU) | Level of consciousness (ACVPU) |
| `parameter.temperature` | Temperatura (°C) | Temperature (°C) |
| `yesNo.true` / `yesNo.false` | Sí / No | Yes / No |
| `consciousness.A` … `U` | Alerta · Confusión nueva · Responde a la voz · Responde al dolor · No responde | Alert · New confusion · Responds to voice · Responds to pain · Unresponsive |
| `riskBand.low` … `high` | Baja · Baja-media · Media · Alta | Low · Low-medium · Medium · High |
| `riskBand.unknown` (CR 2026-11-20) | Desconocida | Unknown |
| `recordReading.rangeError` (CR) | Debe estar entre {min} y {max} {unit}. | Must be between {min} and {max} {unit}. |
| `recordReading.decimalsError` (CR) | Usa máximo un decimal. | Use at most one decimal. |
| `recordReading.allowedError` (CR) | Elige uno de: {values}. | Choose one of: {values}. |
| `unit.respiratory_rate` (CR) | resp/min | breaths/min |
| `unit.spo2` (CR) | % | % |
| `unit.systolic_bp` (CR) | mmHg | mmHg |
| `unit.heart_rate` (CR) | lpm | bpm |
| `unit.temperature` (CR) | °C | °C |

Switching language re-renders all texts; typed values and the shown result stay (component
state). New terms go into `docs/GLOSSARY.md` in the same PR.
