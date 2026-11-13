# Implementation Plan: React App Skeleton

**Branch**: `004-react-app-skeleton` | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-react-app-skeleton/spec.md`

## Summary

TS-04 adds `frontend/`, a **Vite 8 + React 19** project in plain JavaScript, created from the official Vite React template and trimmed: no demo content, no linter (the template now ships Oxlint; the user chose no linter, research R1), no router, state library, UI kit or CSS framework. One start page (`App.jsx`) calls `GET /health` once through a shared API client (`src/api/client.js`: `fetch` + `AbortController`, 10 s timeout, base URL from `VITE_API_BASE_URL`, default `http://localhost:8000`) and shows one of four Spanish states. Tests use **Vitest 5 + jsdom + React Testing Library** with `fetch` mocked. On the backend, `app/main.py` adds FastAPI's `CORSMiddleware` with the origins from **`CORS_ORIGINS`** (parsed by a pure function; default `http://localhost:5173`; a `*` entry stops startup; `GET` only, no credentials), and `tests/test_cors.py` covers the rule. READMEs and DEVELOPMENT.md explain local setup; the manual browser check (AC11) is in the quickstart.

## Technical Context

**Language/Version**: JavaScript (ES modules) on Node.js 26 LTS for the frontend; Python 3.13 for the backend (unchanged)

**Primary Dependencies**: frontend — react 19.3.1, react-dom 19.3.1, vite 8.3.8, @vitejs/plugin-react 6.3.0; dev/test — vitest 5.1.0, jsdom 31.0.1, @testing-library/react 16.3.3, @testing-library/dom 10.4.2 (research R2). Backend — no new dependency (`CORSMiddleware` comes with FastAPI 0.162.4; python-dotenv 1.2.4 already loads `backend/.env`)

**Storage**: N/A (no database changes)

**Testing**: frontend — `npm test` = `vitest run`, jsdom, `fetch` stubbed with `vi.stubGlobal`, fake timers for the timeout; backend — pytest 9.2.0 + FastAPI `TestClient` with an `Origin` header, and a subprocess for the startup error (research R5, R7)

**Target Platform**: developer machines on Windows (PowerShell), modern desktop browsers; Azure Static Web Apps later (TS-11)

**Project Type**: web application (backend/ + frontend/)

**Performance Goals**: `/health` result or "unreachable" shown within 10 s (SC-002); frontend tests under 30 s (SC-003)

**Constraints**: backend address only in `src/api/client.js` (FR-004); no wildcard origin (FR-006); one `/health` call per load (D-30, research R4); offline tests; Smart App Control (D-31); npm + committed `package-lock.json`

**Scale/Scope**: 1 page, 1 API client module, 2 frontend test files, ~25 lines of backend code, 1 backend test file, 3 docs updated

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Check each principle of `.specify/memory/constitution.md`. Any unchecked item must be justified in Complexity Tracking.

- [x] I. Spec-driven and traceable: every file maps to an FR/AC (traceability table below); tests name the AC they verify
- [x] II. Small Scrum story: one story; one page, one client module, one backend change
- [x] III. Independence: depends only on TS-01 (and the merged TS-02 `database` field), as in docs/BACKLOG.md; changes only technical-story code (`backend/app/main.py`, `conftest.py`)
- [x] IV. Multi-agent: **frontend-dev** scaffolds `frontend/`, writes the API client, the page and `frontend/README.md`; **backend-dev** adds the CORS parsing and middleware and the `backend/README.md` section; **qa-tester** writes `App.test.jsx`, `client.test.js` and `test_cors.py`; **security-reviewer** reviews CORS, configuration and dependencies; **orchestrator** updates DEVELOPMENT.md, PROJECT_STATUS and BACKLOG and keeps `agent-log.csv`; devops is not needed. The manual browser check (quickstart 3–4) is done by the developer. Owners in tasks.md
- [x] V. Clinical logic: no scoring or alerts in this story
- [x] VI. Data privacy: no data; the two settings are not secrets; `.env` files git-ignored, only `frontend/.env.example` with a placeholder is committed
- [ ] VII. Tests: the API client, the page states and the CORS rule (a security control) have automated tests. **Exception**: CI and the dependency check don't exist until TS-09 (Complexity Tracking, D-27)
- [x] VIII. Security baseline: CORS restricted to configured origins, no wildcard, no credentials, `GET` only; configuration only from environment variables; the start page shows fixed messages, never raw errors. No clinical views yet, so no authentication needed (TS-06)
- [x] IX. Deployable at low cost: static build for Azure Static Web Apps (TS-11); no polling, so the page doesn't keep Neon awake
- [x] X. Stack: React frontend, FastAPI backend
- [ ] XI. Language: code and docs in English; UI in Spanish. **Exception**: the English switch is TS-05 (Complexity Tracking)
- [x] XII. Simplicity: official template, built-in `fetch`, no router / state / UI / CSS libraries, no linter, no jest-dom or MSW, no app factory or settings module on the backend

**Post-design re-check (after Phase 1)**: all items still pass; the two exceptions are unchanged. Removing `<StrictMode>` (research R4) keeps the "one call per load" rule without extra code.

## Project Structure

### Documentation (this feature)

```text
specs/004-react-app-skeleton/
├── spec.md
├── plan.md                  # This file
├── research.md              # Phase 0
├── data-model.md            # Phase 1: settings and page states
├── quickstart.md            # Phase 1: tests + manual browser check (AC11)
├── contracts/
│   ├── health-ui.md         # Phase 1: API client exports, page states and texts
│   └── cors-config.md       # Phase 1: CORS_ORIGINS parsing, behaviour, startup error
├── checklists/
│   └── requirements.md
└── tasks.md                 # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
frontend/                        # NEW (from create-vite 9.3.4 template-react, trimmed)
├── .gitignore                   # from the template's _gitignore: node_modules, dist, *.local, editor files
├── .env.example                 # VITE_API_BASE_URL=http://localhost:8000 (placeholder only)
├── index.html                   # lang="es", <title>Monitor de Deterioro del Paciente</title>
├── package.json                 # scripts: dev, build, preview, test ("vitest run"); no lint script, no oxlint
├── package-lock.json            # committed, exact versions
├── vite.config.js               # react() plugin + test: { environment: 'jsdom', setupFiles }
├── README.md                    # replaces the template README
└── src/
    ├── main.jsx                 # createRoot(...).render(<App />), no StrictMode (research R4)
    ├── App.jsx                  # start page: one getHealth() call, four states
    ├── App.css                  # minimal plain CSS (template's index.css merged or removed)
    ├── App.test.jsx             # AC2–AC4, AC8: the /health states incl. timeout
    ├── setupTests.js            # afterEach(cleanup)
    └── api/
        ├── client.js            # API_BASE_URL, REQUEST_TIMEOUT_MS, apiGet, getHealth
        └── client.test.js       # AC5: default base URL, URL used by getHealth

backend/
├── app/
│   └── main.py                  # CHANGED: parse_cors_origins() + CORSMiddleware
├── tests/
│   ├── conftest.py              # CHANGED: os.environ["CORS_ORIGINS"] = "" before importing the app (research R7)
│   └── test_cors.py             # NEW: AC6, AC7, AC9
└── README.md                    # CHANGED: "Allowed frontend origins (CORS)" section

DEVELOPMENT.md                   # CHANGED: frontend prerequisites, running backend + frontend together, link to frontend/README.md
docs/PROJECT_STATUS.md           # CHANGED: TS-04 done
docs/BACKLOG.md                  # CHANGED: TS-04 spec link and status
docs/DECISIONS.md                # CHANGED: D-33 frontend stack (Vite 8 + React, JS, Vitest, no linter, no StrictMode) and CORS_ORIGINS rules
```

**Structure Decision**: the web-application layout the project already uses (`backend/` + `frontend/`). The frontend keeps the Vite template's flat `src/` with one `api/` folder for the shared client; tests sit next to the files they test (Vitest default), so no separate `tests/` folder. The backend change stays in `app/main.py`, where the app is created.

### Design notes

- **App.jsx**: `const [state, setState] = useState({ kind: 'checking' })`; `useEffect(() => { let cancelled = false; getHealth().then(h => !cancelled && setState({ kind: h.database === 'ok' ? 'ok' : 'databaseUnavailable', version: h.version }), () => !cancelled && setState({ kind: 'unreachable' })); return () => { cancelled = true } }, [])`. Texts exactly as [contracts/health-ui.md](contracts/health-ui.md). Status lines in an element with `role="status"` so screen readers announce the change.
- **client.js**: see [contracts/health-ui.md](contracts/health-ui.md); `setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)` cleared in `finally`.
- **vite.config.js**: `import { defineConfig } from 'vitest/config'` so one file configures both Vite and Vitest; `server.port` left at Vite's default 5173 (with `strictPort: true`, so a busy port fails loudly instead of moving to 5174, which would not be an allowed origin).
- **main.py**: `DEFAULT_CORS_ORIGINS = ["http://localhost:5173"]`; `parse_cors_origins()` as in [contracts/cors-config.md](contracts/cors-config.md); middleware added right after `app = FastAPI(...)`. `/health` is not changed (FR-007).
- **Tests reference ACs** in their docstrings / test names, as in earlier stories.

### Traceability

| Requirement / AC | Delivered by |
|---|---|
| FR-001, AC1 | `frontend/` scaffold, `package.json` scripts, `package-lock.json`; quickstart 1–2 |
| FR-002, AC2, AC3 | `App.jsx`; `App.test.jsx` ok and database-unavailable tests; quickstart 3 |
| FR-003, AC4, SC-002 | `client.js` timeout and checks; `App.test.jsx` network error, non-200, bad body, timeout; quickstart 4 |
| FR-004, AC5, SC-004 | `client.js` only place with the URL; `.env.example`; `client.test.js` |
| FR-005, AC6, AC7 | `parse_cors_origins` + `CORSMiddleware` in `main.py`; `test_cors.py`; quickstart 5 |
| FR-006, SC-005 | `*` → `ValueError`; `allow_credentials=False`; `test_cors.py` subprocess test; quickstart 6 |
| FR-007 | `/health` unchanged; existing `test_health.py` still passes |
| FR-008, AC8, SC-003 | `App.test.jsx`, `client.test.js` with stubbed `fetch`; quickstart 2 |
| FR-009, AC9 | `test_cors.py`, `conftest.py`; quickstart 2 |
| FR-010, AC10, SC-001 | `frontend/README.md`, `backend/README.md` CORS section, `DEVELOPMENT.md`, quickstart, `docs/PROJECT_STATUS.md` |
| FR-011 | `.env.example` placeholder only; `.env` ignored by the root `.gitignore` (`.env`, `.env.*`, `!.env.example`) |
| FR-012 | trimmed template; no extra libraries (research R1, R2) |
| AC11 | manual check: quickstart 3–4, recorded in the PR |
| Edge cases (slow Neon, bad answer, unknown `database`, missing frontend setting, blank/`*`/spaces/trailing slash in `CORS_ORIGINS`, reload) | 10 s timeout > backend 5 s limits; `getHealth` checks; `database !== 'ok'` → not available; client default; `parse_cors_origins`; one call per load (no StrictMode) |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle VII and Workflow step 5 require tests and a dependency check to run in CI before merge, but CI doesn't exist until TS-09 | TS-01 to TS-08 must be merged before the CI pipeline story | Same as TS-01 to TS-03: until TS-09 is merged, the PR includes the local `npm test` and `python -m pytest` output, and the dependency vulnerability check (now also `npm audit`) is done by TS-09 (DECISIONS D-27) |
| Principle XI requires an English switch, but this story's UI is Spanish only | The backlog puts the language switch and translations in TS-05, which depends on this story | Adding i18n here would merge two stories and make TS-04 too large for one live session (Principle II) |
