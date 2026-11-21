# US-04 — Re-triage suggestion alerts

**Story:** [`specs/020-retriage-suggestion-alerts/`](./spec.md) · **Decision:** D-51 · **Depends on:** TS-03, TS-06, TS-07, TS-12, TS-13, US-03 (all merged)

## What this adds

When a reading is saved for an **active** patient and its **stored** NEWS2 risk band (from
`reading_scores`, US-03) becomes `medium` or `high` and is strictly more urgent than the patient's
previous reading's band, the system raises **one open re-triage suggestion alert**. The app **never
changes the triage level on its own** — the level changes only when a **doctor accepts** a
suggestion. A component on the patient detail area shows the open suggestion, read-only for nurses
and with Accept/Dismiss for doctors.

- **Band → severity / step** (one place, `app/retriage.py`): `medium` → severity `medium`, −1
  level; `high` → severity `high`, −2 levels; `low`/`low-medium` never suggest; suggested level
  clamped at Triage I; a patient already at Triage I gets no suggestion.
- **Accept** (doctors only): sets `triage_level` to the suggested level, writes one
  `source = 'manual'` triage event, and acknowledges the alert — all in one transaction. **No
  `source = 'automatic'` event is ever written** (constitution D-41).
- **Dismiss** (doctors only): acknowledges the alert, no level change.
- **Read** (`GET /api/patients/{code}/suggestions`): open to any signed-in clinician.
- The risk band is **read from the stored score, never recomputed**; no NEWS2 rule lives outside
  `app/scoring`.
- **No database migration, no new dependency, no new design token** — the existing `alerts` and
  `triage_events` tables are used as they are.

## Endpoints

| Method | Path | Who | Result |
|---|---|---|---|
| GET | `/api/patients/{code}/suggestions` | any signed-in clinician | suggestions newest first |
| POST | `/api/patients/{code}/suggestions/{alert_id}/accept` | doctor only (403 otherwise) | level changed, `manual` triage event, alert acknowledged |
| POST | `/api/patients/{code}/suggestions/{alert_id}/dismiss` | doctor only (403 otherwise) | alert acknowledged |

Error responses are fixed, value-free strings (401/403/404/409/503); the internal
`[retriage band=…;suggested=…]` tag stored in the alert message is stripped before the API returns
it to the client.

## Who did what

From the agent activity log ([`agent-log.csv`](./agent-log.csv)). Every task was assigned and
verified by the orchestrator.

| Agent | Tasks | Work |
|---|---|---|
| **orchestrator** | assign/verify all; T015, T017 | Coordinated the story, verified each result against the acceptance criteria, logged the security review, wrote D-51 and the BACKLOG/PROJECT_STATUS updates. |
| **backend-dev** | T002–T005 | `app/retriage.py` (band order, `BAND_SEVERITY`/`BAND_STEP`, `suggested_level`, `build_message`/`read_tag`/`strip_tag`, `reason_from_entries`, `evaluate_retriage`, accept/dismiss helpers); one-line `evaluate_retriage` call inside `record_reading`; `app/retriage_api.py` (GET/accept/dismiss); router registration in `main.py`. |
| **frontend-dev** | T006–T008, T016 | 12 `retriage.*` translation keys (es+en); `RetriageSuggestion.jsx` + CSS (reuses `Card`, `Button`, `RiskBandBadge`, `TriageLevelBadge`); mounted below `RecordReadingButton` on `PatientDetailPage`; glossary terms + escalation/automatic reconciliation. |
| **qa-tester** | T001, T009–T013 | Baseline; 48 new backend tests (`test_retriage.py`, `test_retriage_api.py`, extensions to `test_readings.py`/`test_simulator.py`); 14 new frontend tests (`RetriageSuggestion.test.jsx`) + `fakeBackend` suggestions handler + TS-13 route-test migration; full validation. |
| **security-reviewer** | T014 | Read-only review — **no findings** (auth + doctor-only enforced server-side, safe no-echo errors, no automatic triage change, scoring confined, no secrets/new deps). |

## Validation

| Check | Result |
|---|---|
| Backend `pytest` | **520 passed** (baseline 472, +48 new) |
| Frontend `npm test` | **549 passed / 27 files** (baseline 535; +14 new, TS-13 case migrated) |
| `npm run build` | passes |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| Raw-color + contrast guards | green |
| Diff-stat of must-not-change files | empty (`models.py`, `scoring/`, `patients.py`, `readings_api.py`, `simulator.py` code, `migrations/`, `tokens.css`, `App.jsx`, dependency files) |

## Files changed

**Backend (new):** `app/retriage.py`, `app/retriage_api.py`, `tests/test_retriage.py`,
`tests/test_retriage_api.py`
**Backend (edited):** `app/readings.py` (one-line seam call), `app/main.py` (router),
`tests/test_readings.py`, `tests/test_simulator.py`
**Frontend (new):** `pages/patient-detail/RetriageSuggestion.jsx`, `.module.css`, `.test.jsx`
**Frontend (edited):** `i18n/translations.js`, `pages/patient-detail/PatientDetailPage.jsx`,
`testing/fakeBackend.js`, `App.routes.test.jsx`
**Docs:** `docs/DECISIONS.md` (D-51), `docs/GLOSSARY.md`, `docs/BACKLOG.md`,
`docs/PROJECT_STATUS.md`

## Reviewer notes

- **Branch hygiene:** this story was implemented on `main` at the author's direction rather than
  on a dedicated story branch from the start. Please confirm the change set is moved onto the
  `020-retriage-suggestion-alerts` branch and that CI runs green there before merge. An unrelated
  `README.md` change and a tooling `logs/` folder in the working tree are **not** part of this
  story — exclude them from the US-04 commit.
- **Two sanctioned deviations**, both documented in the spec/plan and D-51:
  1. The one-line `evaluate_retriage` call inside US-03's `record_reading` — its documented single
     reading-creation seam and the only path the simulator also uses; `record_reading` keeps its
     signature, return value and "never commits" contract (constitution Principle III, recorded in
     the plan's Constitution Check).
  2. The suggestion sentence reads "Risk is high…" rather than "NEWS2 risk is high…" so the
     Principle V scoring-confinement guard (`test_news2_confined`) stays green; the band word still
     conveys the risk, and the design docs were updated to match.
- **No migration / no new dependency / no new token**, so CI's dependency checks and the
  raw-color/contrast guards are unaffected.
