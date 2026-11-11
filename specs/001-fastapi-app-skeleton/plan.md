# Implementation Plan: FastAPI App Skeleton

**Branch**: `001-fastapi-app-skeleton` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-fastapi-app-skeleton/spec.md`

## Summary

TS-01 creates the backend foundation: a minimal FastAPI app in `backend/` with one endpoint, `GET /health`, returning `{"status": "ok", "version": "0.1.0"}`. The version lives only in `backend/app/__init__.py`. A pytest suite runs the endpoint in-process with FastAPI's `TestClient`. Setup, run and test commands for Windows PowerShell are documented in `backend/README.md`, which `DEVELOPMENT.md` links to. Dependencies are installed with pip into `backend/.venv` from a pinned `backend/requirements.txt`. The plan adds no logging setup, settings module or extra folders.

## Technical Context

**Language/Version**: Python 3.13

**Primary Dependencies**: FastAPI 0.162.4, uvicorn 0.54.0 (dev server)

**Storage**: N/A (database comes in TS-02)

**Testing**: pytest 9.2.0 with FastAPI `TestClient` (needs httpx 0.28.1)

**Target Platform**: Developer machines on Windows (PowerShell); the code is OS-independent

**Project Type**: Web service (backend half of the web application)

**Performance Goals**: `/health` answers in under 1 s locally (SC-003); the suite runs in under 30 s (SC-004)

**Constraints**: No secrets, `.env` or external services (FR-007); pip + venv only (no uv, poetry or Docker)

**Scale/Scope**: 1 endpoint, 3 Python files, 1 requirements file, 1 README

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] I. Spec-driven and traceable: every file maps to an FR/AC (see the traceability table below); tests name the AC they verify
- [x] II. Small Scrum story: one story, ~5 small files
- [x] III. Independence: depends on nothing, as in docs/BACKLOG.md; touches no functional-story code
- [x] IV. Multi-agent: backend-dev builds the app and docs, qa-tester writes the tests, security-reviewer reviews; logged in `agent-log.csv` (owners assigned in tasks.md)
- [x] V. Clinical logic: N/A, no clinical logic in this story
- [x] VI. Data privacy: no data and no secrets; `.venv` and `.env` are already git-ignored
- [ ] VII. Tests: the one API endpoint has automated tests. **Exception**: CI and the dependency vulnerability check don't exist until TS-09 (see Complexity Tracking, DECISIONS D-27)
- [x] VIII. Security baseline: `/health` takes no input; it returns only status and version (no internal details); auth and CORS are out of scope (TS-06, TS-04); no secrets
- [x] IX. Deployable at low cost: no new services; standard ASGI app, ready for Azure App Service in TS-10
- [x] X. Stack: Python + FastAPI
- [x] XI. Language: code and docs in English; no UI in this story
- [x] XII. Simplicity: no settings module, logging setup, routers or extra folders; the version is a plain module constant

**Post-design re-check (after Phase 1)**: all items still pass. The design adds no entities, services or abstractions beyond the spec.

## Project Structure

### Documentation (this feature)

```text
specs/001-fastapi-app-skeleton/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── health.md        # Phase 1: GET /health contract
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── __init__.py      # __version__ = "0.1.0" (single source of the version)
│   └── main.py          # FastAPI app; GET /health
├── tests/
│   └── test_health.py   # pytest + TestClient
├── requirements.txt     # pinned: fastapi, uvicorn, pytest, httpx
└── README.md            # PowerShell: setup, run, test

DEVELOPMENT.md           # add link to backend/README.md
```

**Structure Decision**: This is the backend half of the web application layout (`backend/` + `frontend/`); `frontend/` comes in TS-04. There is no `src/` layer or `models/`, `services/` or `api/` subfolders: one endpoint doesn't need them, and later stories add folders when they need them (Principle XII). Tests import `app` because pytest runs from `backend/`. A `pythonpath` setting is not needed: the README runs `python -m pytest` from `backend/`, which puts the current folder on `sys.path`.

### Traceability

| Requirement / AC | Delivered by |
|---|---|
| FR-001 | `backend/` folder, FastAPI app in `app/main.py` |
| FR-002, AC1 | `GET /health` in `app/main.py`; `test_health.py` |
| FR-003, AC4 | `app/__init__.py` `__version__`; consistency test compares the response to `app.__version__`; single source verified by T006 (manual version change) and code review |
| FR-004, AC2 | `tests/test_health.py`; `python -m pytest` |
| FR-005 | `requirements.txt` (pinned) |
| FR-006, AC3 | `backend/README.md` + link in `DEVELOPMENT.md`; checked by hand per [quickstart.md](quickstart.md) |
| FR-007 | No config or env vars are read anywhere |
| Edge cases (404, 405, no internals) | FastAPI defaults; covered by tests in `test_health.py` |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle VII and Workflow step 5 require tests and a dependency check to run in CI before merge, but CI doesn't exist until TS-09 | TS-01 to TS-08 must be merged before the CI pipeline story | Building CI first is impossible: there is no code to test yet. Until TS-09 is merged, each PR includes the local `python -m pytest` output instead, and the dependency vulnerability check is done by TS-09 (DECISIONS D-27) |
