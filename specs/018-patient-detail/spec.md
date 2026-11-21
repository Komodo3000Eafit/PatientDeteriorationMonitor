# Feature Specification: Patient Detail Page

**Feature Branch**: `018-patient-detail`

**Created**: 2026-11-20

**Status**: Draft

**Input**: User description: "US-05 — As a doctor, I want a patient detail page with current vitals, NEWS2 score and triage history, so that I can review one patient at a glance. Depends on TS-03, TS-06, TS-12, TS-13 (all merged). Vertical, full-stack baseline functional story. Frontend: replace the body of the existing PatientDetailPage; read the patient code with useParams().identifier (validated by isPatientCode); keep the mounted <RecordReadingButton identifier={identifier} /> line; may reuse ReadingResult / formatReason. Show current vitals and the stored NEWS2 score with the reason per point; the patient's data (name, age, sex, current triage level, status, admitted_at); the triage history (previous level, new level, score, reason, source, time). Scoring: never recompute NEWS2; read the stored score via GET /api/patients/{identifier}/readings. Backend: adds read-only GET endpoints under /api for the single patient's data and the patient's triage history; all require authentication and validate input. The patient-data endpoint returns only the patient's own data plus the time of the most recent reading; it MUST NOT introduce or compute a monitoring_status traffic light (stable/warning/critical/no_data) — that is clinical logic for US-04 or a dedicated technical story (constitution Principle V). The page shows the already-stored NEWS2 risk band of the most recent reading (low / low-medium / medium / high) exactly as returned by GET /api/patients/{identifier}/readings. UI: reuse TriageLevelBadge, Card and Button; show the risk band as translated text or a neutral badge (NOT the StatusBadge component); pass triage_level through unchanged; show the time of the last reading, and a translated \"no readings yet\" state when there is none; new icons from lucide-react (decorative); all text through i18n (Spanish default, English switch). Independence: depends only on technical stories and US-03; must not depend on or modify US-02 (PatientListPage) or US-04. No page path starts with /api or equals /health."

## User Story *(mandatory)*

**Story ID**: US-05

**Type**: Functional (baseline)

**Story**: As a doctor, I want a patient detail page with current vitals, NEWS2 score and triage history, so that I can review one patient at a glance.

**Depends on**: TS-03 (tables and migrations), TS-06 (authentication), TS-12 (UI foundation), TS-13 (client routing), and the read side of US-03 (the readings endpoint and its stored score, `ReadingResult` / `formatReason`). All merged.

## Clarifications

### Session 2026-11-20

- Q: Should the new backend read endpoints be one combined patient-detail endpoint or two separate endpoints (patient data, triage history)? → A: Two separate endpoints — `GET /api/patients/{identifier}` for patient data and `GET /api/patients/{identifier}/triage-events` for the triage history.
- Q: Where should the "current vitals" and the "time of the most recent reading" come from on the frontend? → A: The current reading, its stored score/band and its `recorded_at` come from `GET /api/patients/{identifier}/readings?limit=1`; the patient-data endpoint independently returns the last-reading time for its own block.

### Acceptance Criteria

<!-- Each criterion must be testable. qa-tester writes at least one test per criterion. -->

1. **AC1 — Doctor views a patient with vitals, stored score and reason**: **Given** a signed-in clinician and a patient that has at least one reading, **When** they open the patient detail page for that patient code, **Then** they see the patient's current (most recent) reading — the seven vital signs — together with the **stored** NEWS2 score (its system, total and risk band) and the reason for each point (the per-parameter explanation entries), all read from storage and never recomputed.

2. **AC2 — Patient data block**: **Given** the patient detail page for an existing patient, **When** it loads, **Then** it shows the patient's data: name, age, sex, current triage level (as a `TriageLevelBadge`, "Triage I"–"Triage V"), status and `admitted_at`, using `triage_level` from the API unchanged. The page MUST NOT show or compute a monitoring_status traffic light.

3. **AC3 — Triage history newest-first**: **Given** a patient with one or more triage events, **When** the detail page loads, **Then** it shows the triage history as a list ordered newest-first (most recent `occurred_at` first), each entry showing the previous level, the new level, the NEWS2 score (when present), the reason, the source (`initial` / `automatic` / `manual`) and the time it occurred.

4. **AC4 — Risk band of the most recent reading**: **Given** a patient that has at least one reading, **When** the detail page loads, **Then** it shows the stored NEWS2 risk band of the most recent reading (one of `low` / `low-medium` / `medium` / `high`) exactly as returned by `GET /api/patients/{identifier}/readings`, rendered as translated text or a neutral badge (never the `StatusBadge` component), together with the time of that reading. The page MUST NOT map the band to a stable/warning/critical traffic light.

5. **AC5 — No readings shows a "no readings yet" state**: **Given** a patient that has no readings (for example a just-registered patient), **When** the detail page loads, **Then** the vitals/score block shows a translated "no readings yet" state — no risk band, no fabricated last-reading time, and no `no_data` traffic-light badge; the patient data block and the triage history (which always has at least the initial event) still render.

6. **AC6 — Unknown or invalid patient code handled gracefully**: **Given** the patient detail page, **When** the patient code in the address does not match the patient-code format (`isPatientCode` is false), **Then** the not-found page is shown and no backend call is made; **When** the code is well-formed but no such patient exists (the API answers 404), **Then** the page shows a translated "patient not found" message with a link back to the patient list, not a raw error and not a crash.

7. **AC7 — Unauthenticated access is rejected and redirected to login**: **Given** the patient detail route is inside the protected route group, **When** a signed-out visitor opens it, **Then** they are redirected to the login page (existing `<RequireAuth>` behavior); **and** the new backend GET endpoints answer 401 when called without a valid token and store/return nothing.

8. **AC8 — Backend patient-data endpoint**: **Given** a signed-in clinician, **When** they request the new patient-data endpoint for an existing patient code, **Then** the response contains only the patient's own data (code, name, age, sex, current triage level, status, `admitted_at`) and the time of the most recent reading (empty when there is none); it MUST NOT return or compute a `monitoring_status`; the internal `id` is never returned; an unknown or badly-formatted code answers 404 with a fixed, safe message; a signed-out caller answers 401.

9. **AC9 — Backend triage-history endpoint**: **Given** a signed-in clinician, **When** they request the new triage-history endpoint for an existing patient code, **Then** the response is the patient's triage events newest-first, each with `occurred_at`, `previous_level`, `new_level`, `score`, `reason` and `source`; the internal `id` and `patient_id` are never returned; an unknown or badly-formatted code answers 404; a signed-out caller answers 401; a patient with no events returns an empty list (though a registered patient always has the initial event).

10. **AC10 — Current vitals come from the stored reading**: **Given** a patient with several readings, **When** the detail page shows "current vitals", **Then** it uses the most recent reading obtained from `GET /api/patients/{identifier}/readings?limit=1` (newest `recorded_at`, then later-saved first) and its stored score/band; the temperature is shown from the one-decimal string without recomputation.

11. **AC11 — Spanish by default, English switch**: **Given** the patient detail page in any of its states (with data, no readings, not found), **When** the language is Spanish (default) or English, **Then** every label, heading, triage-level text, risk-band text, reason text and message is shown in that language using glossary terms, dates and numbers are formatted for that language, and switching language does not reload or lose the loaded data.

12. **AC12 — Record-reading button kept, page owns only its own files**: **Given** the detail page, **When** it renders, **Then** the mounted `<RecordReadingButton identifier={identifier} />` line is kept; this story replaces only the body of `PatientDetailPage` and adds its own backend endpoints and frontend files; it does not modify `PatientListPage` (US-02) or any US-04 code.

### Out of Scope

- The patient list content and its ordering/filtering (US-02, US-09); this story only links back to `/patients`.
- Re-triage suggestion alerts and acknowledging alerts (US-04, US-07); the triage history is shown read-only.
- A chart of the vitals history over time (US-06); this story shows the current reading and the triage-event list, not a time-series chart.
- The deterioration-prediction warning (US-08) and CSV export (US-10).
- Entering a new reading or editing/discharging the patient; the record-reading flow is the existing `<RecordReadingButton>` only.
- Recomputing NEWS2 anywhere; the score is always read from storage (US-03 contract).
- Any database migration or new table; the `patients`, `vital_signs`, `reading_scores` and `triage_events` tables already exist.
- Pagination controls for the triage history; it is shown in full (the list is small for an academic demo).

### Edge Cases

- **Just-registered patient (no readings)**: the vitals/score block shows the translated "no readings yet" state (no risk band, no last-reading time); the triage history still shows the initial event; nothing is fabricated.
- **Invalid code in the address** (does not match `isPatientCode`): the not-found page is shown with no backend call (same as the current placeholder behavior).
- **Well-formed code with no such patient** (API 404): a translated "patient not found" message with a link back to the patient list.
- **Session expires while viewing** (a GET returns 401): the existing session-expiry handling sends the clinician to the login page.
- **Backend unavailable** (503) or a network/timeout failure: the page shows a fixed, translated "could not load" message with a way to retry or go back, never the raw server text.
- **Many triage events**: the list is shown newest-first in full; an academic patient has few events.
- **Discharged patient**: the detail page still loads and shows the data (its `status` reflects `discharged`) and the triage history; readings are still shown read-only.
- **Temperature as a one-decimal string** (e.g. `"37.0"`): shown as received, formatted per language, not parsed and re-rounded.
- **Triage event with an empty `previous_level`** (the initial event): shown as "no previous level" / "—", not as `0` or blank-crashing.
- **Triage event with no `score`** (initial or manual event without a reading): the score column shows a translated "no score" rather than `0`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a read-only operation (`GET /api/patients/{identifier}`) that returns one patient's data by patient code for any signed-in user: patient code, name, age, sex, current triage level, status, `admitted_at` and the time of the most recent reading (empty when the patient has no reading). It MUST NOT return or compute a `monitoring_status`. The internal `id` MUST NOT be returned.
- **FR-002**: The system MUST provide a separate read-only operation (`GET /api/patients/{identifier}/triage-events`) that returns one patient's triage history by patient code for any signed-in user: the triage events newest-first (most recent `occurred_at` first), each with `occurred_at`, `previous_level`, `new_level`, `score`, `reason` and `source`. The internal `id` and `patient_id` MUST NOT be returned. Patient data (FR-001) and triage history are two separate endpoints, not one combined response.
- **FR-003**: Both new endpoints MUST require authentication (`Depends(get_current_user)`): a missing/invalid/expired token MUST answer 401 with the existing shape; neither requires a specific role (doctors and nurses may both view).
- **FR-004**: Both new endpoints MUST validate the patient code: a code not matching the patient-code format (`^[A-Z0-9-]{1,20}$`) MUST answer 404 without a database query, and an unknown but well-formed code MUST answer 404, both with a fixed, safe message (e.g. "Patient not found"). When the database is unavailable they MUST answer 503 with a fixed message, logged by error type only; submitted values MUST never be echoed.
- **FR-005**: This story MUST NOT introduce or compute a `monitoring_status` (the stable/warning/critical/no_data traffic light); that clinical logic belongs to US-04 or a dedicated technical story (constitution Principle V) and is out of scope here. The page MUST instead show the already-stored NEWS2 risk band of the most recent reading (one of `low`, `low-medium`, `medium`, `high`) exactly as returned by the readings endpoint, and MUST NOT map the band to a traffic-light status or recompute NEWS2.
- **FR-006**: The NEWS2 score and risk band shown on the page MUST be read from storage through the existing readings endpoint, called as `GET /api/patients/{identifier}/readings?limit=1` for the most recent reading, using the field names in `specs/017-vital-signs-scoring/contracts/readings-api.md`. NEWS2 MUST NOT be recomputed anywhere in this story.
- **FR-007**: The app MUST replace the body of the existing `/patients/:identifier` page (`PatientDetailPage`), reading the patient code with `useParams().identifier`. When `isPatientCode(identifier)` is false it MUST show the not-found page and make no backend call. No page path introduced or changed by this story may start with `/api` or equal `/health`.
- **FR-008**: The detail page MUST keep the mounted `<RecordReadingButton identifier={identifier} />` line. It MAY reuse `ReadingResult` and `formatReason` from the record-reading feature to render the current reading, its score and the reason per point.
- **FR-009**: For a patient with at least one reading, the page MUST show the most recent reading (the seven vital signs), its stored NEWS2 score (system, total, risk band) and the reason for each point. Temperature MUST be shown from its one-decimal string, formatted per language, without re-rounding.
- **FR-010**: The page MUST show the patient data block (name, age, sex, current triage level as a `TriageLevelBadge`, status, `admitted_at`) using `triage_level` from the API unchanged. It MUST NOT show a monitoring_status traffic light.
- **FR-011**: For a patient with at least one reading, the page MUST show the stored NEWS2 risk band of the most recent reading (`low` / `low-medium` / `medium` / `high`) using the existing `RiskBandBadge` component (via the reused `ReadingResult`) — NOT the `StatusBadge` component, which is reserved for the future traffic light — together with the time of that reading. When the patient has no readings, the page MUST show a translated "no readings yet" state with no risk band and no fabricated time.
- **FR-012**: The page MUST show the triage history newest-first, each entry displaying the previous level (or a translated "no previous level" when empty), the new level, the NEWS2 score (or a translated "no score" when empty), the reason, the source and the time; all formatted for the current language.
- **FR-013**: For a patient with no readings, the vitals/score block MUST show a translated "no readings yet" state (no risk band, no last-reading time, no `no_data` traffic-light badge); the patient data block and the triage history MUST still render.
- **FR-014**: When the patient code is well-formed but the patient does not exist (API 404), the page MUST show a translated "patient not found" message with a link back to the patient list. On a 503, a network failure or a timeout, the page MUST show a fixed, translated "could not load" message (never the raw server text) and let the user retry or go back; on a 401 the existing session-expiry handling applies.
- **FR-015**: The detail route MUST stay inside the existing protected route group so a signed-out visitor is redirected to the login page.
- **FR-016**: All styling MUST use design tokens only (no raw colors outside `tokens.css`). The page MUST reuse the shared `TriageLevelBadge`, `Card` and `Button` components (TS-12); it MUST NOT reuse the `StatusBadge` component (reserved for the future monitoring-status traffic light). Any new icon MUST come from `lucide-react` (D-46) and be decorative (`aria-hidden`, `focusable="false"`, em-sized, `currentColor`). The existing raw-color and contrast guard tests MUST keep passing.
- **FR-017**: Every UI text in this story MUST be in Spanish by default and in English with the language switch, come from the translations file, and use glossary terms; any new UI text MUST be added to the glossary in the same pull request. Switching language MUST NOT reload or lose the loaded data.
- **FR-018**: This story MUST own only its own files plus the body of `PatientDetailPage` and the registration of its new backend endpoints. It MUST NOT modify `PatientListPage` (US-02) or any US-04 code, and MUST NOT depend on US-02 or US-04.
- **FR-019**: Automated tests MUST cover the new backend endpoints (success with and without readings, the patient-data endpoint returning no `monitoring_status`, 401 unauthenticated, 404 unknown and badly-formatted code, no internal `id`/`patient_id` returned, triage history newest-first, 503 when the database is unavailable) and the frontend states (with data showing the stored risk band, the "no readings yet" state, not-found, load error, both languages, the record-reading button kept).
- **FR-020**: When the story is finished, `docs/BACKLOG.md` and `docs/PROJECT_STATUS.md` MUST show US-05 as done, and any new decision MUST be recorded in `docs/DECISIONS.md` (for example: the two separate read endpoints `GET /api/patients/{identifier}` and `GET /api/patients/{identifier}/triage-events`, and that US-05 does not introduce a `monitoring_status` traffic light).

### Key Entities *(include if feature involves data)*

- **Patient** (existing `patients` table, unchanged): read-only source of name, age, sex, current triage level, status and `admitted_at`.
- **Reading** (existing `vital_signs` + `reading_scores`, unchanged): the most recent reading supplies the current vitals, the stored NEWS2 score, the risk band and the per-parameter reason; read through the existing readings endpoint.
- **Triage event** (existing `triage_events` table, unchanged): the triage history entries (previous level, new level, score, reason, source, time).
- **User** (existing): the signed-in clinician; any authenticated role (doctor or nurse) may view the detail page.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in doctor can see a patient's current vitals, stored NEWS2 score with the reason per point, patient data and triage history on one page, in a single load, in under 5 seconds.
- **SC-002**: 100% of the NEWS2 scores and risk bands shown match the stored values from the readings endpoint; 0 scores are recomputed by this story.
- **SC-003**: 100% of patients with no readings show the "no readings yet" state, with 0 fabricated last-reading times and 0 risk bands shown.
- **SC-004**: 100% of unauthenticated requests to the new endpoints are refused (401), and 100% of unknown or badly-formatted codes are refused (404) with a fixed, safe message that echoes no submitted value.
- **SC-005**: The triage history is shown newest-first in 100% of cases, with the initial event always present for a registered patient.
- **SC-006**: 100% of the page texts appear in Spanish by default and in English after switching; 0 raw colors are added (guard test passes).
- **SC-007**: All existing backend and frontend tests still pass, and every acceptance criterion has at least one automated test.

## Assumptions

- This story deliberately does NOT introduce a `monitoring_status` traffic light. The team decided (constitution Principle V) that the stable/warning/critical/no_data status is clinical logic that does not belong in a read-only detail page; it will be defined in US-04 or a dedicated technical story. The detail page shows only the already-stored NEWS2 risk band of the most recent reading.
- The risk band is shown with the existing `RiskBandBadge` component (via the reused `ReadingResult`), not with the `StatusBadge` component, which stays reserved for the future traffic light. The presentation is resolved in the plan (research R3): reusing `RiskBandBadge` is the simplest clear option and adds no new presentation code.
- "Current vitals" means the single most recent reading, obtained from `GET /api/patients/{identifier}/readings?limit=1` (newest `recorded_at` first, then later-saved first), not an aggregate. The last-reading time shown in the patient-data block comes independently from the patient-data endpoint (FR-001), so each endpoint is self-contained (clarified 2026-11-20).
- Both GET endpoints are open to any authenticated role (doctor and nurse), matching the readings GET; only writes are role-restricted elsewhere.
- The patient-data read is `GET /api/patients/{identifier}` and the triage-history read is `GET /api/patients/{identifier}/triage-events`: two separate endpoints (clarified 2026-11-20). Reusing `GET /api/patients/{identifier}/readings` for the current reading (instead of embedding readings in the new endpoint) keeps this story independent of changes to the readings contract.
- The triage-history entries are shown in full with no pagination; an academic patient has few events.
- The existing frontend API client, its `<RequireAuth>` protection and 401 session-expiry handling (TS-06, TS-13) are reused; the signed-in user's role comes from existing data (`GET /api/me`).
- Reusing `ReadingResult` and `formatReason` from the record-reading feature is treated as reading shared helpers, not as modifying another functional story (US-03 is a dependency, already merged).
- No migration is needed: the `patients`, `vital_signs`, `reading_scores` and `triage_events` tables already hold every field this story reads.
