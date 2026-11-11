# Quickstart: validate TS-01

These checks show the story works end to end. Run them in Windows PowerShell from the repository root. The final commands are the ones in `backend/README.md`; if the README differs, the README wins.

## Prerequisites

- Python 3.13 (`py -3.13 --version`)
- Script execution allowed for your user (`DEVELOPMENT.md` section 2)

## 1. Setup (AC3)

```powershell
cd backend
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

**Expected**: install finishes without errors; no `.env` or secrets are requested (FR-007).

## 2. Run the tests (AC2)

```powershell
python -m pytest
```

**Expected**: all tests pass, in under 30 seconds (SC-004).

## 3. Run the app and call `/health` (AC1, AC3)

```powershell
python -m uvicorn app.main:app --reload --port 8000
```

In a second terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

**Expected**: `status = ok`, `version = 0.1.0` (see [contracts/health.md](contracts/health.md)). The interactive docs at `http://127.0.0.1:8000/docs` show version `0.1.0`.

## 4. Version comes from one place (AC4)

Change `__version__` in `backend/app/__init__.py` (for example to `0.1.1`), call `/health` again (the `--reload` server picks up the change), and confirm the new value. Then revert the change.

## 5. Git hygiene

```powershell
git status
```

**Expected**: `backend/.venv/` does not appear (git-ignored).
