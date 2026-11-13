# Research: React App Skeleton (TS-04)

The main tech choices came with the `/speckit-plan` input. This file records them, the reasons, and the points that needed checking: the current Vite template, package versions, React's development double call, and CORS details.

## R1. Project scaffold

- **Decision**: create `frontend/` from the official Vite React **JavaScript** template (`npm create vite@9.3.4 frontend -- --template react`), then trim it: remove the demo content (counter, logos, `src/assets/`, `public/` icons), and remove **Oxlint** (`oxlint` dev dependency, `_oxlintrc.json` / `.oxlintrc.json`, the `lint` script). The template's `_gitignore` becomes `frontend/.gitignore` (`node_modules`, `dist`, `*.local`, editor files). Commit `package-lock.json`.
- **Finding (npm registry, 2026-11-13)**: create-vite 9.3.4's `template-react` no longer ships ESLint; its `lint` script runs **Oxlint**, a native binary (it could be blocked by Smart App Control, D-31). The `/speckit-plan` input asked for "ESLint as in the template; no Oxlint", which no longer matches the template.
- **Decision on linting (user, 2026-11-13)**: **no linter in TS-04**. Nothing in the spec needs one; TS-09 (CI) may add one later. Simplest option (D-23).
- **Alternatives considered**: add ESLint by hand (5 more dev dependencies and a config file); keep Oxlint (extra native binary to clear with Smart App Control).

## R2. Versions (npm registry, 2026-11-13)

| Package | Version | Role |
|---|---|---|
| Node.js | 26 LTS (26.13.1 on our laptops) | Runtime; Vite 8 needs ≥ 20.19 / 22.12, Vitest 5 and jsdom 31 need ≥ 22.12 / 22.22 or ≥ 26 |
| create-vite | 9.3.4 | One-time scaffold (not a dependency) |
| vite | 8.3.8 | Dev server and build (Rolldown) |
| react, react-dom | 19.3.1 | UI |
| @vitejs/plugin-react | 6.3.0 | JSX / Fast Refresh (peer `vite ^8`) |
| vitest | 5.1.0 | Test runner (peer `vite ^6 \|\| ^7 \|\| ^8`) |
| jsdom | 31.0.1 | Browser-like DOM for tests |
| @testing-library/react | 16.3.3 | Render components and query by visible text |
| @testing-library/dom | 10.4.2 | Required peer of @testing-library/react |

- **Decision**: install with plain `npm install`; `package.json` keeps the caret ranges npm writes, and the committed **`package-lock.json` locks the exact versions** (FR-001). The template's `@types/react` / `@types/react-dom` stay (editor hints only, no build step). `@testing-library/jest-dom` is **not** added: `findByText` / `queryByText` are enough (D-23).
- **Smart App Control (D-31)**: Vite 8 runs on the team's laptops (checked by the user 2026-11-13). Vitest uses the same Vite/Rolldown binaries; jsdom and Testing Library are pure JavaScript. Verified during implementation by running `npm test` and `npm run build` on a team laptop (quickstart step 2).

## R3. API client and timeout

- **Decision**: one module `frontend/src/api/client.js`:
  - `API_BASE_URL` = `import.meta.env.VITE_API_BASE_URL`, trimmed, trailing `/` removed, or `http://localhost:8000` when unset/blank (FR-004).
  - `apiGet(path)` calls `fetch(API_BASE_URL + path)` with an `AbortController` that aborts after **10 000 ms** (`REQUEST_TIMEOUT_MS`), clears the timer in `finally`, throws on a non-2xx status, and returns the parsed JSON.
  - `getHealth()` calls `apiGet('/health')` and throws unless `status` and `version` are non-empty strings; returns `{ status, version, database }` (FR-003).
- **Rationale**: built-in `fetch` + `AbortController` need no library; every later screen imports `apiGet`. `VITE_` variables are read at build time, which suits a static site (TS-11 sets the production value).
- **Alternatives considered**: axios (extra dependency); `AbortSignal.timeout()` (harder to drive with fake timers in tests).

## R4. One `/health` call per page load (React StrictMode)

- **Finding**: in development, React `<StrictMode>` runs every effect twice on mount, so the template's `main.jsx` would make **two** `/health` calls per load in `npm run dev` (each wakes Neon, D-30) — against the spec edge case "checks `/health` once per load".
- **Decision**: render `<App />` **without `<StrictMode>`** in `src/main.jsx`. The `useEffect` still ignores a result that arrives after unmount (a `cancelled` flag), which is good practice.
- **Alternatives considered**: keep StrictMode and accept the double call in development only; a module-level "already called" guard (surprising for later screens).

## R5. Frontend tests

- **Decision**: Vitest with `environment: 'jsdom'` in `vite.config.js` (`defineConfig` from `vitest/config`), `globals: false`, and a tiny `src/setupTests.js` that calls Testing Library's `cleanup` after each test. `fetch` is replaced with `vi.stubGlobal('fetch', vi.fn(...))` in each test (no backend, no network, FR-008). The timeout test uses `vi.useFakeTimers()`, a `fetch` mock that rejects when its `signal` aborts, and advances time by 10 000 ms. Fake timers are limited to `setTimeout` / `clearTimeout` (`vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })`) and each advance runs inside `act(async () => ...)`, so React's own scheduling isn't frozen and the state update is applied before the assertion (found by `/speckit-analyze`). `npm test` = `vitest run` (runs once, exits).
- **Tests** (`src/App.test.jsx`): checking state shown first; ok; database unavailable; unknown `database` value → not available; network error → unreachable; non-200 → unreachable; bad body → unreachable; timeout → unreachable. Plus `src/api/client.test.js` for the base URL default (no `VITE_API_BASE_URL` set) and that `fetch` is called with `http://localhost:8000/health`.
- **Alternatives considered**: MSW (extra dependency and setup); happy-dom (jsdom is the more common default).

## R6. CORS on the backend

- **Decision**: in `backend/app/main.py`, a pure function `parse_cors_origins(value: str | None) -> list[str]`: split on commas, trim spaces and trailing `/`, drop empty entries; empty result → `["http://localhost:5173"]`; any entry equal to `*` → `raise ValueError("CORS_ORIGINS must not contain '*'; list the allowed origins explicitly")` (fixed text, no config values). At import, `app.add_middleware(CORSMiddleware, allow_origins=parse_cors_origins(os.environ.get("CORS_ORIGINS")), allow_credentials=False, allow_methods=["GET"])`. `main.py` already imports `app.db`, which loads `backend/.env` (python-dotenv, `override=False`), so `CORS_ORIGINS` is read exactly like `DATABASE_URL` (FR-005, AC7).
- **Startup failure**: the `ValueError` is raised while `app.main` is imported, so `uvicorn app.main:app` exits with a non-zero code and the message in the traceback (FR-006).
- **Rationale**: Starlette's `CORSMiddleware` compares the `Origin` header with the list exactly and sends `Access-Control-Allow-Origin` only for a match; a `GET` with no custom headers is a "simple" request (no preflight). Trimming the trailing `/` is needed because browsers send origins without it.
- **Note**: `http://127.0.0.1:5173` is a different origin from `http://localhost:5173`; the docs tell developers to open the page at `localhost` (the address Vite prints).
- **Alternatives considered**: a separate settings module or pydantic-settings (more code for one variable); `allow_origin_regex` (harder to review).

## R7. Backend tests

- **Decision**: new `backend/tests/test_cors.py`:
  - `parse_cors_origins`: unset → default; blank / spaces → default; list with spaces and trailing `/` → cleaned list that replaces the default; `*` alone or in a list → `ValueError` whose message has no other configured value.
  - `TestClient(app.main.app)` `GET /health` with `Origin: http://localhost:5173` → `access-control-allow-origin` equals that origin; with `Origin: http://evil.example` → header absent; never `*`. The database check is overridden as in `test_health.py` (no database).
  - Startup check: run `python -c "import app.main"` in a **subprocess** with `CORS_ORIGINS=*` (and no `DATABASE_URL`) from `backend/`; assert a non-zero exit code and the fixed message in stderr. Avoids reloading `app.main` inside the test process.
- **Isolation from a developer's settings**: the middleware list is built once, when `app.main` is imported, so a `CORS_ORIGINS` line in a developer's `backend/.env` (or terminal) would change what the `TestClient` tests see. `conftest.py` therefore sets `os.environ["CORS_ORIGINS"] = ""` at the **top of the file, before importing `app.db` / `app.main`**. python-dotenv with `override=False` never replaces a variable that already exists, so the app is always built with the default origin during tests. The subprocess test passes its own environment.
- **Alternatives considered**: reloading `app.main` with `importlib.reload` (breaks other tests' references to `app.main.app`); an app factory (more structure than one story needs).
