# Research: FastAPI App Skeleton (TS-01)

The technical context had no open questions: the stack and tooling came with the `/speckit-plan` input. This file records the decisions and the reasons for them.

## R1. Dependency management

- **Decision**: pip + a virtual environment in `backend/.venv`; pinned `==` versions in `backend/requirements.txt`.
- **Rationale**: It comes with Python, so teammates install nothing extra, and pinned versions give everyone the same setup. `.venv` is already in the root `.gitignore`.
- **Alternatives considered**: uv (fast, and already installed for Spec Kit, but adds a tool to the app workflow), poetry/pdm (lock files and config we don't need), Docker (heavy on student laptops; rejected by Principle XII).

## R2. Pinned versions (latest on PyPI, 2026-11-10)

| Package | Version | Why |
|---|---|---|
| fastapi | 0.162.4 | Web framework (Principle X) |
| uvicorn | 0.54.0 | ASGI server to run the app locally |
| pytest | 9.2.0 | Test runner |
| httpx | 0.28.1 | Required by FastAPI's `TestClient` |

- **Decision**: One `requirements.txt` for runtime and test dependencies.
- **Rationale**: It's the simplest option. A separate `requirements-dev.txt` can come later if deployment (TS-10) needs a slimmer install.
- **Alternatives considered**: `fastapi[standard]` (pulls in many extra packages we don't use), split runtime/dev files (premature).

## R3. Single source of the version

- **Decision**: `__version__ = "0.1.0"` in `backend/app/__init__.py`; `main.py` imports it and passes it to both `FastAPI(version=...)` and the `/health` response.
- **Rationale**: Changing one line updates `/health` and the OpenAPI docs (AC4).
- **Alternatives considered**: `pyproject.toml` + `importlib.metadata` (needs the package installed), a settings module or env var (rejected in the plan input; more moving parts).

## R4. Testing approach

- **Decision**: FastAPI `TestClient` in `backend/tests/test_health.py`, run with `python -m pytest` from `backend/`.
- **Rationale**: Tests run the app in-process with no server to start (FR-004). `python -m` puts `backend/` on `sys.path`, so `import app` works without a `conftest.py` or pytest config.
- **Alternatives considered**: Running uvicorn and calling it over HTTP (slower and fragile), adding `pythonpath` to a `pytest.ini` (one more file for no gain).

## R5. Running locally

- **Decision**: `python -m uvicorn app.main:app --reload --port 8000` from `backend/`.
- **Rationale**: Port 8000 is uvicorn's default and a familiar one; `--reload` speeds up development. Using `python -m` avoids PATH problems with venv scripts on Windows.
- **Alternatives considered**: The `fastapi dev` CLI (needs `fastapi[standard]`).

## R6. PowerShell venv activation

- **Decision**: The README uses `.\.venv\Scripts\Activate.ps1`. It notes that the execution-policy setting already in `DEVELOPMENT.md` section 2 is required.
- **Rationale**: Every teammate is on Windows PowerShell; the execution policy is the usual stumbling block, and it's already documented.
