# PatientDeteriorationMonitor — Development Guide

This guide is for **team members developing the project**. It explains how to set up your computer, which tools and accounts you need, and how we work with Git, GitHub Spec Kit and our AI agents.

> **Where are we?** Check [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) for the current step before you start.
>
> For how to install and use the application itself, see [README.md](README.md).

---

## 1. Accounts and licenses

Every team member needs their **own** accounts. The live demo requires each student to run the full Spec-Driven Development (SDD) process from their own computer, so do not rely on a teammate's setup.

| Account | Required | Cost | How to get it |
|---|---|---|---|
| GitHub account with access to this repository | Yes | Free | Ask the repo owner to add you as a collaborator |
| **Claude** plan with Claude Code (Pro or higher) | Yes, to run the Claude agents | Paid | [claude.ai](https://claude.ai) |

---

## 2. Software to install

Install these **once per computer** (they are global tools, not project-specific). Commands are for Windows PowerShell.

| Tool | Version | Notes |
|---|---|---|
| Git | Latest | <https://git-scm.com/downloads> |
| VS Code | Latest | <https://code.visualstudio.com/> |
| Python | **3.13.x** | <https://www.python.org/downloads/> — check *"Add python.exe to PATH"*. Do **not** use 3.15: some dependencies of Spec Kit have no Windows build for it yet |
| uv | Latest | `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 \| iex"` |
| Specify CLI (GitHub Spec Kit) | **v1.3.3** (pinned — everyone must use the same version) | `uv tool install specify-cli --python 3.13 --from git+https://github.com/github/spec-kit.git@v1.3.3` |
| Claude Code | Latest | `irm https://claude.ai/install.ps1 \| iex` |
| Node.js | **26 LTS** | Needed for the React frontend (check with `node -v`) — <https://nodejs.org/> |
| PostgreSQL | Version defined in the technical plan | Installation method (local install or Docker) will be confirmed in the technical user stories |

### Allow local PowerShell scripts

Windows blocks `.ps1` scripts by default. The project's helper scripts (e.g. `scripts/log-agent.ps1`) need them enabled for your user (no admin rights required):

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### VS Code extensions

- **Claude Code** (Anthropic)

> GitHub Copilot is **not used for now** (see `docs/DECISIONS.md`, D-15).

### Verify your installation

Close and reopen VS Code (so it picks up the new PATH), then run in its terminal:

```powershell
git --version
python --version      # should show 3.13.x
uv --version
specify check         # should end with "Specify CLI is ready to use!"
claude --version
node --version
```

Then log in to Claude Code by running `claude` once and following the prompts (type `/exit` to leave).

---

## 3. Get the project

> **Clone outside OneDrive** (e.g. `C:\Users\<you>\Documents\GitProjects\`). OneDrive sync locks folders and can revert files inside a Git repo.

```powershell
git clone https://github.com/Komodo3000Eafit/PatientDeteriorationMonitor.git
cd PatientDeteriorationMonitor
git config user.name "Your Name"
git config user.email "your-github-email@example.com"
```

> ⚠️ **Do not run `specify init`.** Spec Kit is already initialized and committed in the repository (`.specify/`, `.claude/`). Running it again can overwrite shared files.

Open the folder in VS Code (*File → Open Folder*). To confirm Spec Kit works, open Claude Code and type `/speckit` — the list of `speckit-*` commands should appear.

---

## 4. Repository structure

```
.specify/              Spec Kit: constitution, templates, scripts, integration config (shared)
  memory/constitution.md   Project principles — every spec, plan and task is checked against it
.claude/
  skills/speckit-*/    Spec Kit commands for Claude Code (generated)
  agents/              Our custom Claude agents
specs/                 One folder per user story: spec.md, plan.md, tasks.md, agent-log.csv
scripts/               Helper scripts (log-agent.ps1: agent activity log)
docs/
  PROJECT_STATUS.md    Current step, roadmap and onboarding checklist
  DECISIONS.md         Decision log (why things are the way they are)
  GLOSSARY.md          Ubiquitous language: one name per concept, English (code/API) and Spanish (UI)
  ASSIGNMENT.md        English summary of the course assignment
  agents.md            Agent team: roles, tools, responsibilities
backend/               FastAPI application (setup, run and test: backend/README.md)
frontend/              React application, Vite (setup, run and test: frontend/README.md)
README.md              How to install and use the app
DEVELOPMENT.md         This guide
CLAUDE.md              Project context Claude Code reads automatically
```

---

## 5. How we work: user stories + Spec Kit

### 5.1 User story rules

- Stories follow the Scrum format: *As a \<role\>, I want \<goal\>, so that \<benefit\>*, with acceptance criteria.
- Each story is **short, readable and independent**: it can be specified, built and tested on its own, without waiting for or modifying another story.
- Each story has a type:
  - **Technical (TS-xx):** sets up the architecture the app needs — e.g. create and connect the PostgreSQL database, set up the FastAPI app, deploy it, connect the frontend to the backend. Technical stories form the **baseline foundation**.
  - **Functional (US-xx):** adds an app feature on top of that foundation. Functional stories may rely on the baseline, but **never on another functional story**.
- **One user story = one Spec Kit feature** = one folder in `specs/` = one branch = one pull request.
- **Use the glossary terms.** Specs, code, API fields and UI texts use the names in [docs/GLOSSARY.md](docs/GLOSSARY.md). A story that introduces a new term adds it to the glossary in the same PR (D-40).

### 5.2 Spec Kit workflow for each story

Run these in Claude Code, from the project folder:

| Step | Command | Output |
|---|---|---|
| 1. Specify | `/speckit-specify <story description>` | Creates the feature branch and `specs/<nnn-name>/spec.md` |
| 2. Clarify (recommended) | `/speckit-clarify` | Resolves ambiguities in the spec |
| 3. Plan | `/speckit-plan <technical notes>` | `plan.md` + design docs |
| 4. Tasks | `/speckit-tasks` | `tasks.md` |
| 5. Analyze (recommended) | `/speckit-analyze` | Consistency report across spec, plan and tasks |
| 6. Implement | `/speckit-implement` | Code + tests |

Then run the tests, commit, push and open a pull request.

> The constitution (`.specify/memory/constitution.md`) is shared by the whole team. Only change it through a pull request agreed with the team, using `/speckit-constitution`.

---

## 6. AI agents

We use a team of custom **Claude Code subagents** with differentiated roles (required for grading Modality B).

- Agents live in `.claude/agents/`. Invoke them by asking Claude, e.g. *"Use the qa-tester agent to write tests for this story"*.
- The **orchestrator** decides which agent works on each part of a story; agents can also be called manually.
- After adding or editing an agent file, restart Claude Code so it is loaded. To check, ask Claude: *"List the custom subagents available in this project"*.

The list of agents, their roles and responsibilities is documented in [`docs/agents.md`](docs/agents.md).

---

## 7. Git workflow

- `main` always contains working, reviewed code. **Never push directly to `main`** (exception: setup steps during the solo dry run, see `docs/DECISIONS.md` D-20).
- Work on the branch Spec Kit creates for your story (`/speckit-specify` creates it automatically).
- Commit messages: short and descriptive, referencing the story ID, e.g. `US-03: add vital signs chart`.
- Open a pull request to `main`; at least one teammate reviews it; the [CI](#71-continuous-integration-ci) checks must pass before merging.
- Pull often: `git checkout main && git pull`, then start new stories from an updated `main`.
- When your PR completes a roadmap step, update [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) in the same PR; when it changes a decision, add an entry to [docs/DECISIONS.md](docs/DECISIONS.md).

### Never commit

- Real patient data (use only public de-identified datasets or synthetic data)
- Passwords, API keys, tokens or `.env` files (e.g. `backend/.env` with `DATABASE_URL`, `AUTH_SECRET` and the demo passwords)
- Personal tool settings such as `.claude/settings.local.json`

### 7.1 Continuous integration (CI)

GitHub Actions runs `.github/workflows/ci.yml` automatically. It needs no secrets and no database.

**What runs and when.** Three independent checks, on every pull request to `main` (opened, reopened or with new commits, also from forks) and on every push or merge to `main`:

| Check | What it does | Fails when |
|---|---|---|
| `Backend tests` | installs `backend/requirements.txt`, runs pytest | install fails, any test fails or errors, or 10 minutes pass |
| `Frontend tests` | `npm ci`, Vitest, `npm run build` | `npm ci` fails (e.g. lock file out of date), any test fails, the build fails, or 10 minutes pass |
| `Dependency check` | `pip-audit` (backend) and `npm audit` (frontend) | any backend vulnerability; a high or critical frontend vulnerability; an advisory database can't be reached; or 10 minutes pass |

On a PR they show as `CI / Backend tests (pull_request)` and so on. There are no path filters: all three run on every change. A push to another branch **without** a PR to `main` runs nothing.

**Reading a failure.** On the PR, open the **Checks** tab (or click **Details** next to the red ✗) → open the failed step. The step names say what failed: `Install backend requirements`, `Run backend tests`, `Install frontend dependencies`, `Run frontend tests`, `Build frontend`, `Install pip-audit`, `Audit backend dependencies`, `Audit frontend dependencies`. Typical causes:

- A failing test: the pytest or Vitest summary at the end of the log names it.
- `npm ci` fails: `package-lock.json` is out of date. Run `npm install` in `frontend/` and commit the lock file.
- An audit finding: the log shows the package, its version, the advisory ID and the fixed version (see "When the dependency check fails" below).
- The advisory database or a package registry was unreachable: use **Re-run failed jobs** first.

**Run the same checks locally** before pushing. Windows PowerShell, starting from the repository root, in this order (the backend virtual environment from [backend/README.md](backend/README.md) must exist):

```powershell
# Backend tests
cd backend
.\.venv\Scripts\Activate.ps1
python -m pytest
cd ..

# Frontend tests
cd frontend
npm ci
npm test
npm run build
cd ..

# Dependency check (backend virtual environment still active)
pip install pip-audit==2.10.1
pip-audit -r backend/requirements.txt
cd frontend
npm audit --audit-level=high
cd ..
```

Expected: all pytest and Vitest tests pass and `frontend/dist/` is built; pip-audit prints "No known vulnerabilities found" and npm prints "found 0 vulnerabilities".

- Normal, not failures: pytest reports `1 warning` (a Starlette/httpx deprecation warning); pip may print a "new release of pip is available" notice (don't upgrade as part of this); `npm ci` also prints "found 0 vulnerabilities", but the audit result that counts is the one from `npm audit --audit-level=high`.
- `pip-audit` is a CI/local tool only; it is **not** in `requirements.txt`.
- Windows PowerShell 5.1 may show a red `NativeCommandError` around the pip-audit output because pip-audit prints its summary to stderr. That is not a failure: check the exit code with `$LASTEXITCODE` (0 = passed).

**When the dependency check fails.**

- **Fix it (preferred):** upgrade the pinned version — backend in `backend/requirements.txt`; frontend in `frontend/package.json`, then `npm install` and commit `package-lock.json`.
- **Accept the risk (only if no fix is available or it doesn't affect us):** backend: add `--ignore-vuln <ID>` to the `pip-audit` line in `ci.yml` with the reason in a YAML comment; frontend: add an `overrides` entry in `frontend/package.json` with the reason in the PR description (JSON has no comments). In both cases add an entry to [docs/DECISIONS.md](docs/DECISIONS.md).
- A newly published advisory can turn CI red without any code change. That is intended.

**Branch protection (repo owner).** **On for `main` since 2026-11-19** (ruleset: pull request required, the three checks required, force pushes blocked), so you can't push to `main` directly: open a PR from your story branch. For reference, how it was set up (free, because the repository is public):

1. Wait until the three checks have run at least once (they only appear in the list after that).
2. On GitHub: **Settings → Branches →** add a branch protection rule (or a ruleset) for `main`.
3. Turn on **Require a pull request before merging** and **Require status checks to pass before merging**.
4. Select `Backend tests`, `Frontend tests` and `Dependency check`, then save. **Require branches to be up to date before merging** is optional.

---

## 8. Preparing for the live demo

Each student will be assigned a user story during the demo and must build it **from their own computer** in roughly 5–10 minutes. Before demo day, make sure you can:

- [ ] Run every command in section 2 ("Verify your installation") without errors
- [ ] Run the app locally (backend, frontend and database, see "Run the app locally" below) — details: [backend/README.md](backend/README.md) (database setup: [Database connection](backend/README.md#database-connection)) and [frontend/README.md](frontend/README.md)
- [ ] Run the automated tests (see [backend/README.md](backend/README.md))
- [ ] Run the three CI checks locally (see [7.1](#71-continuous-integration-ci))
- [ ] Complete the full Spec Kit workflow for a small practice story
- [ ] Invoke each agent in Claude Code

### Run the app locally

Use two terminals, both starting from the repository root.

One-time setup (after installing the backend requirements):

1. Copy `backend/.env.example` to `backend/.env` (git-ignored) and fill it in. Keep your `DATABASE_URL`, then set:
   - `AUTH_SECRET`: generate it with `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
   - `DEMO_DOCTOR_PASSWORD` and `DEMO_NURSE_PASSWORD`: at least 8 characters each.
2. In `backend/` with the virtual environment active, run `alembic upgrade head`, then `python -m app.seed_demo_users` to create the demo accounts.

Terminal 1 — backend (API at `http://localhost:8000`):

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload --port 8000
```

Terminal 2 — frontend:

```powershell
cd frontend
npm install        # first time only
npm run dev
```

Then open **http://localhost:5173** (use `localhost`, not `127.0.0.1`). The page shows whether the API and the database are working. Sign in as `demo.doctor` or `demo.nurse` with the password from your `backend/.env`.

- Authentication settings and the demo-user command: see [backend/README.md](backend/README.md#authentication).
- `CORS_ORIGINS` (backend): the default (`http://localhost:5173`) is fine locally — see [backend/README.md](backend/README.md#allowed-frontend-origins-cors).
- `VITE_API_BASE_URL` (frontend): the default (`http://localhost:8000`) is fine locally — see [frontend/README.md](frontend/README.md#configuration).

---

## 9. Troubleshooting

| Problem | Fix |
|---|---|
| `uv tool install` fails building `pyyaml` / asks for *Microsoft Visual C++* | You are on Python 3.15. Add `--python 3.13` to the install command, or install Python 3.13 |
| `specify`, `uv` or `claude` is not recognized | Fully close and reopen VS Code (not just the terminal). If it still fails, run `uv tool update-shell` and reopen |
| `No such option: --ai` | Spec Kit v1.x replaced `--ai` with `--integration`. You should not need `specify init` anyway (see section 3) |
| `... la ejecución de scripts está deshabilitada en este sistema` / `running scripts is disabled on this system` | Run `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` (see section 2) |
| `Remove-Item` fails with *permission denied*, or files go back to an older version | The repo is inside OneDrive. Clone it to a folder outside OneDrive (see section 3) |
| `/speckit-*` commands don't appear | Make sure VS Code / Claude Code is opened **in the project folder** |
