---

description: "Task list for TS-01 FastAPI app skeleton"
---

# Tasks: FastAPI App Skeleton

**Input**: Design documents from `specs/001-fastapi-app-skeleton/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/health.md](contracts/health.md), [quickstart.md](quickstart.md)

**Tests**: MANDATORY. `/health` is an API endpoint (constitution Principle VII). Each automatable acceptance criterion (AC1, AC4) and each edge case gets at least one test. AC2 is verified by running the suite; AC3 by following the README by hand.

**Organization**: This feature has one story (TS-01), so all story tasks carry the `[TS-01]` label.

## Format: `[ID] [P?] [Story] Description (agent)`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **(agent)**: Owner agent, at the end of the line
- All paths are relative to the repository root

---

## Phase 1: Setup

**Purpose**: Declare dependencies and the single source of the version.

- [X] T001 [P] Create `backend/requirements.txt` with exactly these pinned lines: `fastapi==0.162.4`, `uvicorn==0.54.0`, `pytest==9.2.0`, `httpx==0.28.1` (FR-005; research R2) (backend-dev)
- [X] T002 [P] Create `backend/app/__init__.py` containing only a one-line module docstring and `__version__ = "0.1.0"`. This is the only place the version is defined (FR-003, AC4; research R3) (backend-dev)

---

## Phase 2: Foundational

None. TS-01 *is* the foundation. There are no shared prerequisites to build first.

---

## Phase 3: TS-01 FastAPI app skeleton 🎯 MVP

**Goal**: A runnable backend whose `GET /health` returns `{"status": "ok", "version": "<app.__version__>"}`, with passing tests and documented PowerShell commands.

**Independent Test**: From `backend/` with the venv active, `python -m pytest` passes. `python -m uvicorn app.main:app --reload --port 8000` then `Invoke-RestMethod http://127.0.0.1:8000/health` returns `status = ok`, `version = 0.1.0`.

### Implementation

- [X] T003 [TS-01] Create `backend/app/main.py`: import `__version__` from `app`; create `app = FastAPI(title="PatientDeteriorationMonitor API", version=__version__)`; add `@app.get("/health")` returning `{"status": "ok", "version": __version__}`. Add no other fields, routes, middleware, settings, logging or CORS (FR-001, FR-002, FR-007; [contracts/health.md](contracts/health.md); data-model: "`status`: Always `"ok"` when the app answers", "`version`: Equal to `app.__version__`") (backend-dev)
- [X] T004 [P] [TS-01] Create `backend/README.md` with Windows PowerShell commands, run from `backend/`:
  - prerequisites: Python 3.13, and the execution-policy note linking to `../DEVELOPMENT.md` section 2;
  - setup: `py -3.13 -m venv .venv`, `.\.venv\Scripts\Activate.ps1`, `python -m pip install -r requirements.txt`;
  - run: `python -m uvicorn app.main:app --reload --port 8000`, the `/health` and `/docs` URLs, and `Invoke-RestMethod http://127.0.0.1:8000/health` with its expected output;
  - test: `python -m pytest`;
  - a note that the version is changed only in `app/__init__.py`.

  (FR-006, AC3; research R5, R6) (backend-dev)
- [X] T005 [P] [TS-01] Edit `DEVELOPMENT.md`: in section 4 (repository structure), change the `backend/` line to link to [backend/README.md](backend/README.md). In section 8 (live demo checklist), add "see [backend/README.md](backend/README.md)" to the "Run the automated tests" item. Change nothing else (FR-006) (backend-dev)
- [X] T006 [TS-01] Validate locally per [quickstart.md](quickstart.md) steps 1, 3, 4 and 5: create the venv, install, start uvicorn and call `/health`; confirm the version change is reflected, then revert it; confirm `git status` doesn't list `backend/.venv/`. Fix T001–T005 if any step fails (AC1, AC3, AC4) (backend-dev)

### Tests and review

- [X] T007 [TS-01] Create `backend/tests/test_health.py` using `fastapi.testclient.TestClient(app.main.app)` with these tests, each with a docstring naming what it verifies:
  - `test_health_returns_ok_and_version` (AC1): status 200, JSON is exactly `{"status": "ok", "version": app.__version__}`;
  - `test_health_version_consistency` (AC4, consistency check): `response.json()["version"] == app.__version__` and also equals the OpenAPI `info.version`. This only checks consistency; that the version lives in **one place** is verified by T006 (manual version change) and by code review;
  - `test_unknown_path_returns_404` (edge case): `GET /does-not-exist` → 404, body `{"detail": "Not Found"}`;
  - `test_health_rejects_post` (edge case): `POST /health` → 405;
  - `test_health_exposes_no_internal_details` (edge case): the response keys are exactly `{"status", "version"}`.

  Run `python -m pytest` from `backend/` and confirm all pass in under 30 s (AC2, SC-004). Do not add `conftest.py` or `pytest.ini` (research R4) (qa-tester)
- [X] T008 [TS-01] Review `backend/` code read-only: no secrets or `.env` files, `/health` leaks no internal details, dependencies are pinned, `.venv` is git-ignored. Report findings; don't change code (Principles VI, VIII). The dependency vulnerability scan is **not** part of this task: it runs in CI from TS-09 on (DECISIONS D-27) (security-reviewer)

**Checkpoint**: TS-01 is complete. Every backend story can now build on `backend/app/main.py`.

---

## Phase 4: Polish

None. Keeping docs in sync is covered by T004–T005. The backlog's Spec column already links this feature. Its Status is set to ✅ when the PR is merged.

---

## Dependencies & Execution Order

- **T001, T002** (Setup): no dependencies; can run in parallel.
- **T003**: depends on T002 (imports `__version__`).
- **T004, T005**: depend only on the plan; can run in parallel with T003.
- **T006**: depends on T001–T005.
- **T007**: depends on T003 (and T001 for installed packages).
- **T008**: last; depends on T001–T007.
- **Story dependencies**: none (TS-01 depends on nothing, per docs/BACKLOG.md).

## Parallel Example

```text
# Round 1 (backend-dev):
Task: "Create backend/requirements.txt (T001)"
Task: "Create backend/app/__init__.py (T002)"

# Round 2 (backend-dev):
Task: "Create backend/app/main.py (T003)"
Task: "Create backend/README.md (T004)"
Task: "Link README from DEVELOPMENT.md (T005)"
```

## Implementation Strategy

TS-01 is the whole MVP: T001 → T003 → T006 → T007 → T008, with T002, T004 and T005 filling in around them. Stop after T007 to confirm the tests pass before the security review. After that, commit (`TS-01: FastAPI app skeleton with /health`), push, and open the PR. Until TS-09 adds CI, paste the local `python -m pytest` output into the PR description (DECISIONS D-27). The PR includes the agent activity log (`specs/001-fastapi-app-skeleton/agent-log.csv`, via `scripts/log-agent.ps1`).

## Notes

- The orchestrator assigns each task to its agent and logs `assigned` / `started` / `done` rows (see `docs/agents.md`).
- Testing runs after implementation, as the project template orders it (qa-tester, then security-reviewer). It doesn't use test-first order.
- Do not add anything not listed here (Principle XII): no logging, settings, routers, `src/` layer or extra folders.
