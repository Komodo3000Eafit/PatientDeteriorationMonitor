# Quickstart: validate TS-02

These checks show the story works end to end. Run them in Windows PowerShell from the repository root. The final commands are the ones in `backend/README.md`; if the README differs, the README wins.

## Prerequisites

- TS-01 setup done (`backend/.venv` exists; see `backend/README.md`)
- Access to the Neon project `patient-deterioration-monitor` (Neon console)

## 1. Install the new dependencies

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

**Expected**: SQLAlchemy, pg8000 and python-dotenv install without a compiler or local PostgreSQL. pg8000 is pure Python, so Windows Smart App Control doesn't block it (D-31).

## 2. Tests need no database (AC6)

The tests remove `DATABASE_URL` themselves, so they pass even if you have a `backend/.env`. To prove it, you can turn off Wi-Fi first:

```powershell
python -m pytest
```

**Expected**: all tests pass in under 30 s (SC-003), with no `.env` and no network.

## 3. App with no `DATABASE_URL` (AC4)

Set the variable to a single space in this terminal. A variable that is already set wins over `backend/.env`, so your real `.env` doesn't need to be touched; the app strips the space and treats the value as empty. Don't use `""`: in Windows PowerShell 5.1 assigning an empty string **deletes** the variable, so the app would load `backend/.env` instead:

```powershell
$env:DATABASE_URL = " "
python -m uvicorn app.main:app --port 8000
```

In a second terminal: `Invoke-RestMethod http://127.0.0.1:8000/health`

**Expected**: the app starts; `status = ok`, `version = 0.1.0`, `database = unavailable`.

## 4. App with a wrong or unreachable database (AC3, SC-002)

Point the variable at an address that silently drops packets (`192.0.2.1` is a reserved documentation address that never answers), so the connection really waits for the 5 s connect timeout. Start the app and time the call:

```powershell
$env:DATABASE_URL = "postgresql://user:pass@192.0.2.1/neondb?sslmode=require"
python -m uvicorn app.main:app --port 8000
```

In a second terminal:

```powershell
Measure-Command { Invoke-RestMethod http://127.0.0.1:8000/health }
```

**Expected**: the call takes about 5 s and under 6 s; `Invoke-RestMethod http://127.0.0.1:8000/health` then shows `database = unavailable`. The server log shows only `Database check failed (<ErrorType>)`, never the URL or password (AC5).

**Known limitation** (research R6): the connect timeout applies per host address. A host name that resolves to several unreachable addresses can take longer than 5 s; this single-address test checks the timeout itself.

## 5. App with the real database (AC1, AC2, SC-001)

Open a **new** terminal (so `$env:DATABASE_URL` from steps 3–4 is gone, or run `Remove-Item Env:DATABASE_URL`). Follow `backend/README.md` to put the pooled connection string from the Neon console (project → Connect → pooled) in `backend/.env`. Start the app and call `/health`.

**Expected**: `database = ok`. The first call may take a few seconds if Neon was asleep.

## 6. Git hygiene and no secrets (FR-001, SC-004)

```powershell
git status
git grep -n "npg_"
git grep -n -E "ep-[a-z]+-[a-z]+-[a-z0-9]{8}(-pooler)?\.[a-z0-9-]+\.aws\.neon\.tech"
```

**Expected**: `backend/.env` does not appear in `git status`. Neither search finds anything: Neon passwords start with `npg_` and real hosts look like `ep-<word>-<word>-<8 chars>-pooler.<region>.aws.neon.tech`; the docs use only placeholders such as `ep-xxxx`.
