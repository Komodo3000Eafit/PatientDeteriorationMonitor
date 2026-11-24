# Research: Alert Acknowledgement (US-07)

No open NEEDS CLARIFICATION items: the meaning (option B) came with the spec input, and the four plan-input decisions are recorded in the spec's Clarifications (2026-11-23). This file records the design decisions.

## R1 — "Seen" marker in the existing columns (option B)

- **Decision**: marking as seen sets `alerts.acknowledged_by_id = <nurse id>` and `alerts.acknowledged_at = now()` and leaves `alerts.status = 'open'`. "Seen" = `status = 'open'` with a stored person; "handled" = `status = 'acknowledged'`.
- **Rationale**: every alert row is a re-triage suggestion that only a doctor may accept or dismiss (D-51). US-04 decides "open" only from `status` (`retriage_api.py` checks `alert.status == "acknowledged"`; the lists filter on `status == 'open'`) and never reads `acknowledged_by_id`, so the marker never hides or blocks a suggestion. No migration (Principle XII).
- **Accepted consequence**: US-04 `accept_suggestion` / `dismiss_suggestion` set both columns to the doctor and the time of the action, so the nurse's marker is overwritten when the doctor handles the alert. Accepted and recorded in D-56 (Clarifications 2026-11-23).
- **Alternatives rejected**: a new `seen_by_id` / `seen_at` pair or a `alert_views` table (migration, history nobody asked for); letting the nurse set `status = 'acknowledged'` (removes the suggestion from the doctor's view without a decision, breaks D-51).

## R2 — Local nurse check

- **Decision**: `alert_ack_api.py` defines its own dependency `require_nurse_marker(user = Depends(get_current_user))` that raises `HTTPException(403, "Only nurses can mark alerts as seen")` when `user.role != "nurse"`. Doctors get 403 (Clarifications).
- **Rationale**: `patients.require_nurse` answers "Only nurses can register patients", which is wrong here, and `patients.py` must not change. Same pattern as `readings_api.require_nurse_recorder`.
- **Check order**: FastAPI runs the dependency (401 from `get_current_user`, then 403) before the route body (404, 409), giving 401 → 403 → 404 → 409 → 200 (AC7).

## R3 — First nurse wins: one conditional UPDATE

- **Decision**: inside the POST, after `find_patient` and loading the alert by `id` **and** `patient_id` (404 `"Alert not found"` otherwise), run one statement:
  `UPDATE alerts SET acknowledged_by_id = :nurse, acknowledged_at = :now WHERE id = :id AND patient_id = :pid AND status = 'open' AND acknowledged_by_id IS NULL`.
  The update is scoped by alert id **and** `patient_id` (defence in depth on top of the 404 lookup), so an alert id of another patient can never be marked through this patient's path.
  `rowcount == 0` → roll back, 409 `"Alert already handled"`; otherwise commit.
- **Rationale**: the condition and the write are one step (FR-004). In PostgreSQL (READ COMMITTED) a second concurrent `UPDATE` waits on the row lock, re-checks the `WHERE` after the first commits, and matches 0 rows. No `SELECT … FOR UPDATE`, no extra locking code.
- **Alternatives rejected**: read-check-then-assign on the ORM object (two nurses could both pass the check); a unique constraint (migration).

## R4 — Shown alert: one query, open first, joined to users

- **Decision**: the GET (and the POST's answer) use one query:
  `SELECT alerts.id, alerts.status, alerts.acknowledged_at, users.full_name FROM alerts LEFT OUTER JOIN users ON users.id = alerts.acknowledged_by_id WHERE alerts.patient_id = :pid ORDER BY (alerts.status = 'open') DESC, alerts.created_at DESC, alerts.id DESC LIMIT 1` (in SQLAlchemy: `case((Alert.status == "open", 0), else_=1)` ascending).
- **Rationale**: the shown alert is the newest open alert, else the newest alert (Clarifications); one query, same pattern as US-08's single joined read. The outer join keeps an alert with no stored person.
- **Derived `state`**: `"handled"` when `status = 'acknowledged'`; `"seen"` when `status = 'open'` and a person is stored; `"not_seen"` otherwise. `by` = `users.full_name` or null; `at` = `acknowledged_at` or null.

## R5 — Response shape

- **Decision**: both routes answer `{"alert": null}` (no alert) or `{"alert": {"id", "status", "state", "by", "at"}}`. The POST returns the same shape for the shown alert after the commit (re-running the R4 query), so the frontend uses one renderer for both answers.
- **Rationale**: the alert `id` is needed for the POST path (US-04 already exposes alert ids); no `acknowledged_by_id`, username, `patient_id`, `severity` or `message` (so no machine tag can leak). A language-neutral `state` code lets the frontend pick the translation (same idea as US-08 `reason`).

## R6 — Reuse existing pieces

- **Decision**: `find_patient` and `get_session` from `app.patients`, `get_current_user` from `app.auth`; on `SQLAlchemyError` roll back, log `type(exc).__name__` only, raise 503 `"Service unavailable"` (pattern of `prediction_api.py` / `retriage_api.py`). Frontend: `apiGet`/`apiPost`/`ApiError` from `api/client.js`, `useAuth` for the role (as `RetriageSuggestion.jsx`), `Card`, `Button`, `useLanguage`; time shown with `new Date(at).toLocaleString(lang)` (as `PatientDetailPage.jsx`).
- **Discharged patients**: no status check, the same behaviour for every patient (the marker is not clinical).

## R7 — Frontend states and icons

- **Decision**: nothing until the first successful GET; `alert: null` → nothing; `not_seen` → nurse sees `Button` "Marcar como visto", doctor sees nothing; `seen` → `EyeIcon` + "Visto por {name}, {time}"; `handled` → `CircleCheckIcon` + "Atendida por {name}, {time}" (or "Atendida" when `by` is null). Icons from `lucide-react` (already a dependency), `aria-hidden`; text always present so color is never the only cue. Colors: existing `--color-primary-soft` / `--color-stable` tokens (tint and border only; text stays `--color-text`). No new token.
- **Click**: button disabled while the POST runs; 200 → render the answer (no reload); 409 → fixed `alertAck.alreadyHandled` message, then GET again; 5xx/network/timeout → fixed `alertAck.markError`; 401 re-thrown to the client's `onUnauthorized` handling.
- **Placement**: mounted directly below the US-04 retriage `<section>` and above `DeteriorationPrediction` on `PatientDetailPage`, outside the `view === loaded` gate (it manages its own visibility, like its neighbours).

## R8 — Decision record

- **Decision**: D-56 in `docs/DECISIONS.md` records: US-07 = nurse "seen" marker in `acknowledged_by_id` / `acknowledged_at` with `status` kept `open`; first nurse wins; doctors cannot mark (403); the shown alert is the newest open, else newest; the doctor's US-04 accept/dismiss overwrites the marker (accepted); no migration. D-53 is claimed by open branches 022 and 026, D-54 is kept for that renumbering, D-55 is US-08.
