# Feature Specification: Deterioration Prediction

**Feature Branch**: `024-deterioration-prediction`

**Created**: 2026-11-23

**Status**: Draft

**Input**: User description: "Create US-08. Spec must be #24 (feature directory 024-deterioration-prediction; pass -Number 24). US-08 (functional, team session): As a doctor, I want a deterioration prediction warning when the NEWS2 score rises across the last 3 readings, so that I can act before the risk band crosses the re-triage threshold. Depends on US-03 (stored scores in reading_scores); also TS-06 (auth), TS-12 (UI), TS-13 (routing), US-05 (patient detail page). Carry-over notes: the deterioration prediction is a simple rule, no machine learning (D-25, glossary term "deterioration prediction"; avoid "worsening trend" and "trend rule"); the rule reads the stored reading_scores.total of the patient's 3 most recent readings (recorded_at desc, then vital_signs.id desc) and never recomputes NEWS2; NEWS2 stays only in app/scoring/news2.py and other code imports only from app.scoring; with fewer than 3 readings there is no prediction. Compute on read: a new read-only endpoint under /api in its own module (for example GET /api/patients/{identifier}/prediction), registered with one include_router line, any signed-in clinician, 401 / 404 (find_patient) / 503 "Service unavailable" (logged by error type only), no internal ids. Do NOT write to the alerts table: US-04's suggestion endpoints list every alert row, so a US-08 row would appear as a false re-triage suggestion; no migration, no hook in record_reading(), no change to US-03 (readings.py, readings_api.py) or US-04 (retriage.py, retriage_api.py, RetriageSuggestion.jsx) code (Principle III); must not depend on US-07 (acknowledge). The prediction never changes the triage level and never creates a triage event (D-41). Frontend: a small warning component in its own file mounted with one line on PatientDetailPage; keep RecordReadingButton and the US-04 retriage section; no cached clinical data shown before the first API call succeeds; reuse Card/StatusBadge/RiskBandBadge and tokens only (CSS Modules, raw-color and contrast tests must pass, color never the only signal); any new icon from lucide-react; Spanish by default with an English switch; glossary terms. Open points for clarify: whether "rises" means strictly increasing (t1 < t2 < t3) or last > first; whether the warning shows when the latest band is already medium or high; whether discharged patients get a prediction. Decision number: D-55 (D-53 is already claimed by two open branches, 022 and 026, and D-54 is kept free for that renumbering)."

## Clarifications

### Session 2026-11-23

- Q: When should the app say "a deterioration is predicted": each of the last 3 scores higher than the one before (t1 < t2 < t3), or newest above oldest (t3 > t1)? → A: Strictly increasing, t1 < t2 < t3 (equal steps such as 2, 2, 5 do not predict).
- Q: Should the warning still show when the newest risk band is already `medium` or `high`? → A: Yes, the warning shows whatever the newest band is; the band is shown as a badge next to it, and the rule never looks at the band.
- Q: Should a discharged patient still get a deterioration prediction? → A: Yes, the same read-only answer for every patient whatever their status (no status check), like US-04's read of suggestions.

## User Story *(mandatory)*

**Story ID**: US-08

**Type**: Functional (team session)

**Story**: As a doctor, I want a deterioration prediction warning when the NEWS2 score rises across the last 3 readings, so that I can act before the risk band crosses the re-triage threshold.

**Depends on**: US-03 (stored scores: `reading_scores`), merged. Also TS-06 (authentication), TS-12 (UI foundation), TS-13 (client routing) and US-05 (patient detail page), all merged. It does **not** depend on US-04 (re-triage suggestions) or US-07 (acknowledge alerts), and no other team-session story depends on it (constitution Principle III, D-26).

### Acceptance Criteria

<!-- Each criterion must be testable. qa-tester writes at least one test per criterion. -->

1. **AC1 — Rising score gives a deterioration prediction**: **Given** a patient whose 3 most recent stored readings (ordered by `recorded_at`, newest first, then by reading id, newest first) have NEWS2 scores that rise from the oldest to the newest of the three (the rule in FR-002), **When** a signed-in clinician asks for that patient's deterioration prediction, **Then** the answer says a deterioration is predicted and returns the three scores (oldest to newest) with the risk band of the newest reading, all read from the stored scores.
2. **AC2 — Score not rising gives no prediction**: **Given** a patient with at least 3 readings whose 3 most recent stored scores do not rise under the rule (for example `3, 3, 3`, `5, 4, 6` or `6, 4, 2`), **When** the prediction is asked for, **Then** the answer says no deterioration is predicted and still returns the three scores and the newest risk band.
3. **AC3 — Fewer than 3 readings gives no prediction**: **Given** a patient with 0, 1 or 2 stored readings, **When** the prediction is asked for, **Then** the answer says no deterioration is predicted and that there are not enough readings, and returns only the scores that exist (none for 0 readings); it is never an error.
4. **AC4 — Only the 3 most recent readings count**: **Given** a patient with more than 3 readings, **When** the prediction is asked for, **Then** only the 3 most recent readings (FR-003 ordering) are used; older readings never change the answer, and two readings with the same `recorded_at` are ordered by reading id.
5. **AC5 — NEWS2 is never recomputed**: **Given** any prediction, **When** it is computed, **Then** it uses only the stored NEWS2 score and risk band of each reading (US-03) and never recalculates NEWS2 from the vital signs; the prediction code does not import the NEWS2 rules.
6. **AC6 — The prediction never changes the triage level and stores nothing**: **Given** a deterioration is predicted, **When** the prediction is read (any number of times), **Then** the patient's triage level is unchanged, no triage event is created, no alert is stored and nothing else is written; in particular no re-triage suggestion appears in the US-04 views because of the prediction.
7. **AC7 — Who may read it**: **Given** a request for a patient's deterioration prediction, **When** it is sent signed out, **Then** the answer is 401; **When** it is sent by any signed-in clinician (doctor or nurse), **Then** it is allowed.
8. **AC8 — Unknown patient and safe errors**: **Given** a request for a prediction, **When** the patient code is unknown or not in the patient code format, **Then** the answer is 404 with the existing fixed message; **When** the database is unavailable, **Then** the answer is 503 "Service unavailable" and the problem is logged by error type only; no answer contains internal ids, stack traces or database details.
9. **AC9 — Warning shown on the patient detail page**: **Given** a signed-in clinician on a patient's detail page, **When** a deterioration is predicted, **Then** a warning card is shown with a `lucide-react` icon, a text title naming the deterioration prediction, the three NEWS2 scores in order (oldest to newest) and the newest risk band as a `RiskBandBadge`; color is never the only cue (icon and text are always shown).
10. **AC10 — No warning when nothing is predicted**: **Given** the patient detail page, **When** no deterioration is predicted, **Then** the component shows a short translated "no deterioration prediction" message; **When** there are fewer than 3 readings, **Then** it shows a translated "at least 3 readings are needed" message; neither is shown as a warning or an error.
11. **AC11 — Loading and failure**: **Given** the patient detail page, **When** the prediction has not loaded yet, **Then** no prediction, score or band is shown (no cached clinical data before the first successful answer); **When** the request fails with 5xx, network failure or timeout, **Then** a fixed translated error message is shown (never raw server text), and on 404 the component shows nothing (the page shows its own not-found card) and the rest of the page, including the record-reading button and the re-triage suggestion section, keeps working; on 401 the existing session-expiry handling applies.
12. **AC12 — Spanish by default, English switch**: **Given** the prediction component, **When** the language is Spanish (default) or English, **Then** every title, message and band label is in that language from the translations file using glossary terms, and switching language does not clear what is shown.
13. **AC13 — Styling and tokens**: **Given** the prediction component, **When** it is shown, **Then** it uses CSS Modules and design tokens only (no raw colors outside `tokens.css`), reuses Card and RiskBandBadge (and StatusBadge where a status chip is needed), any new icon comes from `lucide-react` (D-46), and the existing raw-color and contrast guard tests keep passing.

### Out of Scope

- Storing the prediction anywhere: no alert row, no new table or column, no migration, no stored history of predictions.
- Changing the triage level, creating a triage event, or raising a re-triage suggestion from the prediction (that is US-04's band-crossing rule; the doctor decides, D-41).
- Acknowledging or dismissing the prediction warning (US-07 handles alert acknowledgement; this warning has nothing to acknowledge because it is computed on read).
- Showing the prediction on the patient list page, in charts (US-06) or in notifications outside the app.
- Machine learning, statistical models, slopes or thresholds on the size of the rise (D-25: a simple rule).
- Any change to US-03 code (`readings.py`, `readings_api.py`, `record_reading`) or US-04 code (`retriage.py`, `retriage_api.py`, `RetriageSuggestion.jsx`).
- Live refresh of the warning after a new reading is saved on the same page; the prediction is loaded when the detail page is shown.

### Edge Cases

- **Exactly 3 readings**: the rule applies to those 3.
- **Equal scores** (for example `2, 2, 3`): not strictly increasing, so no deterioration is predicted (FR-002).
- **Newest band already `medium` or `high`**: the prediction is still computed and the warning shown, with the band as a badge (FR-002); the US-04 suggestion section is independent of it.
- **Discharged patient**: the prediction is answered the same way as for an active patient, read-only (FR-001).
- **A reading with no stored score** (a reading saved before scoring existed, D-50 deploy note): it is still one of the readings by order, but with a missing score the rule cannot say the score rises, so no deterioration is predicted and the missing score is returned as empty; never an error.
- **Two readings with the same `recorded_at`**: ordered by reading id, newest first (FR-003).
- **Simulator saving readings quickly**: each request reads the current 3 most recent readings; nothing is cached or stored.
- **Session expires while the page is open**: the next request gets 401 and the existing session-expiry handling sends the clinician to the login page.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST offer a read-only operation that returns the deterioration prediction for one patient, identified by the patient code, computed on each request from stored data, with the same answer whatever the patient's status (`active` or `discharged`; Clarifications 2026-11-23). It MUST NOT write anything (no alert, triage event, score or other row).
- **FR-002**: The deterioration prediction rule MUST be: a deterioration is predicted when the patient has at least 3 stored readings and the stored NEWS2 scores of the 3 most recent readings, taken oldest to newest (t1, t2, t3), are **strictly increasing (t1 < t2 < t3)** (Clarifications 2026-11-23); any equal step or fall (for example `2, 2, 5` or `2, 5, 4`) does not predict. The rule MUST NOT depend on the risk band: a rising score predicts a deterioration whatever the newest band is, including `medium` and `high`. The rule MUST live in one small backend function so it can be unit tested, and the glossary entry "deterioration prediction" MUST state it.
- **FR-003**: The 3 most recent readings MUST be chosen by `recorded_at` descending, then reading id descending. Only those 3 readings are used.
- **FR-004**: With fewer than 3 readings, or when any of the 3 readings has no stored score, the system MUST answer that no deterioration is predicted (with a "not enough readings" indication when there are fewer than 3) and MUST NOT answer with an error.
- **FR-005**: The prediction MUST read only the stored score total and risk band of each reading (US-03 `reading_scores`) and MUST NOT recompute NEWS2; any scoring access MUST go only through `app.scoring`, and NEWS2 rules stay only in `app/scoring/news2.py`.
- **FR-006**: The answer MUST contain: whether a deterioration is predicted, whether there are enough readings, the scores used (oldest to newest) and the risk band of the newest reading (empty when there are no readings). It MUST NOT contain internal ids (patient id, reading id, user id) or vital-sign values.
- **FR-007**: The operation MUST require a signed-in user of any clinician role (401 otherwise), MUST answer 404 with the existing fixed message for an unknown patient code or one not in the patient code format (using the existing patient lookup), and MUST answer 503 "Service unavailable" when the database fails, logging only the error type.
- **FR-008**: The prediction MUST NOT change the patient's triage level, MUST NOT create a triage event and MUST NOT create an alert row (an alert row would be listed by US-04 as a false re-triage suggestion). This story MUST NOT add a database migration.
- **FR-009**: The backend operation MUST live in its own new module and be added to the app with a single registration line; US-03 and US-04 code MUST NOT change (constitution Principle III).
- **FR-010**: The app MUST provide a prediction component in its own file, mounted on the patient detail page with one line, next to the existing record-reading button and re-triage suggestion section (both kept unchanged). It MUST show: a warning card (Card, `lucide-react` icon, translated title, the three scores oldest to newest, newest band as `RiskBandBadge`) when a deterioration is predicted; a translated "no deterioration prediction" message when not; a translated "at least 3 readings are needed" message when there are fewer than 3 readings. The frontend MUST NOT compute a score, a band or the prediction; it only displays the answer.
- **FR-011**: Before the first successful answer the component MUST NOT show any prediction, score or band (no cached clinical data). On 5xx, network failure or timeout it MUST show a fixed translated error message (never raw server text) without breaking the rest of the page; on 404 it MUST render nothing; on 401 the existing session-expiry handling applies.
- **FR-012**: Every UI text MUST be Spanish by default and English with the language switch, from the translations file, using glossary terms ("deterioration prediction"; never "worsening trend" or "trend rule"). New terms MUST be added to `docs/GLOSSARY.md` in the same PR (D-40).
- **FR-013**: Styling MUST use CSS Modules and design tokens only (no raw colors outside `tokens.css`, no new token unless needed and contrast-checked), reuse Card and RiskBandBadge (StatusBadge only if a chip is needed), keep color off the only-cue path, use only `lucide-react` icons (D-46), and keep the raw-color and contrast guard tests passing.
- **FR-014**: Automated tests MUST cover: the rule (strictly rising predicts; flat, falling, mixed and equal-step cases such as `2, 2, 5` do not; a rising score with the newest band `high` still predicts; a discharged patient gets the same answer; fewer than 3 readings; a missing score); the ordering (more than 3 readings, equal `recorded_at` tie broken by id); that no row is written and the triage level is unchanged after a read; each API status (200, 401, 404, 503) and the absence of internal ids; and the component (warning view, no-prediction view, not-enough-readings view, loading shows no data, error message, both languages). All existing tests MUST pass, and `pytest`, `npm test`, `npm run build` and `npm audit --audit-level=high` MUST pass.
- **FR-015**: The decision to compute the deterioration prediction on read (no stored alert, no migration, no hook in reading saving) and the rule chosen MUST be recorded as **D-55** in `docs/DECISIONS.md`; `docs/BACKLOG.md` and `docs/PROJECT_STATUS.md` MUST show US-08 as done when the story is finished.

### Key Entities *(include if feature involves data)*

- **Stored score (read-only here)**: the `reading_scores` row of each reading (US-03), read for its `total` (NEWS2 score) and `band` (risk band); never recomputed.
- **Reading (read-only here)**: the `vital_signs` row of a patient, used only for its order (`recorded_at`, then id) to pick the 3 most recent.
- **Patient (read-only here)**: found by patient code; its triage level and status are never changed by this story.
- **Deterioration prediction (computed, not stored)**: the answer for one patient: predicted (yes/no), enough readings (yes/no), the scores used oldest to newest, and the newest risk band.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For 100% of patients with 3 most recent scores that rise under the rule, the detail page shows the deterioration prediction warning; for 100% of the others it does not.
- **SC-002**: A clinician opening a patient's detail page sees whether a deterioration is predicted, and the three scores behind it, without any extra action.
- **SC-003**: In 100% of prediction reads, nothing is stored and the triage level is unchanged; the US-04 suggestion views never show an entry caused by the prediction.
- **SC-004**: 100% of error answers carry a fixed, safe message with no internal id or stack trace, and the full backend and frontend suites (including the raw-color and contrast guards) pass in CI.

## Assumptions

- **Open points from the input** (all resolved in Clarifications 2026-11-23):
  1. ~~Meaning of "rises"~~ resolved: strictly increasing, t1 < t2 < t3 (Clarifications 2026-11-23).
  2. ~~Warning when the newest band is already `medium`/`high`~~ resolved: shown whatever the band is (Clarifications 2026-11-23), because the prediction and the US-04 suggestion answer different questions.
  3. ~~Discharged patients~~ resolved: they get the same read-only answer (Clarifications 2026-11-23).
- Computing on read is enough for the academic scope (constitution Principle XII): the data is small, the rule is a comparison of three numbers, and storing the prediction as an alert would make it appear as a false re-triage suggestion in US-04.
- The prediction is loaded when the patient detail page is shown; it does not refresh live after a reading is recorded on the same page (a page reload shows the new answer).
- The existing patient lookup (`find_patient`), auth dependency and "Service unavailable" 503 pattern from earlier stories are reused as they are.
- Existing tokens (for example the warning tokens) are enough for the warning card; no new token is expected.
