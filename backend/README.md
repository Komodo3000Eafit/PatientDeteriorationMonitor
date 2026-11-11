# PatientDeteriorationMonitor — Backend

FastAPI application. All commands are for Windows PowerShell and are run from the `backend/` folder.

## Prerequisites

- Python **3.13** (check with `py -3.13 --version`).
- Local PowerShell scripts allowed for your user, so the virtual environment can be activated. See [DEVELOPMENT.md, section 2 ("Allow local PowerShell scripts")](../DEVELOPMENT.md#allow-local-powershell-scripts).

## Setup

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

## Run

```powershell
python -m uvicorn app.main:app --reload --port 8000
```

- Health check: <http://127.0.0.1:8000/health>
- Interactive API docs: <http://127.0.0.1:8000/docs>

In a second terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

Expected output:

```text
status version
------ -------
ok     0.1.0
```

## Test

```powershell
python -m pytest
```

## Version

The app version is defined in one place only: `__version__` in `app/__init__.py`. Change it there; `/health` and `/docs` pick it up automatically.
