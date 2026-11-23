# Research: Deterioration Prediction (US-08)

No open NEEDS CLARIFICATION items: the three open points were resolved in the spec's Clarifications (2026-11-23). This file records the design decisions.

## R1 — Compute on read, store nothing

- **Decision**: compute the prediction inside the GET request from stored scores; write nothing.
- **Rationale**: the rule compares three numbers; storing it would need a table or an alert row. An `alerts` row would be listed by US-04's `GET /api/patients/{identifier}/suggestions` and `GET /api/suggestions` (they list every alert row) and appear as a false re-triage suggestion. Computing on read also needs no hook in `record_reading()` (US-03) and no migration (Principle XII).
- **Alternatives rejected**: an `alerts` row with a new kind (US-04 lists it; changing US-04 queries breaks Principle III); a new table (migration, "for later" design); a hook in `record_reading()` (changes US-03 code).

## R2 — Rule in a pure module

- **Decision**: `app/prediction.py` holds `is_rising(totals: list[int]) -> bool` (True only for exactly 3 values with t1 < t2 < t3) and `predict(readings) -> (rising, reason)` that applies the reason precedence (R4). No SQLAlchemy, FastAPI or scoring import.
- **Rationale**: unit tests run without a database; one place states the rule (FR-002). The rule never looks at the band (Clarifications).
- **Note**: the word "news2" must not appear anywhere in these files, including comments and docstrings (`test_news2_confined` scans file text). Use "NEWS score" wording only where the glossary allows it, or simply "stored score total".

## R3 — One query, outer join from readings

- **Decision**: select the patient's 3 most recent `vital_signs` rows with a **LEFT OUTER JOIN** to `reading_scores` on `reading_scores.vital_sign_id = vital_signs.id`, ordered `vital_signs.recorded_at DESC, vital_signs.id DESC`, `LIMIT 3`; columns `recorded_at`, `reading_scores.total`, `reading_scores.band`. Reverse in Python to oldest first.
- **Rationale**: the readings define the order (FR-003); an outer join keeps a reading without a stored score in the window so the `missing_score` case (spec edge case, D-50 deploy note) is visible instead of silently using an older reading. An inner join would skip it and change which 3 readings count.
- **Alternatives rejected**: inner join from `reading_scores` (hides missing scores); loading all readings (unneeded).

## R4 — Response reason codes

- **Decision**: `reason` is `null` when `rising` is true; otherwise one of, in this precedence: `not_enough_readings` (fewer than 3 readings), `missing_score` (any of the 3 has no stored score), `not_rising` (3 scores, not strictly increasing).
- **Rationale**: a fixed, language-neutral code lets the frontend pick a translated message; no human sentence comes from the backend (same approach as US-04 CR2).

## R5 — Reuse existing pieces

- **Decision**: `find_patient` from `app.patients` (404 "Patient not found" for unknown or malformed code), `get_current_user` from `app.auth` (401), `get_session` from `app.patients`; on `SQLAlchemyError` roll back, log `type(exc).__name__` only and raise 503 "Service unavailable" (pattern of `retriage_api.py`). Frontend: `apiGet`/`ApiError` from `api/client.js`, `Card`, `RiskBandBadge` (from `pages/record-reading/`), `useLanguage`.
- **Rationale**: same behaviour and messages as earlier endpoints; no new code paths for auth or lookup.

## R6 — Frontend states and icon

- **Decision**: the component renders **nothing** until its first request succeeds (no cached clinical data, AC11); on success it shows one of: the warning card (`rising`), a short "no deterioration prediction" note (`not_rising`, `missing_score`), or an "at least 3 readings are needed" note (`not_enough_readings`). On 5xx/network/timeout it shows a fixed translated error line; on 404 it renders nothing (the page already shows its own not-found card, so no second message); a 401 is re-thrown to the client's `onUnauthorized` handling, as in `PatientDetailPage.jsx`. Icon: `TrendingUpIcon` from `lucide-react` (already a dependency). Colors: existing `--color-warning` / `--color-warning-soft` tokens (warning color as border/icon tint only, text stays `--color-text`).
- **Rationale**: matches the US-04 suggestion card style without new tokens; color is never the only cue (icon + title text).
- **Placement**: mounted just below the US-04 retriage section on `PatientDetailPage`, outside the `view === loaded` gate (it manages its own visibility, like `RetriageSuggestion`). The page's own structure is otherwise unchanged.

## R7 — Decision record

- **Decision**: D-55 in `docs/DECISIONS.md` records: compute on read, no alert row and no migration, strictly increasing rule, band-independent, same answer for discharged patients. D-53 is claimed by open branches 022 and 026, and D-54 is kept free for that renumbering.
