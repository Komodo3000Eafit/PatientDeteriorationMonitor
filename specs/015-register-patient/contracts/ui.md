# Contract: Registration page and button (US-01)

## Route

| Address | Element | Access |
|---|---|---|
| `/patients/new` | `RegisterPatientPage` | Inside the `<RequireAuth>` group in `App.jsx`. Signed out → `/login` (existing guard). Ranks above `/patients/:identifier` (D-45) |

After a 201 the page navigates to `/patients/<identifier>` (push, so Back returns to the list via the form).

## Page states

| State | Shown |
|---|---|
| Signed in, role `nurse` | `h1` + `Card` with the form (below) |
| Signed in, any other role | `h1` + `Card` with `registerPatient.nursesOnly` and a `Link` to `/patients` (`nav.backToPatients`); no form |
| Saving | Submit `Button` disabled, label `registerPatient.submitting` |
| Save failed | Form kept as typed; one `role="alert"` message (table below); submit usable again |

## Form (nothing pre-filled or pre-selected)

| Field | Control | Client check (before sending) | Sent as |
|---|---|---|---|
| Name | text input, `maxLength` 100, hint linked by `aria-describedby` | required after trimming | `name` (trimmed) |
| Age | `type="number"`, `min` 0, `max` 130, `step` 1 | required; whole number 0–130 | `age` (number) |
| Sex | radio group (`fieldset`/`legend`): female / male / other | one chosen | `sex` |
| Triage level | radio group of five tiles (below), legend + hint | one chosen | `triage_level` (number) |

No patient code field, no time field. Each invalid field shows its message next to it
(`aria-invalid`, `aria-describedby`); the request is not sent.

### Layout (top to bottom, every field full width)

1. Name, with its hint.
2. Age.
3. Sex.
4. Triage level tiles.
5. Submit button "Registrar" / "Register", full width: the same width as the fields above it, aligned with their left and right edges.

### Triage level tiles

- One `fieldset` with `legend` `registerPatient.triageLevel`, then the hint `registerPatient.triageHint` ("El nivel asignado en el triage ya realizado."). No severity line.
- Five native `<input type="radio" name="triage_level">` tiles, always in **one row of five equal columns**, in severity order 1 → 5 (Triage I left, Triage V right; no wrapping). Nothing checked on open; arrow keys move between them; visible focus ring.
- Each tile: background `--color-triage-N-soft`, border `--color-triage-N`, text `--color-text` showing only `triageLevel.N` ("Triage I" … "Triage V"), once, centered. No separate Roman numeral. Never color alone, never white text on a solid color (D-43).
- Selected tile: thicker border (still `--color-triage-N`) and a decorative `lucide-react` check icon (`aria-hidden`, `focusable="false"`, `currentColor`).

| Level | Color | `--color-triage-N` (border/icon) | `--color-triage-N-soft` (background) |
|---|---|---|---|
| 1 Triage I | red | `#DC2626` | `#FEE2E2` |
| 2 Triage II | orange | `#C2410C` | `#FFEDD5` |
| 3 Triage III | yellow | `#A16207` | `#FEF9C3` |
| 4 Triage IV | green | `#15803D` | `#DCFCE7` |
| 5 Triage V | blue | `#1D4ED8` | `#DBEAFE` |

Contrast (checked 2026-11-20 against `--color-text` `#1E293B` and white): dark text on soft 11.98–13.62:1 (≥ 4.5 required); solid on white 4.83–6.70:1 (≥ 3 required). The contrast guard test covers these pairs.

## Error mapping (status from `ApiError`, never the server text)

| Answer | Message key |
|---|---|
| 422 | `registerPatient.errorInvalid` |
| 409 | `registerPatient.errorConflict` |
| 403 | `registerPatient.nursesOnly` |
| 401 | existing session-expiry handling (client clears the session; guard sends to `/login`) |
| other status, network error, timeout | `registerPatient.errorFailed` |

## Nurse-only button

`RegisterPatientButton` (in `pages/register-patient/`), mounted once in `PatientListPage.jsx`.
Renders nothing unless `useAuth().user.role === 'nurse'`; otherwise a shared `Button` with the
decorative `lucide-react` `UserPlus` icon and `registerPatient.button`, navigating to `/patients/new`.

## Texts (`frontend/src/i18n/translations.js`)

| Key | es (default) | en |
|---|---|---|
| `registerPatient.button` | Registrar paciente | Register patient |
| `registerPatient.title` | Registrar paciente | Register patient |
| `registerPatient.name` | Nombre | Name |
| `registerPatient.nameHint` | No uses datos reales. | Do not use real data. |
| `registerPatient.age` | Edad (años) | Age (years) |
| `registerPatient.sex` | Sexo | Sex |
| `sex.female` | Femenino | Female |
| `sex.male` | Masculino | Male |
| `sex.other` | Otro | Other |
| `registerPatient.triageLevel` | Nivel de triage | Triage level |
| `registerPatient.triageHint` | El nivel asignado en el triage ya realizado. | The level assigned at the triage already done. |
| `registerPatient.submit` | Registrar | Register |
| `registerPatient.submitting` | Registrando… | Registering… |
| `registerPatient.required` | Este campo es obligatorio. | This field is required. |
| `registerPatient.ageInvalid` | Escribe una edad entera entre 0 y 130. | Enter a whole age from 0 to 130. |
| `registerPatient.errorInvalid` | Revisa los datos del formulario. | Check the form data. |
| `registerPatient.errorConflict` | No se pudo asignar un código de paciente. Inténtalo de nuevo. | Could not assign a patient code. Try again. |
| `registerPatient.errorFailed` | No se pudo registrar el paciente. Inténtalo de nuevo. | Could not register the patient. Try again. |
| `registerPatient.nursesOnly` | Solo el personal de enfermería puede registrar pacientes. | Only nurses can register patients. |

Switching language re-renders texts only; typed values are kept (component state, not keyed by language).
