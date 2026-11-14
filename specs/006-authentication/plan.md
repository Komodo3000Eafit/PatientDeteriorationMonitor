# Implementation Plan: Authentication

**Branch**: `006-authentication` | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-authentication/spec.md`

## Summary

TS-06 adds sign-in with username and password, with no schema change.

**Backend:**

- **Password hashing**: standard library only. PBKDF2-HMAC-SHA256 with 600 000 iterations and a 16-byte random salt, stored in the TS-03 `users.password_hash` as `pbkdf2_sha256$<iter>$<salt>$<hash>` and checked with `hmac.compare_digest`.
- **Tokens**: HS256 JWTs (PyJWT 2.15.1, pure Python) with the claims `sub`, `iat` and `exp`. They are signed with `AUTH_SECRET` and last `ACCESS_TOKEN_MINUTES` (default 480). Both settings are read like `DATABASE_URL` and checked when `app.main` is imported, so a bad setting stops startup with a fixed message.
- **`POST /auth/login`**: returns a bearer token. It gives one generic 401 for an unknown user and for a wrong password, and checks a dummy hash for unknown users so the timing is similar.
- **`GET /me`**: uses the reusable dependency `get_current_user` (HTTPBearer, token checked first, then the account). Every later clinical endpoint uses the same dependency.
- **Validation errors**: a 422 handler stops responses from echoing submitted values (checked: FastAPI's default returns the password).
- **CORS**: adds `POST` and the `Authorization`/`Content-Type` headers only.
- **Demo users**: `python -m app.seed_demo_users` upserts `demo.doctor` and `demo.nurse`, with passwords from the environment.

**Frontend:**

- **Session**: kept in `sessionStorage['pdm.session']`.
- **API client**: `client.js` gets one `request()` helper that adds `Authorization: Bearer` and clears the session on a 401.
- **`AuthProvider`/`useAuth`**: signs in, signs out, and checks the stored token once on load.
- **`RequireAuth`**: shows `LoginPage` inside the TS-05 `AppShell` until the user is signed in.
- **Header**: shows the name, the translated role and a logout button.
- **Texts**: all in `translations.js` (ES/EN).

**Tests:** existing tests keep passing. They use a fake test secret, the TS-04 `*` subprocess test passes it too, and the frontend tests start from a signed-in session. New tests use a fake user lookup, in-memory SQLite for the seed command and a mocked `fetch`.

## Technical Context

**Language/Version**: Python 3.13 (backend); JavaScript ES modules on Node.js 26 LTS (frontend); both unchanged.

**Primary Dependencies**:

- Existing: FastAPI 0.162.4, SQLAlchemy 2.1.8, pg8000 1.31.6, python-dotenv 1.2.4, React 19.3.1 and Vite 8.3.8.
- **New: `PyJWT==2.15.1`** (pure-Python wheel `py3-none-any`, no `cryptography` extra; research R2). No other new dependency, and nothing new in the frontend.

**Storage**: Neon PostgreSQL. The TS-03 `users` table is used unchanged, with no migration. The browser keeps the session in `sessionStorage['pdm.session']`.

**Testing**: pytest with FastAPI `TestClient`, dependency overrides (`get_user_lookup`), in-memory SQLite (standard library) for the seed command, and subprocess startup tests. Vitest + jsdom + React Testing Library with `fetch` mocked per URL.

**Target Platform**: the API runs locally on Windows laptops (Azure App Service in TS-10); the frontend runs in modern desktop browsers.

**Project Type**: web application (backend + frontend).

**Performance Goals**:

- One login takes about 0.3–0.6 s of PBKDF2 work by design.
- `/me` is one indexed query.
- Name and role are shown in under 2 s after sign-in (SC-005).
- Each test suite runs in under 30 s (SC-007): fake users use low-iteration hashes (R7).

**Constraints**:

- No compiled packages (D-31).
- Secrets only from the environment or `backend/.env`.
- Generic 401s; no submitted values in errors.
- No cookies; CORS keeps explicit origins and no credentials.
- `/health` is unchanged and still called once per page load (D-30), but only when signed in.

**Scale/Scope**: 2 demo accounts, 2 endpoints, 3 new backend modules, 4 new frontend modules (`session`, `AuthContext`, `RequireAuth`, `LoginPage`), 12 new texts, about 5 new test files, and README/DEVELOPMENT sections.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Spec-driven and traceable**: every file maps to an FR/AC (traceability table below), and tests name the AC they verify.
- [x] **II. Small Scrum story**: one story with two endpoints, one command and one login page.
- [x] **III. Independence**: depends only on TS-03 and TS-04 (plus the merged TS-05 frame), as in `docs/BACKLOG.md`. It changes only technical-story code (`app/main.py`, `client.js`, `App.jsx`, `AppShell.jsx`, `translations.js`, TS-04/TS-05 tests). It also provides the shared pieces that functional stories need, `get_current_user` and `RequireAuth`, so those stories don't depend on each other.
- [x] **IV. Multi-agent**: each task has an owner agent, logged in `agent-log.csv`:
  - **backend-dev**: `passwords.py`, `auth.py`, `seed_demo_users.py`, `main.py`, `requirements.txt`, `backend/.env.example`, backend README.
  - **frontend-dev**: `session.js`, `client.js`, `AuthContext.jsx`, `RequireAuth.jsx`, `LoginPage.jsx`, `AppShell.jsx`, `App.jsx`, `App.css`, `translations.js`, frontend README.
  - **qa-tester**: all new tests, the updates to existing tests, and running both suites.
  - **security-reviewer**: hashing, token handling, generic errors, no echo, CORS, secrets and storage.
  - **orchestrator**: `DEVELOPMENT.md`, `PROJECT_STATUS.md`, `BACKLOG.md`, `DECISIONS.md` (D-35) and the agent log.
  - devops is not needed.
  - The manual Neon and browser checks (quickstart 2–3) are done by the developer.
- [x] **V. Clinical logic**: no scoring or alerts in this story.
- [x] **VI. Data privacy**: demo accounts are synthetic. Passwords and the secret come only from the environment, and `.env.example` holds placeholders. The token holds only the user id, and the browser stores only the token plus the user's name and role.
- [ ] **VII. Tests**: login, `/me`, the token check, hashing, startup checks, CORS and the UI flows have automated tests. **Exception**: CI and the dependency check don't exist until TS-09 (Complexity Tracking, D-27).
- [x] **VIII. Security baseline**:
  - Input is validated (Pydantic lengths), and errors never echo input (R6).
  - The authentication pattern for clinical views is delivered (`get_current_user`, `RequireAuth`).
  - Secrets come only from environment variables, and startup refuses a weak secret.
  - Errors are generic: identical 401s, and similar timing thanks to the dummy hash.
  - CORS keeps known origins, no wildcard and no credentials.
  - The JWT algorithm is pinned on decode.
  - Rate limiting is deferred to TS-10, as the spec says.
- [x] **IX. Deployable at low cost**: no new service, and no extra Neon queries except one per login or `/me` call.
- [x] **X. Stack**: FastAPI, React, PostgreSQL.
- [x] **XI. Language**: code and docs in English; all new UI texts in Spanish and English.
- [x] **XII. Simplicity**:
  - Standard-library hashing, one small token library, and no settings, auth or router library.
  - No new table, refresh tokens or server-side sessions.
  - The 422 handler (R6) is about 8 lines and is justified by a security finding.

**Post-design re-check (after Phase 1)**: all items still pass, and only the Principle VII exception remains. Three Phase 1 additions keep this story self-contained:

- the 422 no-echo handler (R6);
- the 503 for a database failure (R4/R5);
- refreshing the session with `/me` on load (R9).

## Project Structure

### Documentation (this feature)

```text
specs/006-authentication/
├── spec.md
├── plan.md                  # This file
├── research.md              # Phase 0
├── data-model.md            # Phase 1: users (unchanged), hash format, demo accounts, token, settings, browser session
├── quickstart.md            # Phase 1: tests + manual Neon and browser checks
├── contracts/
│   ├── auth-api.md          # Phase 1: /auth/login, /me, protection pattern, 422, CORS, startup check, seed command
│   └── auth-ui.md           # Phase 1: screen structure, LoginPage, texts es/en, session, client, AuthContext
├── checklists/
│   └── requirements.md
└── tasks.md                 # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── requirements.txt               # CHANGED: + PyJWT==2.15.1
├── .env.example                   # NEW: placeholders only (DATABASE_URL, CORS_ORIGINS, AUTH_SECRET, ACCESS_TOKEN_MINUTES, DEMO_*_PASSWORD)
├── README.md                      # CHANGED: "Authentication" section (secret, lifetime, demo passwords, seed command, demo usernames, protecting endpoints)
├── app/
│   ├── passwords.py               # NEW: hash_password, verify_password (R1)
│   ├── auth.py                    # NEW: load_auth_settings/SETTINGS, tokens, DbUserLookup, get_user_lookup, get_current_user, router (/auth/login, /me)
│   ├── seed_demo_users.py         # NEW: DEMO_USERS, read_demo_passwords, upsert_demo_users, main() (python -m app.seed_demo_users)
│   └── main.py                    # CHANGED: include auth router, 422 no-echo handler, CORS methods/headers
└── tests/
    ├── conftest.py                # CHANGED: fake AUTH_SECRET and blank ACCESS_TOKEN_MINUTES / DEMO_* before importing the app
    ├── test_cors.py               # CHANGED: subprocess test passes the fake secret; new preflight tests for POST + Authorization
    ├── test_passwords.py          # NEW: format, verify ok/wrong, unique salts, malformed hashes → False
    ├── test_auth.py               # NEW: settings check (unit + subprocess), login ok / unknown / wrong / 422 no echo / 503, /me valid / missing / Basic / malformed / wrong secret / tampered / expired / deleted, /health public
    └── test_seed_demo_users.py    # NEW: missing/short passwords change nothing, create then update (no duplicates), output has no secrets

frontend/
├── README.md                      # CHANGED: "Sign-in" section (login page, session, RequireAuth, client token, adding protected screens)
└── src/
    ├── App.jsx                    # CHANGED: LanguageProvider > AuthProvider > AppShell > RequireAuth > StartPage
    ├── App.css                    # CHANGED: login form, header user block
    ├── LoginPage.jsx              # NEW: sign-in form, error/sessionExpired messages
    ├── App.test.jsx               # CHANGED: starts signed in; counts /health calls only
    ├── api/
    │   ├── client.js              # CHANGED: request(), ApiError, apiPost, login, getMe, onUnauthorized; token from session
    │   └── client.test.js         # CHANGED: + Authorization header, apiPost JSON, 401 handler only with stored token
    ├── auth/
    │   ├── session.js             # NEW: getSession/saveSession/clearSession (sessionStorage 'pdm.session', guarded)
    │   ├── AuthContext.jsx        # NEW: AuthProvider, useAuth
    │   ├── RequireAuth.jsx        # NEW: guard for protected screens
    │   └── auth.test.jsx          # NEW: login ok/wrong/unreachable, double submit, logout, reload keeps session, 401 → expired, blocked storage, both languages
    ├── components/
    │   └── AppShell.jsx           # CHANGED: user block (name, role, logout) when signed in
    ├── i18n/
    │   ├── translations.js        # CHANGED: + 12 keys (contracts/auth-ui.md)
    │   └── language.test.jsx      # CHANGED: starts signed in; counts /health calls only
    └── testing/
        └── fakeBackend.js         # NEW: test helper — fetch mock routed by URL, signInForTest()

DEVELOPMENT.md                     # CHANGED: "Run the app locally" adds AUTH_SECRET, demo passwords, seed command, sign in
docs/PROJECT_STATUS.md             # CHANGED: TS-06 done
docs/BACKLOG.md                    # CHANGED: TS-06 spec link and status
docs/DECISIONS.md                  # CHANGED: D-35
```

**Structure Decision**: this is the existing web-application layout from TS-01 to TS-05.

- **Backend**: authentication lives in `app/auth.py` so later routers import one thing (`get_current_user`). Hashing sits in its own `app/passwords.py` because the seed command needs it without loading the token settings.
- **Frontend**: `src/auth/` holds the session, the context and the guard. `LoginPage` sits next to `StartPage` in `src/` (D-23, as in TS-05). The test helper in `src/testing/` is shared by the updated TS-04/TS-05 tests and the new tests.

### Design notes

- **`app/auth.py` order**: `load_dotenv` runs first, then `SETTINGS = load_auth_settings(os.environ)`. A `RuntimeError` here stops the import of `app.main`. `router = APIRouter()` holds `POST /auth/login` and `GET /me`, with response models `TokenResponse(access_token, token_type, expires_in)` and `MeResponse(username, full_name, role)`.
- **`get_user_lookup`** is a generator dependency: it uses `with Session(get_engine()) as session: yield DbUserLookup(session)`. `DbUserLookup` methods catch `SQLAlchemyError`, log only `type(exc).__name__`, and raise a 503.
- **`get_current_user`** takes `credentials: HTTPAuthorizationCredentials | None = Depends(HTTPBearer(auto_error=False))`. The token is decoded before `users.by_id` is called. It raises a 401 with `WWW-Authenticate: Bearer`.
- **`main.py`**:
  - `app.include_router(auth.router)`.
  - `@app.exception_handler(RequestValidationError)` returns `JSONResponse(422, {"detail": [{k: e[k] for k in ("type", "loc", "msg")} for e in exc.errors()]})`.
  - CORS uses `allow_methods=["GET", "POST"]` and `allow_headers=["Authorization", "Content-Type"]`.
- **`seed_demo_users.py`**:
  - `read_demo_passwords(environ) -> (passwords, errors)` checks every setting before any database work.
  - `upsert_demo_users(session, passwords) -> list[(action, username)]` is a single transaction, committed by `main()`.
  - `main()` loads `.env` through `app.db`, prints `action: username` lines, and returns the exit code: `raise SystemExit(main())` under `if __name__ == "__main__"`.
- **Frontend `request()`**: `AbortController` with a 10 s timeout (as in TS-04). `headers` includes `Authorization` only when there is a token, and `Content-Type` only with a body. `usedStoredToken = !options.token && !!getSession()?.token` decides whether a 401 triggers the expired-session handler.
- **`AuthProvider`**: `useState(() => getSession()?.user ?? null)`. One `useEffect([], …)` checks a stored session with `getMe()`. Another `useEffect` registers `onUnauthorized`. `signIn` and `signOut` are memoised with `useCallback`.
- **`LoginPage`** keeps `username`, `password`, `submitting` and `errorKey` in state. It shows `login.sessionExpired` when `sessionExpired` is true and there is no newer error. `onSubmit` calls `preventDefault()` and returns early if `submitting` is already true.
- **CSS**: plain CSS. `.user-block { display: flex; gap: .5rem; align-items: center }` and `.login-form { display: grid; gap: .75rem; max-width: 20rem }`, with labels above inputs.

### Traceability

| Requirement / AC | Delivered by |
|---|---|
| FR-001 | `passwords.py`; `test_passwords.py`; seed stores only hashes (`test_seed_demo_users.py`) |
| FR-002, AC1 | `seed_demo_users.py`; `test_seed_demo_users.py`; quickstart 2.1–2.3 |
| FR-003, FR-005, AC2 | `auth.py` login + `create_access_token`; `test_auth.py` login ok, `expires_in`, claims |
| FR-004, AC3, SC-003 | login handler + `DUMMY_HASH`; `test_auth.py` identical 401 bodies, 422 no echo |
| FR-006, FR-007, AC4, SC-002 | `get_current_user`, `/me`; `test_auth.py` valid/missing/Basic/malformed/wrong secret/tampered/expired/deleted |
| FR-008, AC5 | `/health` untouched; `test_health.py` unchanged; `test_auth.py` `/health` without token |
| FR-009, AC6, SC-004 | `load_auth_settings`; `test_auth.py` unit + subprocess; `.env.example` placeholders; security review |
| FR-010, AC10 | `main.py` CORS; `test_cors.py` preflight tests |
| FR-011, AC7 | `RequireAuth`, `LoginPage`, `AppShell`; `auth.test.jsx` signed-out shows login, no `/health` call |
| FR-012, AC8, SC-005, SC-006 | `AuthContext.signIn`, `AppShell` user block, `client.js` token; `auth.test.jsx` (ES and EN) |
| FR-013, AC9 | `session.js`, `client.js` 401 handler, `signOut`; `auth.test.jsx` logout, reload, expired, blocked storage |
| FR-014 | `get_current_user` + `RequireAuth` + `client.js`; READMEs document the pattern |
| FR-015, FR-018, AC11, SC-007 | all test files; `conftest.py`, `test_cors.py`, `App.test.jsx`, `language.test.jsx` updates; quickstart 1 |
| FR-016, AC12, SC-001 | READMEs, `.env.example`, `DEVELOPMENT.md`, `PROJECT_STATUS.md`; quickstart 2–3 recorded in the PR |
| FR-017 | only `PyJWT` added (pure Python); D-35 |
| Edge cases (case/space usernames, DB down, deleted account, just-expired, other scheme, language switch keeps input, double submit, bad lifetime, seed without DB, unreadable session) | research R3–R5, R9; `test_auth.py`, `test_seed_demo_users.py`, `auth.test.jsx` |

### Decision to record (D-35)

Authentication uses:

- PBKDF2-HMAC-SHA256 from the standard library: 600k iterations, 16-byte salt, format `pbkdf2_sha256$…`.
- PyJWT 2.15.1 HS256 tokens (`sub`, `iat`, `exp`), signed with `AUTH_SECRET` (≥ 32 characters). Their lifetime is `ACCESS_TOKEN_MINUTES` (default 480, range 1–1440). The app refuses to start if either setting is invalid.
- `POST /auth/login` with a generic 401 and a dummy hash for unknown users, and `GET /me` through the `get_current_user` dependency.
- Validation errors that never echo input.
- CORS with `GET`/`POST` and the `Authorization`/`Content-Type` headers.
- Demo users created by hand with `python -m app.seed_demo_users`.
- In the browser, the session in `sessionStorage['pdm.session']`, the token added by `client.js`, a 401 that clears it, and `RequireAuth`.
- Stateless logout, which is accepted.

Rejected: bcrypt/argon2/passlib (compiled, D-31), cookies, `localStorage`, server-side sessions, refresh tokens, `pydantic-settings`, a router library. Notes for TS-09/TS-10: `AUTH_SECRET` as a GitHub/Azure secret; rate limiting on login.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle VII and Workflow step 5 require tests and a dependency check to run in CI before merge, but CI doesn't exist until TS-09 | TS-01 to TS-08 must be merged before the CI pipeline story | Same as TS-01 to TS-05: until TS-09 is merged, the PR includes the local `python -m pytest` and `npm test` output and the manual checks; the dependency check (including PyJWT) is done by TS-09 (DECISIONS D-27) |
