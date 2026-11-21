# Contract: Re-triage Suggestion UI (US-04)

One component `RetriageSuggestion` mounted on the patient detail area with a single line
(`<RetriageSuggestion identifier={identifier} />`), so US-05 only keeps that line. Reuses `Card`,
`Button`, `RiskBandBadge` (US-03), `TriageLevelBadge` (TS-12), `useAuth`, `useLanguage`,
`apiGet`/`apiPost`, tokens only (D-43), icons from `lucide-react` only (D-46). The frontend never
computes a band, score, severity or suggested level — it shows what the API returns.

## Mounting (PatientDetailPage.jsx)

```jsx
<RecordReadingButton identifier={identifier} />   {/* existing, US-03 — keep */}
<RetriageSuggestion identifier={identifier} />    {/* new, US-04 */}
```

Inside the existing `<RequireAuth>` group (TS-13). No new route. The component fetches
`GET /api/patients/<code>/suggestions` and shows the newest **open** suggestion, if any.

## Roles and states

| Signed-in role | Open suggestion exists | Shows |
|---|---|---|
| `doctor` | yes | Card with band badge, current + suggested triage badges, severity, reason; **Accept** and **Dismiss** buttons |
| `nurse` | yes | Same Card, **read-only** (no action buttons) |
| any | no open suggestion | Translated `retriage.none` message, no buttons |
| any | load error / 503 | Translated `retriage.loadError`, no buttons |
| signed out | — | Redirect to `/login` (existing `<RequireAuth>`) |

## Open-suggestion Card contents

- Title `retriage.title`.
- `RiskBandBadge` for the raising band (same component/mapping as US-03; shows label + icon).
- Current triage level and suggested triage level as two `TriageLevelBadge`s, labelled
  `retriage.currentLevel` and `retriage.suggestedLevel`.
- The alert severity as a translated label (`retriage.severity.medium` / `.high`).
- The reason text from the API (`reason`), shown as given (already translated-safe vitals/points).
- Doctor only: two shared `Button`s, `retriage.accept` and `retriage.dismiss`.

## Actions (doctor)

| Action | Request | On success | On failure |
|---|---|---|---|
| Accept | `POST /api/patients/<code>/suggestions/<id>/accept` | Show `retriage.accepted` and the new current level | Keep the suggestion; show `retriage.actionError`; re-enable buttons |
| Dismiss | `POST /api/patients/<code>/suggestions/<id>/dismiss` | Show `retriage.dismissed` | Keep the suggestion; show `retriage.actionError`; re-enable buttons |

- Both buttons are **disabled while an action is in progress** (plus a synchronous guard against
  double submit), so an action cannot be sent twice (AC16).
- 404/409/5xx/network/timeout → `retriage.actionError` (fixed, translated; never raw server text);
  on 401 the existing session-expiry handling sends the user to `/login` (AC17).

## Translation keys (es + en), `i18n/translations.js`

| Key | Spanish | English |
|---|---|---|
| `retriage.title` | "Sugerencia de retriage" | "Re-triage suggestion" |
| `retriage.currentLevel` | "Nivel actual" | "Current level" |
| `retriage.suggestedLevel` | "Nivel sugerido" | "Suggested level" |
| `retriage.severity.medium` | "Severidad media" | "Medium severity" |
| `retriage.severity.high` | "Severidad alta" | "High severity" |
| `retriage.accept` | "Aceptar" | "Accept" |
| `retriage.dismiss` | "Descartar" | "Dismiss" |
| `retriage.accepted` | "Retriage aplicado." | "Re-triage applied." |
| `retriage.dismissed` | "Sugerencia descartada." | "Suggestion dismissed." |
| `retriage.none` | "No hay sugerencias de retriage abiertas." | "No open re-triage suggestions." |
| `retriage.loadError` | "No se pudieron cargar las sugerencias." | "Could not load suggestions." |
| `retriage.actionError` | "No se pudo completar la acción. Inténtalo de nuevo." | "The action could not be completed. Try again." |

Exact Spanish wording is confirmed with the glossary when the texts are added (FR-014); all terms
(re-triage suggestion, suggested triage level, Accept/Dismiss) are added to `docs/GLOSSARY.md` in
this PR. The reason text comes from the API and uses the glossary's parameter and points terms.

## Styling

Tokens only (no raw colors outside `tokens.css`); color is never the only cue (each badge keeps
its label and icon); any new icon is imported from `lucide-react`, decorative (`aria-hidden`,
`focusable="false"`, em-sized, `currentColor`). The existing `styles/noRawColors.test.js` and
`styles/contrast.test.js` keep passing (no new tokens are added — the band and triage tokens
already exist from US-03 and D-48).
