---

description: "Task list for TS-04 React app skeleton"
---

# Tasks: React App Skeleton

**Input**: Design documents from `specs/004-react-app-skeleton/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/health-ui.md](contracts/health-ui.md), [contracts/cors-config.md](contracts/cors-config.md), [quickstart.md](quickstart.md)

**Tests**: MANDATORY. The API client is the base every later screen uses, and the CORS rule is a security control (constitution Principle VII). AC2–AC5, AC8 get frontend tests and AC6, AC7, AC9 get backend tests, all without a running backend, `.env` file or network. AC1 is checked by running the commands; AC10 by review; AC11 by the manual browser check (spec Clarifications).

**Organization**: This feature has one story (TS-04), so all story tasks carry the `[TS-04]` label.

## Format: `[ID] [P?] [Story] Description (agent)`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **(agent)**: Owner agent, at the end of the line
- All paths are relative to the repository root; frontend commands run from `frontend/`, backend commands from `backend/` with the venv active (`.\.venv\Scripts\Activate.ps1`)
- Edit files with Edit/Write, not PowerShell (non-ASCII Spanish text, CLAUDE.md)
- **No agent may print, read aloud or copy the contents of `backend/.env` or the value of `DATABASE_URL`.**

---

## Phase 1: Setup

**Purpose**: Create the frontend project from the official template and trim it.

- [X] T001 From the repository root run `npm create vite@9.3.4 frontend -- --template react --no-interactive --no-immediate` (plain JavaScript template; don't start the dev server). Then in `frontend/`: delete `src/assets/`, `public/icons.svg`, `_oxlintrc.json` / `.oxlintrc.json` (whichever exists) and the template `README.md`; if the template left `_gitignore`, rename it to `.gitignore` (it must list `node_modules`, `dist`, `*.local`). In `package.json`: set `"name": "patient-deterioration-monitor-frontend"`, remove the `lint` script and the `oxlint` dev dependency, add `"test": "vitest run"`; keep `dev`, `build`, `preview`. Run `npm install`, then `npm install --save-dev vitest@5.1.0 jsdom@31.0.1 @testing-library/react@16.3.3 @testing-library/dom@10.4.2` (no jest-dom, no MSW, no ESLint/Oxlint, no router/state/UI/CSS libraries; research R1, R2, FR-012). Confirm `package-lock.json` exists. **`.gitignore` (the root `.gitignore` does not list `node_modules`)**: if `frontend/.gitignore` doesn't exist after scaffolding, create it with the lines `node_modules`, `dist`, `dist-ssr`, `*.local`; then run `git check-ignore frontend/node_modules frontend/dist` and **stop and report** if it doesn't print both paths. In the root `.gitignore`, anchor the Python packaging rules to the repository root so they don't hide frontend folders: change `build/` to `/build/`, `lib/` to `/lib/` and `lib64/` to `/lib64/` (edit only those three lines, with the Edit tool). Then confirm `git check-ignore frontend/src/lib/x.js` prints **nothing** (not ignored) and `git check-ignore backend/.env` still prints `backend/.env` (ignored); don't open `backend/.env` (frontend-dev)
- [X] T002 Edit `frontend/vite.config.js`: `import { defineConfig } from 'vitest/config'` and `import react from '@vitejs/plugin-react'`; `export default defineConfig({ plugins: [react()], server: { port: 5173, strictPort: true }, test: { environment: 'jsdom', globals: false, setupFiles: './src/setupTests.js' } })` (plan design notes, research R5). Create `frontend/src/setupTests.js`: `import { afterEach } from 'vitest'`, `import { cleanup } from '@testing-library/react'`, `afterEach(() => { cleanup() })`. Create `frontend/.env.example` with a comment line `# Backend base URL used by src/api/client.js. Copy to .env to override. Not a secret.` and `VITE_API_BASE_URL=http://localhost:8000` (FR-004, FR-011) (frontend-dev)

---

## Phase 2: Foundational

None. TS-01/TS-02 (merged) provide `GET /health`, which this story uses **unchanged** (FR-007).

---

## Phase 3: TS-04 React app skeleton 🎯 MVP

**Goal**: the start page at `http://localhost:5173` shows the backend's `/health` result (or "cannot be reached") in Spanish within 10 s, through one shared API client; the backend accepts browser requests only from `CORS_ORIGINS` (default `http://localhost:5173`).

**Independent Test**: `npm test` and `npm run build` in `frontend/` and `python -m pytest` in `backend/` pass with no backend running and no network; quickstart steps 3–4 pass in a browser.

### Implementation

- [X] T003 [P] [TS-04] Create `frontend/src/api/client.js` (top comment: "Shared API client (TS-04). Every screen calls the backend through this module; the base URL is configured only here.") exactly as [contracts/health-ui.md](contracts/health-ui.md): `export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '') || 'http://localhost:8000'`; `export const REQUEST_TIMEOUT_MS = 10000`; `export async function apiGet(path)` — creates an `AbortController`, `const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)`, `try { const response = await fetch(API_BASE_URL + path, { signal: controller.signal }); if (!response.ok) throw new Error(\`HTTP ${response.status}\`); return await response.json() } finally { clearTimeout(timer) }`; `export async function getHealth()` — `const body = await apiGet('/health')`; throw `new Error('Unexpected /health response')` unless `body` is an object and `body.status` and `body.version` are non-empty strings; return `{ status: body.status, version: body.version, database: body.database }`. No other file may contain `localhost:8000` or call `fetch` (FR-003, FR-004, AC5) (frontend-dev)
- [X] T004 [TS-04] Replace `frontend/src/App.jsx` with the start page, depends on T003 (plan design notes): `import { useEffect, useState } from 'react'`, `import { getHealth } from './api/client.js'`, `import './App.css'`; state `{ kind: 'checking' }`; one `useEffect(..., [])` that calls `getHealth()` once with a `cancelled` flag set in the cleanup, mapping success to `{ kind: body.database === 'ok' ? 'ok' : 'databaseUnavailable', version }` and any error to `{ kind: 'unreachable' }`. Render `<main>` with `<h1>Monitor de Deterioro del Paciente</h1>` and a `<section role="status">` containing, per state, exactly the Spanish texts in [contracts/health-ui.md](contracts/health-ui.md): checking → `Comprobando la conexión con el servidor…`; ok → `API: funcionando`, `Versión: {version}`, `Base de datos: disponible`; databaseUnavailable → `API: funcionando`, `Versión: {version}`, `Base de datos: no disponible`, `Recarga la página para volver a comprobar.`; unreachable → `No se puede conectar con el servidor.`, `Recarga la página para volver a comprobar.` (each text in its own `<p>`). Never display the error message. No retry button, no polling (FR-002, FR-003, AC2–AC4) (frontend-dev)
- [X] T005 [P] [TS-04] Edit `frontend/src/main.jsx`: `import { createRoot } from 'react-dom/client'`, `import App from './App.jsx'`, `createRoot(document.getElementById('root')).render(<App />)` — **no `StrictMode`** (it would call `/health` twice in development, research R4); remove the `./index.css` import and delete `frontend/src/index.css`. Replace `frontend/src/App.css` with minimal plain CSS (system font, `main` centred with `max-width: 40rem`, some padding; nothing else). Edit `frontend/index.html`: `<html lang="es">`, `<title>Monitor de Deterioro del Paciente</title>`; keep the favicon link only if `public/favicon.svg` still exists (FR-012) (frontend-dev)
- [X] T006 [P] [TS-04] Edit `backend/app/main.py` per [contracts/cors-config.md](contracts/cors-config.md) and research R6: add `import os` and `from fastapi.middleware.cors import CORSMiddleware`; `DEFAULT_CORS_ORIGINS = ["http://localhost:5173"]`; `def parse_cors_origins(value: str | None) -> list[str]` with a docstring — split `value or ""` on `,`, `strip()` each entry and remove trailing `/` (`rstrip("/")`), drop empty entries; if any entry `== "*"` raise `ValueError("CORS_ORIGINS must not contain '*'; list the allowed origins explicitly")` (fixed text, no configured value in it); empty result → `list(DEFAULT_CORS_ORIGINS)`. Right after `app = FastAPI(...)`: `app.add_middleware(CORSMiddleware, allow_origins=parse_cors_origins(os.environ.get("CORS_ORIGINS")), allow_credentials=False, allow_methods=["GET"])`. Keep `from app.db import check_database` **above** this code (importing `app.db` loads `backend/.env`, so `CORS_ORIGINS` is read like `DATABASE_URL`). Do not change `/health` or `app/db.py` (FR-005–FR-007, AC6, AC7) (backend-dev)
- [X] T007 [P] [TS-04] Create `frontend/README.md` (replaces the template's): what the frontend is (TS-04 skeleton; Spanish UI; language switch in TS-05); prerequisites (Node.js 26 LTS, `node -v`; the backend running as in [backend/README.md](../backend/README.md)); commands from `frontend/`: `npm install`, `npm run dev` (opens at **http://localhost:5173** — use `localhost`, not `127.0.0.1`, which is a different origin not allowed by default; port fixed, fails if busy), `npm run build` (output in `dist/`), `npm test` (runs once; no backend or network needed); configuration: `VITE_API_BASE_URL` (default `http://localhost:8000`; to override copy `.env.example` to `.env`, which is git-ignored; read at dev/build time, restart `npm run dev` after changing it; not a secret); where the API client lives (`src/api/client.js`) and the rule that screens call the backend only through it; what the start page shows in each state and that you reload to check again; troubleshooting: "No se puede conectar con el servidor" → backend not running or `CORS_ORIGINS` doesn't include the page's origin (browser console shows a CORS error) (FR-010, AC10) (frontend-dev)
- [X] T008 [P] [TS-04] Edit `backend/README.md`: add a `## Allowed frontend origins (CORS)` section after "Database migrations" and before "Run": the backend accepts browser requests only from the origins in `CORS_ORIGINS` (comma-separated, e.g. `CORS_ORIGINS=http://localhost:5173,https://<your-app>.azurestaticapps.net`), set in the terminal or as a line in `backend/.env` (terminal value wins); default when unset or blank: `http://localhost:5173`; spaces and trailing `/` are ignored; setting it **replaces** the default; `*` is not allowed and stops the app at startup with `CORS_ORIGINS must not contain '*'; list the allowed origins explicitly`; only `GET`, no cookies; not a secret; production origins are set in TS-10/TS-11; the PowerShell note that `$env:CORS_ORIGINS = ""` deletes the variable (use `Remove-Item Env:CORS_ORIGINS`) (FR-010, AC7, AC10) (backend-dev)

### Tests and review

- [X] T009 [P] [TS-04] Create `frontend/src/App.test.jsx` (top comment citing TS-04 AC2–AC4, AC8, FR-008 and [contracts/health-ui.md](contracts/health-ui.md)), depends on T002–T005. Use `import { describe, it, expect, vi, afterEach } from 'vitest'`, `render`, `screen` from `@testing-library/react`; in each test `vi.stubGlobal('fetch', vi.fn(...))`; `afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })`. A helper `jsonResponse(body, status = 200)` returns `{ ok: status >= 200 && status < 300, status, json: async () => body }`. Tests (test names cite the AC):
  - `AC2 shows checking first, then API ok, version and database available`: fetch resolves `{ status: 'ok', version: '0.1.0', database: 'ok' }`; `Comprobando la conexión con el servidor…` is present right after render; then `findByText('API: funcionando')`, `Versión: 0.1.0`, `Base de datos: disponible`; `fetch` called exactly once;
  - `AC3 shows database not available`: `database: 'unavailable'` → `Base de datos: no disponible` and `Recarga la página para volver a comprobar.`;
  - `edge case: unknown database value is shown as not available`: `database: 'weird'` → `Base de datos: no disponible`;
  - `AC4 network error shows backend unreachable`: fetch rejects `new TypeError('Failed to fetch')` → `No se puede conectar con el servidor.` and the reload hint; `Comprobando…` no longer shown;
  - `AC4 non-200 status shows backend unreachable`: `jsonResponse({}, 500)`;
  - `AC4 unexpected body shows backend unreachable`: `{ foo: 'bar' }` (no `status`/`version`);
  - `AC4 timeout after 10 seconds shows backend unreachable`: `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` (only the client's timer; React's scheduler keeps working, research R5); fetch mock `(url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))`; render; `Comprobando…` shown; `await act(async () => { await vi.advanceTimersByTimeAsync(9999) })` → still `Comprobando…`; `await act(async () => { await vi.advanceTimersByTimeAsync(1) })` → `No se puede conectar con el servidor.` (import `act` from `@testing-library/react`; use `screen.getByText` after advancing, not `findByText`, while fake timers are on).

  (qa-tester)
- [X] T010 [P] [TS-04] Create `frontend/src/api/client.test.js` (top comment citing TS-04 AC5, FR-004), depends on T003: with no `VITE_API_BASE_URL` set (the test run has none), `API_BASE_URL === 'http://localhost:8000'` and `REQUEST_TIMEOUT_MS === 10000`; `getHealth()` calls `fetch` once with first argument `'http://localhost:8000/health'` and an `AbortSignal` in the options; `apiGet` returns the parsed JSON for a 200 and throws for a 404. Then search `frontend/src` (excluding `api/`) for `localhost:8000` and `fetch(` with Grep and confirm no matches (SC-004) (qa-tester)
- [X] T011 [P] [TS-04] Edit `backend/tests/conftest.py`: at the very top of the module, **before** `import app.db` / `import app.main`, add `import os` and `os.environ["CORS_ORIGINS"] = ""` with a comment: "TS-04: build the app with the default CORS origin during tests; python-dotenv (override=False) won't replace a variable that already exists, so a developer's backend/.env can't change it (research R7)". Create `backend/tests/test_cors.py` (docstring citing TS-04 AC6, AC7, AC9, FR-005, FR-006, FR-009 and [contracts/cors-config.md](../specs/004-react-app-skeleton/contracts/cors-config.md)), no database or network, depends on T006:
  - `test_parse_default_when_unset_or_blank` (AC6, FR-005): parametrize `None`, `""`, `" "`, `","`, `" , "` → `["http://localhost:5173"]`;
  - `test_parse_trims_spaces_and_trailing_slash` (edge case): `"http://localhost:5173/"` → `["http://localhost:5173"]`;
  - `test_parse_configured_list_replaces_default` (AC7): `" http://a.example , http://b.example/ "` → `["http://a.example", "http://b.example"]`;
  - `test_parse_rejects_wildcard` (FR-006): parametrize `"*"`, `"http://a.example,*"`, `" * "` → `pytest.raises(ValueError)`; message equals `CORS_ORIGINS must not contain '*'; list the allowed origins explicitly` and does not contain `a.example`;
  - `test_default_origin_is_allowed` (AC6): override `app.db.check_database` → `"ok"` as in `test_health.py`; `TestClient(app.main.app).get("/health", headers={"Origin": "http://localhost:5173"})` → 200 and `access-control-allow-origin == "http://localhost:5173"`;
  - `test_other_origin_is_not_allowed` (AC6, SC-005): same with `Origin: http://evil.example` → 200 and no `access-control-allow-origin` header;
  - `test_credentials_not_allowed_and_no_wildcard` (FR-006): for the default origin the response has no `access-control-allow-credentials: true` and the allow-origin header is never `*`;
  - `test_wildcard_stops_startup` (AC7, FR-006): `subprocess.run([sys.executable, "-c", "import app.main"], cwd=<backend dir>, env=<copy of os.environ with CORS_ORIGINS="*" and DATABASE_URL removed>, capture_output=True, text=True, timeout=60)` → `returncode != 0` and the fixed message in `stderr`.

  (qa-tester)
- [X] T012 [TS-04] Run the automated checks, depends on T001–T011: in `frontend/` `npm test` (all pass, under 30 s, SC-003) and `npm run build` (no errors; `dist/` git-ignored); in `backend/` `python -m pytest` (TS-01–TS-03 tests and `test_cors.py` all pass, so `/health` is unchanged, FR-007). Keep both outputs for the PR description (D-27). Grep `backend/app` for the regex `allow_origins=\["\*"\]` and for `allow_origin_regex` and confirm no matches (SC-004). Run `git status --porcelain` from the repository root and confirm no path under `frontend/node_modules/` or `frontend/dist/` is listed (stop and report if one is). Running these on a team laptop also confirms Smart App Control allows Vite/Vitest (research R2). Fix T003–T011 if a check fails (AC1, AC8, AC9) (qa-tester)
- [X] T013 [TS-04] Review read-only `backend/app/main.py`, `backend/tests/conftest.py`, `backend/tests/test_cors.py`, `frontend/src/api/client.js`, `frontend/src/App.jsx`, `frontend/.env.example`, `frontend/.gitignore`, the root `.gitignore` change, `frontend/package.json` and the READMEs: `frontend/.gitignore` exists and lists `node_modules` and `dist`; the root `.gitignore` still ignores `.env` / `.env.*` everywhere and only `build/`, `lib/`, `lib64/` were anchored; CORS allows only configured origins, never `*`, no credentials, `GET` only; the startup error has fixed text with no configured value; `CORS_ORIGINS` read only from the environment / `backend/.env`; no secrets or real data in the frontend; `frontend/.env` git-ignored and only the placeholder `.env.example` committed; the page shows fixed texts, never raw errors or response bodies; no `dangerouslySetInnerHTML`; dependencies limited to research R2 and locked in `package-lock.json` (also run `npm audit` in `frontend/` and report the result; fixing is TS-09). Report findings; don't change code (Principles VI, VIII) (security-reviewer)
- [X] T014 [TS-04] Manual browser check per [quickstart.md](quickstart.md) steps 3–4 (AC11), after T012: needs a human with a browser. If the agent can't open a browser, report the steps as **pending for the user** (with the exact commands), don't mark them done. If done: record one line each — backend on: what the page showed, no CORS error in the console, one `/health` request; backend off: "No se puede conectar con el servidor." within 10 s (AC2, AC4, AC6, AC11, SC-002) (orchestrator)

**Checkpoint**: TS-04 is complete. TS-05 (language and disclaimer), TS-06 (login page) and TS-09 (CI) can build on `frontend/`.

---

## Phase 4: Polish

- [X] T015 [P] Edit `DEVELOPMENT.md`: in "2. Software to install", say Node.js **26 LTS** (checked with `node -v`) is needed for the frontend; in "4. Repository structure", describe `frontend/` as the React app (Vite) with a link to [frontend/README.md](frontend/README.md); add a short subsection "Run the app locally" (in "8. Preparing for the live demo" or next to the existing "Run the app locally" checklist item) with the two-terminal steps: terminal 1 backend (`cd backend`, activate venv, `python -m uvicorn app.main:app --reload --port 8000`), terminal 2 frontend (`cd frontend`, `npm install` first time, `npm run dev`), open `http://localhost:5173`; mention `CORS_ORIGINS` (default fine locally; see backend/README.md) and `VITE_API_BASE_URL` (default fine locally; see frontend/README.md). Update the existing checklist line about running the app locally to link both READMEs (FR-010, AC10, SC-001) (orchestrator)
- [X] T016 Edit `docs/PROJECT_STATUS.md`: set "Last updated" to the current date; in step 11's notes mark TS-04 ✅ and set "Next: TS-05 (language and disclaimer)"; set "Next step" accordingly; rewrite the "Where we left off" note: TS-04 is done (frontend skeleton in `frontend/`, CORS via `CORS_ORIGINS`), the manual browser check result (or that it is pending for the user, if T014 reported so), and that teammates install Node.js 26 LTS and run `npm install` in `frontend/` (backend: nothing new to install). Add to the deferred-to-TS-09 note: run `npm test` and `npm audit` in CI. In `docs/BACKLOG.md`, link this feature in TS-04's Spec column; set Status ✅ only when the PR is merged. In `docs/DECISIONS.md`, add entry **D-33** after D-32 (date of the change, Status "Active"): decision — frontend is **Vite 8 + React 19, plain JavaScript**, from the official template trimmed (no linter: the template now ships Oxlint, a native binary; no router/state/UI/CSS libraries; no `StrictMode` so `/health` is called once per load), tests with **Vitest + jsdom + React Testing Library** with `fetch` mocked, one API client `src/api/client.js` with `VITE_API_BASE_URL` (default `http://localhost:8000`) and a 10 s timeout; backend CORS through **`CORS_ORIGINS`** (comma-separated, default `http://localhost:5173`, `*` stops startup, `GET` only, no credentials); reason — simplest option (D-23), runs with Smart App Control (D-31), keeps Neon asleep (D-30), restricted CORS (constitution VIII); rejected — ESLint/Oxlint now (TS-09 may add a linter), TypeScript, axios, MSW, wildcard CORS (orchestrator)

---

## Dependencies & Execution Order

- **T001** (Setup): no dependencies; needed before any frontend task.
- **T002**: depends on T001.
- **T003, T005, T007**: depend only on T001; different files, can run in parallel.
- **T004**: depends on T003 (imports `getHealth`).
- **T006, T008**: backend; depend only on the plan; can run in parallel with all frontend tasks.
- **T009**: depends on T002–T005. **T010**: depends on T003. **T011**: depends on T006. They can run in parallel with each other.
- **T012**: depends on T001–T011.
- **T013**: depends on T012.
- **T014**: depends on T012 (human browser check).
- **T015**: can run any time after T007/T008. **T016**: last; depends on T013, T014.
- **Story dependencies**: TS-01 only (merged; TS-02's `database` field also merged), per docs/BACKLOG.md.

## Parallel Example

```text
# Round 1, after T001–T002:
Task (frontend-dev): "Create frontend/src/api/client.js (T003)"
Task (frontend-dev): "Edit main.jsx, App.css, index.html (T005)"
Task (frontend-dev): "Create frontend/README.md (T007)"
Task (backend-dev):  "Add parse_cors_origins + CORSMiddleware to backend/app/main.py (T006)"
Task (backend-dev):  "Add CORS section to backend/README.md (T008)"

# Round 2 (qa-tester), after T004 and T006:
Task: "Create frontend/src/App.test.jsx (T009)"
Task: "Create frontend/src/api/client.test.js (T010)"
Task: "Edit conftest.py and create backend/tests/test_cors.py (T011)"
```

## Implementation Strategy

TS-04 is the whole MVP: T001 → T002 → T003/T005/T006/T007/T008 → T004 → T009/T010/T011 → T012 → T013 → T014 → T015 → T016. After T016, commit (`TS-04: React app skeleton and CORS`), push and open the PR. Until TS-09 adds CI, paste the local `npm test` and `python -m pytest` output and the manual browser check result (quickstart steps 3–4) into the PR description (DECISIONS D-27). The PR includes the agent activity log (`specs/004-react-app-skeleton/agent-log.csv`, via `scripts/log-agent.ps1`).

## Notes

- The orchestrator assigns each task to its agent and logs `assigned` / `started` / `done` rows (see `docs/agents.md`).
- Testing runs after implementation, as the project template orders it (qa-tester, then security-reviewer). It doesn't use test-first order.
- Do not add anything not listed here (Principle XII): no linter, TypeScript, router, state library, UI kit, CSS framework, jest-dom, MSW, axios, retry button, polling, i18n library (TS-05), app factory or settings module, or changes to `/health` or `app/db.py`.
