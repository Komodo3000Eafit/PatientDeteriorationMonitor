# Contract: AlertAcknowledgement component (US-07)

**File**: `frontend/src/pages/patient-detail/AlertAcknowledgement.jsx` + `AlertAcknowledgement.module.css`

**Props**: `identifier` (patient code).

**Mount**: one line on `PatientDetailPage.jsx`, directly below the US-04 retriage `<section>` and above `<DeteriorationPrediction …/>`: `<AlertAcknowledgement identifier={identifier} />` (plus its import). `RecordReadingButton`, the retriage section and `DeteriorationPrediction` are unchanged.

**Data**: `apiGet(\`/api/patients/${identifier}/alerts/acknowledgement\`)` on mount and when `identifier` changes, and again after a 409. `apiPost(\`/api/patients/${identifier}/alerts/${alert.id}/seen\`)` on click (no body). Role from `useAuth()` (`user.role`). No polling.

## States

| State | Shown |
|---|---|
| Before the first successful answer (loading) | nothing |
| `alert: null` | nothing |
| `state: not_seen`, nurse | `Card` with title `alertAck.title` and a `Button` `alertAck.markSeen` ("Marcar como visto") |
| `state: not_seen`, doctor | nothing |
| `state: seen` (everyone) | `Card` with `EyeIcon` (lucide-react, `aria-hidden`) and `alertAck.seenBy` ("Visto por {name}, {time}") |
| `state: handled`, `by` set (everyone) | `Card` with `CircleCheckIcon` (lucide-react, `aria-hidden`) and `alertAck.handledBy` ("Atendida por {name}, {time}") |
| `state: handled`, `by` null | same icon, `alertAck.handled` ("Atendida") |
| GET 404 | nothing (the page shows its own not-found card) |
| GET 5xx, network error, timeout | short note `alertAck.loadError` (never raw server text) |
| 401 (GET or POST) | nothing from the component; re-thrown so the client's `onUnauthorized` handler clears the session and redirects |

`{time}` = `new Date(at).toLocaleString(lang)` (clinician's local time, current language).

## Click flow (nurse)

1. Button disabled while the POST runs (no double submit).
2. 200 → the answer replaces the state (shows "Visto por {own name}, {time}") with no page reload.
3. 409 → `role="alert"` message `alertAck.alreadyHandled`, then the GET runs again and the reloaded state is shown under the message.
4. 5xx, network error, timeout → `role="alert"` message `alertAck.markError`; the button is enabled again.

State is kept as data and translation keys, so switching language re-renders without a new request.

## Translations (`i18n/translations.js`)

| Key | es (default) | en |
|---|---|---|
| `alertAck.title` | Seguimiento de la sugerencia | Suggestion follow-up |
| `alertAck.markSeen` | Marcar como visto | Mark as seen |
| `alertAck.seenBy` | Visto por {name}, {time} | Seen by {name}, {time} |
| `alertAck.handledBy` | Atendida por {name}, {time} | Handled by {name}, {time} |
| `alertAck.handled` | Atendida | Handled |
| `alertAck.alreadyHandled` | Esta sugerencia ya fue vista o atendida. | This suggestion was already seen or handled. |
| `alertAck.loadError` | No se pudo cargar el seguimiento de la sugerencia. | Could not load the suggestion follow-up. |
| `alertAck.markError` | No se pudo marcar como visto. Intente de nuevo. | Could not mark as seen. Please try again. |

## Styling

CSS Module only; tokens only (no raw colors). `seen` line: `--color-primary-soft` background tint and `--color-primary` icon; `handled` line: `--color-stable` icon and border tint; text stays `--color-text`. Reuse `Card` and `Button` (primary variant, 44 px target). No new token; raw-color and contrast guard tests must keep passing.

## Test fake backend (`frontend/src/testing/fakeBackend.js`)

New optional `alertAck` option of `stubBackend`, matched by `/^\/api\/patients\/[^/]+\/alerts\//` (both the GET and the POST), tested before the bare patient path. When not given, those paths answer 404 as before, so the mounted component renders nothing and existing page tests pass unchanged.
