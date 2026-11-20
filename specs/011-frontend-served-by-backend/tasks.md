---
description: "Task list for TS-11: Frontend Served by the Backend"
---

# Tasks: Frontend Served by the Backend

**Input**: Design documents from `/specs/011-frontend-served-by-backend/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Mandatory for the API serving critical path (constitution Principle VII/VIII), at least
one test per acceptance criterion.

## Format: `[ID] [P?] [Story] Description (agent)`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[TS-11]**: the one story this feature implements
- **(agent)**: owner — backend-dev, frontend-dev, qa-tester, security-reviewer or devops
- Exact file paths are given in each task.
- Last two tasks: tests by `qa-tester`, then review by `security-reviewer`.

## Path Conventions

Web app layout: `backend/app/`, `backend/tests/`, `frontend/src/`, workflows in `.github/workflows/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: prepare the git-ignore and local build path so the serving code has somewhere to read from.

- [X] T001 [TS-11] Add `backend/app/static/` to the root `.gitignore` so the build output is never committed (research R3, FR-001). (devops)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the static-serving helper that the backend wiring and all tests depend on.

**⚠ CRITICAL**: T002 must exist before `main.py` can mount serving (T003) or tests can run (T008).

- [X] T002 [TS-11] Create `backend/app/static_serving.py` with: a function resolving the build directory path (`backend/app/static/`) relative to the `app` package; a helper that reports whether the build is present; a function to build the SPA catch-all handler returning `index.html` via `FileResponse` for GET paths with no file match, and an assets `StaticFiles` mount — all no-ops / skipped when the directory is absent (research R1, R4; FR-002, FR-003, FR-005, FR-010). No new dependency: use `starlette.staticfiles.StaticFiles` and `starlette.responses.FileResponse` (research R2). (backend-dev)

**Checkpoint**: serving helper ready; wiring and tests can proceed.

---

## Phase 3: User Story TS-11 — Frontend served by the backend 🎯

**Goal**: FastAPI serves the React build at one origin: API routes keep priority, assets are
served, non-API GETs fall back to `index.html`, and the deployed frontend calls the API relative.

**Independent Test**: build the frontend into `backend/app/static/`, run the backend, and confirm
`GET /` and a deep client route return the shell, `/health` and `/api/auth/login` respond as API,
an unknown `/api/...` path returns JSON 404, a missing asset 404s, and the backend still starts
with no build present (quickstart A/B).

### Implementation

- [X] T002a [TS-11] In `backend/app/main.py`, mount the auth router under `/api`: change `app.include_router(auth.router)` to `app.include_router(auth.router, prefix="/api")`, so `/auth/login` and `/me` become `/api/auth/login` and `/api/me`. Do **not** change the decorators in `app/auth.py`; keep `/health` at `/health`. Update the backend tests that assert these paths to the `/api/...` form so they pass: `backend/tests/test_auth.py`, `test_cors.py`, `test_login_rate_limit.py`, `test_security_headers.py`, and `test_seed_demo_users.py` (only where a route path is asserted) (FR-004a, AC9, research R9; contracts/static-serving.md section 0). (backend-dev)
- [X] T003 [TS-11] In `backend/app/main.py`, after all API routers are included (auth under `/api`, `/health`, future clinical routers under `/api`) and after the existing middleware, mount the assets `StaticFiles` (only if the build dir exists) and register the SPA catch-all **GET** `/{full_path:path}` route last, both from `app.static_serving`. The catch-all must be GET-only, must let `/api/...` and `/health` reach the API (an unknown `/api/...` path returns the API's JSON 404, never the shell), and must not serve the shell to a non-GET on a non-API path (FR-003, FR-004, FR-006; contracts/static-serving.md section 1–2). Depends on T002a. (backend-dev)
- [X] T004 [P] [TS-11] In `frontend/src/api/client.js`: (a) change the API base resolution so `VITE_API_BASE_URL`, when **defined** (including empty string), is used verbatim after `.trim()` + trailing-slash strip (empty ⇒ `''`, same-origin relative), and only an **undefined** value falls back to `http://localhost:8000`; (b) change the API paths to the `/api` prefix — `login()` → `/api/auth/login`, `getMe()` → `/api/me`, keeping `getHealth()` at `/health`. Update `frontend/src/api/client.test.js` and any other frontend test/helper that references `/auth/login` or `/me` (e.g. `src/testing/fakeBackend.js`, `src/auth/*`) to `/api/...` so they pass (research R5, R9; FR-004a, FR-007, FR-008, AC5, AC6, AC9). (frontend-dev)
- [X] T005 [P] [TS-11] Add `frontend/.env.production` with `VITE_API_BASE_URL=` (empty) so `npm run build` produces a same-origin relative API base; note in `frontend/.env.example` that production uses a relative base (FR-007, research R5). Confirm `.env.production` is not blocked by `frontend/.gitignore` (it carries no secret). (frontend-dev)
- [X] T006 [TS-11] Extend `.github/workflows/deploy.yml`: before the `azure/webapps-deploy@v3` step add `actions/setup-node@v7` (`node-version: "26"`, `cache: npm`), a build step running `npm ci` + `npm run build` in `frontend` with `VITE_API_BASE_URL: ""`, and a stage step copying `frontend/dist` into `backend/app/static`. Keep `package: backend`, the OIDC login, the forward-only migration and the `workflow_run`/`main` gating unchanged; do not touch `ci.yml` (FR-009, AC7; contracts/deploy-workflow.md §1–2). (devops)
- [X] T007 [TS-11] Add a post-deploy end-to-end check step (or documented manual check) in `deploy.yml` asserting on the Azure URL: `GET /` → 200 `text/html`; `GET /patients/PAT-001` → 200 `text/html`; `GET /health` → 200 JSON with `status`/`version`/`database`; with one retry for Neon waking (FR-012, AC9 partial; contracts/deploy-workflow.md §3). (devops)
- [X] T009 [TS-11] Review the TS-10 CSP in `backend/app/security_headers.py` against the served build; confirm `default-src 'self'` loads the external hashed assets with no change, update the TS-11 comment accordingly, and only adjust the policy if an inline asset would be blocked (it is not by default), keeping `frame-ancestors 'none'`, `base-uri 'self'`, `object-src 'none'` (FR-011, AC8, research R7). (backend-dev)

### Tests (critical path — API serving and boundary)

- [X] T008 [TS-11] Add `backend/tests/test_static_serving.py` using FastAPI `TestClient`, covering per `contracts/static-serving.md` section 2: with a temp build present — `GET /` → 200 `text/html` shell (AC1), a non-API/non-file GET (e.g. `/patients/PAT-001`) → 200 shell (AC2), an existing asset → 200 correct content type (AC3), a missing asset → 404 not the shell, `GET /health` → JSON (AC4), `GET /api/does-not-exist` → API JSON 404 not the shell (AC4), the old unprefixed `GET /auth/login`/`GET /me` → the SPA shell (not the JSON API) (AC9, FR-004a), a `POST` to a non-API path → not the shell (FR-006); and with no build present — the app starts and `/health` works (FR-010). Also extend/confirm `frontend/src/api/client.test.js`: the client targets `/api/...` paths, the default base is `http://localhost:8000` with no env var, and `''` (relative) when `VITE_API_BASE_URL` is set empty (AC5/AC6, AC9, SC-004/SC-007/SC-008). Each test references its AC. Note: the `/api/auth/login` and `/api/me` happy-path responses are already covered by the updated `test_auth.py` (T002a). (qa-tester)
- [X] T010 [TS-11] Security review (read-only): confirm API routes are not shadowed by the fallback, non-GET/non-API is not served the shell, the CSP still blocks nothing the app needs while keeping framing/base/object protections, no secret or build artifact is committed (`backend/app/static/` git-ignored), and CORS remains needed only for local dev. Report findings; change no code. (security-reviewer)

**Checkpoint**: TS-11 fully functional and testable; deploy ships both; e2e check green on the URL.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [X] T011 [P] [TS-11] Update docs. `docs/DECISIONS.md` already has D-44 (routing model incl. the `/api` prefix) and the DEVELOPMENT.md §5.1 route note is already written — do **not** duplicate them; just confirm they match the implemented behaviour. Still to do: `DEVELOPMENT.md` §7.2 (one App Service serves API + build; all API routes under `/api` except `/health`; how deploy builds/ships the frontend; SPA fallback; local build from quickstart) and mark TS-11 done with the single deployed URL in `docs/PROJECT_STATUS.md` and `docs/BACKLOG.md` (FR-014, AC10). (devops)
- [X] T012 [TS-11] Run `specs/011-frontend-served-by-backend/quickstart.md` sections A–C locally and record the result in the PR description; record which agent did what in `specs/011-frontend-served-by-backend/agent-log.csv` (constitution IV, workflow step 6). (devops)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 first (git-ignore before any build lands).
- **Foundational (Phase 2)**: T002 depends on T001; blocks T003 and T008.
- **Story (Phase 3)**: T002a (the `/api` mount + backend-test updates) can run right after T001/T002 and before or alongside T003 (same file `main.py`, so do T002a then T003 in sequence). T003 depends on T002 and T002a. T004/T005 (frontend) are independent of the backend tasks; T005 depends on T004's mechanism but is a different file. T006 depends on T004/T005 (build must produce the relative base). T007 depends on T006. T009 is independent. T008 depends on T002+T002a+T003 (backend serving + `/api`) and T004 (frontend base/paths). T010 last of the implementation review.
- **Polish (Phase 4)**: after the story works; T011 docs, T012 validation + log.

### Within the story

- Serving helper (T002) before wiring (T003) before serving tests (T008).
- Frontend base change (T004) before `.env.production` (T005) before the deploy build (T006).
- Tests (T008) then security review (T010) are the last two story tasks.

### Parallel Opportunities

- T004 and T009 touch different files from T003 and can run in parallel with it: `[P]` where marked.
- T011 docs can be drafted in parallel once behaviour is settled.

---

## Parallel Example

```text
# After T002 + T003 (backend serving wired), these touch different files:
Task T004 (frontend-dev): relative API base in frontend/src/api/client.js
Task T009 (backend-dev):  CSP review in backend/app/security_headers.py
```

---

## Implementation Strategy

Single story (technical). Order: T001 → T002 → T002a → T003 → (T004, T005) → T006 → T007 → T009 →
T008 → T010 → T011 → T012. Validate with `quickstart.md` locally (A–C), then rely on the deploy + e2e
check (D) after merge to `main`.

## Notes

- [P] = different files, no dependency on an incomplete task.
- One story (TS-11); every task carries the `[TS-11]` label for traceability.
- No database change, no new dependency, one App Service, one deploy step (D-39, Principle IX/XII).
- Commit after each task or logical group; `backend/app/static/` stays git-ignored.
