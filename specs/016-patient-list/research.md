# Research: Patient List (US-02)

No `NEEDS CLARIFICATION` items remain after `/speckit-clarify` (session 2026-11-21). Each entry
records a design choice in the format Decision / Rationale / Alternatives.

## R1. Where the endpoint lives

- **Decision**: a new module `backend/app/patient_list.py` with its own `APIRouter` and
  `GET /patients`, mounted in `main.py` with `prefix="/api"` next to the other routers (before
  the static-serving block, D-44). It imports `get_session` from `app.patients` and
  `get_current_user` from `app.auth` without changing them.
- **Rationale**: `app/patients.py` was introduced by US-01; constitution v1.3.0 Principle III
  (D-51) allows importing it but not modifying it. A separate router on the same path is valid
  (FastAPI matches method + path), and keeps US-02's code in a file it owns.
- **Alternatives**: add the GET to `patients.py` (modifies US-01 code); put the query in
  `readings_api.py` (US-03 code, same problem).

## R2. One query for the whole list (latest stored score per patient)

- **Decision**: one `SELECT` built with SQLAlchemy Core/ORM:
  1. a subquery `ranked` over `vital_signs` JOIN `reading_scores` (on `vital_sign_id`) with
     `row_number() OVER (PARTITION BY vital_signs.patient_id ORDER BY vital_signs.recorded_at DESC,
     vital_signs.id DESC) AS rn`, selecting `patient_id`, `recorded_at`, `total`, `band`;
  2. the outer query: `patients` LEFT OUTER JOIN `ranked` ON `ranked.patient_id = patients.id AND
     ranked.rn = 1`, WHERE `patients.status = 'active'`;
  3. ORDER BY `(ranked.total IS NULL)` ASC, `ranked.total` DESC, `patients.triage_level` ASC,
     `patients.identifier` ASC.
- **Rationale**: window functions work the same on PostgreSQL (Neon) and SQLite ≥ 3.25 (tests), so
  one statement gives the latest reading per patient, patients without readings, and the AC3 order
  server-side. `vital_signs.id DESC` breaks equal `recorded_at` by the most recently saved reading
  (spec edge case). `IS NULL` first-key puts no-reading patients last on both databases (no
  dialect-specific `NULLS LAST`). The score is read from `reading_scores`, never recomputed (D-50).
- **Alternatives**: one query per patient or `GET .../readings?limit=1` per patient (N+1, rejected
  by the spec); a correlated `MAX(recorded_at)` subquery (ties need a second tie-break and the SQL
  gets longer); sorting in Python (works, but the spec asks for the order "computed on the server"
  and one query; SQL ORDER BY is equally simple).
- **Test technique**: count statements with a SQLAlchemy `before_cursor_execute` event listener on
  the test engine while calling the endpoint with 0, 1 and several patients → exactly 1.

## R3. Response shape

- **Decision**: `200 {"patients": [ {identifier, name, age, sex, triage_level, admitted_at,
  latest_score: {recorded_at, total, band} | null}, … ]}`. `recorded_at`/`admitted_at` as ISO 8601
  (same serialization as the readings contract); `total` integer; `band` one of the four risk bands
  as stored. No `id`, `patient_id`, `vital_sign_id` or score id; no `system` or `entries` (not needed
  by the list; US-05 reads the full reading).
- **Rationale**: same object-with-list style as `GET …/readings` (`{"readings": […]}`); field names
  reused from the readings contract (D-51 allows reusing merged contracts).
- **Errors**: 401 (TS-06 `get_current_user`), 503 "Service unavailable" when `DATABASE_URL` is unset
  (`get_session`) or a database error occurs (logged by error type only, like US-01/US-03).

## R4. Ordering rule placement (Principle V)

- **Decision**: the order uses only the stored `total` and the clinician's `triage_level`; it
  contains no NEWS2 thresholds or band rules, so it does not belong in the scoring module.
- **Rationale**: Principle V forbids NEWS2-specific rules outside `app.scoring`; "higher score first"
  is a generic numeric order valid for any scoring system.

## R5. Frontend page structure

- **Decision**:
  - `PatientListPage.jsx` (TS-13 placeholder, body replaced as PROJECT_STATUS asks): keeps `h1`,
    `<RegisterPatientButton />` (unchanged line, US-01) and the health `<section role="status">`
    unchanged; the placeholder `<p>` inside the `Card` is replaced by `<PatientTable />`.
  - New files in `pages/patient-list/`: `PatientTable.jsx` (+ `.module.css`) renders loading /
    first-load error / empty / table + last-update line + refresh-error alert;
    `usePatientList.js` holds the fetch-and-refresh logic; `formatTime.js` the time text.
  - `RiskBandBadge` imported from `../record-reading/RiskBandBadge.jsx` (not moved or changed, D-51).
- **Rationale**: the page file stays small and the health block untouched (AC14); the hook is
  testable with fake timers; all new code lives in files US-02 owns.

## R6. Refresh logic

- **Decision**: `usePatientList()`:
  - on mount: request `apiGet('/api/patients')` (existing client: token, 10 s timeout, 401 →
    session-expiry handler);
  - after each request finishes (success or failure) schedule the next with `setTimeout(15000)`, so
    requests never overlap and the interval counts from the end of the previous one;
  - `document.visibilitychange`: when hidden, clear the timer (no request while hidden); when
    visible, request at once (if none is in flight) and restart the timer;
  - on unmount: clear the timer, remove the listener, ignore late answers.
  - state: `{ patients | null, lastUpdated | null, status: 'loading' | 'ok' | 'error' }`; a failed
    refresh keeps `patients` and `lastUpdated` and sets `refreshFailed = true` until the next success.
- **Rationale**: chained `setTimeout` is the simplest way to guarantee no overlap; the Page
  Visibility API is standard and a few lines. No polling library (Principle XII).
- **Alternatives**: `setInterval` (can overlap a slow request); React Query / SWR (new dependency).

## R7. Time text

- **Decision**: `formatTime.js` exports `formatSince(date, now, lang)` → e.g. "hace 3 min (14:32)" /
  "3 min ago (14:32)", using `Intl.RelativeTimeFormat(lang, { style: 'short', numeric: 'always' })`
  for the relative part (seconds under 1 min, minutes under 1 h, hours under 24 h, then days) and
  `Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' })` for the clock time, adding
  `day: 'numeric', month: 'short'` when the date is not today. Used for the latest reading and for
  "Actualizado: …" / "Updated: …". Recomputed on every redraw (at least every refresh).
- **Rationale**: built into browsers and jsdom/Node, both languages, no dependency; tests pass a
  fixed `now` and check the exact text.

## R8. Triage level cell

- **Decision**: a small `<span>` in `PatientTable.module.css` per level using the D-48 tokens
  (`--color-triage-N-soft` background, `--color-triage-N` border, `--color-text` text) with the
  `triageLevel.N` label ("Triage I" … "Triage V").
- **Rationale**: D-48 says the tokens are available to US-02/US-05; `TriageLevelBadge` stays
  unchanged (spec Out of Scope). Contrast pairs are already covered by `contrast.test.js`.

## R9. Table and link

- **Decision** (updated after `/speckit-analyze` I1): a real `<table>` named with
  `aria-label={t('patients.title')}` and no `<caption>`, so "Pacientes" appears only once (the Card
  heading) and text queries for it stay unique; `aria-labelledby` is not possible because the shared
  `Card` gives its heading no `id`, and `Card` is not changed. `<thead>`
  column headers (`scope="col"`), one `<tr>` per patient; the patient code cell holds
  `<Link to={'/patients/' + identifier}>`; the table sits in a wrapper with `overflow-x: auto`
  inside the Card. Score cell: the number + `<RiskBandBadge band={…} />`; no-reading rows show
  `patientList.noData` in the score and time cells.
- **Rationale**: clarified (table, code link); native table semantics for screen readers.

## R10. Existing tests that identify the page by the placeholder

- **Decision**: in `src/App.routes.test.jsx` (TS-13) and
  `src/pages/register-patient/RegisterPatientButton.test.jsx` (US-01), change only the constant
  `ES_LIST_PLACEHOLDER` (and its header comment) to the Card heading "Pacientes", which the page
  still shows; no assertion logic changes. Allowed by constitution v1.3.0 (D-51: "update a test
  assertion that depends only on placeholder content it replaces"). Those tests now also trigger
  `GET /api/patients`; with no `patients` stub the fake backend answers 404 and the table shows its
  first-load error, which does not affect their assertions (checked during implementation).
- Remove the `patients.placeholder` key from `translations.js` (es and en), since nothing uses it.
