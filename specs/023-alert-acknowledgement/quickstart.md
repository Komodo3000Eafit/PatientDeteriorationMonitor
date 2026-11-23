# Quickstart: Alert Acknowledgement (US-07)

Validation guide. API details: [contracts/alert-ack-api.md](contracts/alert-ack-api.md); UI: [contracts/ui.md](contracts/ui.md); states: [data-model.md](data-model.md).

## Prerequisites

- Backend dev setup and test database as in earlier stories (`backend/`, `DATABASE_URL` for tests).
- Frontend: `cd frontend && npm ci`.
- Demo users seeded (doctor and nurse).

## Automated checks

```bash
cd backend && pytest                                   # all tests, including the new ones
cd backend && pytest tests/test_alert_ack_api.py tests/test_retriage_api.py
cd frontend && npm test && npm run build && npm audit --audit-level=high
```

Expected new coverage:

| Test file | Cases |
|---|---|
| `backend/tests/test_alert_ack_api.py` | **POST**: 200 nurse marks an open, unseen alert (person + time stored, `status` still `open`, answer `state: seen`, `by` = nurse full name); 401 no token; 403 doctor (message "Only nurses can mark alerts as seen"); 403 before 404 (doctor + unknown patient); 404 unknown and malformed patient code; 404 unknown alert id; 404 alert of another patient; 409 already seen (stored person and time unchanged, second nurse); 409 acknowledged alert; nothing else changes (triage level, triage-event count, alert count, `severity`/`message`/`created_at`); discharged patient behaves the same; 503 on a database error (logged by type). **US-04 interaction**: after a seen marker the suggestion is still listed as open and a doctor's accept and dismiss both succeed and replace the person and time with the doctor's. **GET**: no alert → `{"alert": null}`; open not seen; open seen; acknowledged (handled, doctor name); newest open alert shown before a newer acknowledged one; newest alert when none is open; tie on `created_at` broken by id; 401; 404; 503; response keys exactly `alert` and `id, status, state, by, at`, with no user id, username or machine tag in the body |
| `frontend/.../AlertAcknowledgement.test.jsx` | nothing while loading; nothing on 404; nothing for `alert: null`; nurse sees the button for `not_seen`; doctor sees nothing for `not_seen`; seen line and handled line (icon + text, name, local time); handled without a person; click → POST once, button disabled while pending, seen line without reload; 409 → "already handled" message and a second GET; 5xx/network/timeout → error line, rest of page still renders; Spanish default and English after the switch |
| existing tests that use `frontend/src/testing/fakeBackend.js`, `PatientDetailPage.test.jsx`, `RetriageSuggestion.test.jsx`, `DeteriorationPrediction.test.jsx`, raw-color and contrast guards | still pass unchanged |

## Manual check

1. Start the backend and frontend. Give a patient an open re-triage suggestion (record readings that move the risk band up, as in US-04).
2. Sign in as the **doctor**, open the patient → no "Marcar como visto" button; the US-04 suggestion shows Accept / Dismiss.
3. Sign in as the **nurse**, open the patient → "Marcar como visto"; click → "Visto por <nurse name>, <time>" without a reload. Click is not offered again.
4. In a second nurse session that still shows the button, click → "already handled" message and the reloaded "Visto por <first nurse>" line.
5. Sign in as the doctor → "Visto por <nurse>" is shown; the suggestion is still open; Accept or Dismiss → reload → "Atendida por <doctor name>, <time>"; the triage level changed only on Accept (US-04).
6. Switch to English → "Seen by …" / "Handled by …"; values stay.
7. `curl` the POST as the doctor → 403; the GET without a token → 401; with `PAT-999999` → 404.
