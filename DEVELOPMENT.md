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
| Node.js | LTS | Needed for the React frontend — <https://nodejs.org/> |
| PostgreSQL | Version defined in the technical plan | Installation method (local install or Docker) will be confirmed in the technical user stories |

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

```powershell
git clone https://github.com/<owner>/PatientDeteriorationMonitor.git
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
  settings.json        Shared Claude Code settings: hooks that log agent activity
specs/                 One folder per user story: spec.md, plan.md, tasks.md, agent-log.md, agent-report.md
logs/agent-activity/   Automatic agent activity log, one file per branch (commit it)
scripts/               Helper scripts (agent activity logger and report)
docs/
  PROJECT_STATUS.md    Current step, roadmap and onboarding checklist
  DECISIONS.md         Decision log (why things are the way they are)
  ASSIGNMENT.md        English summary of the course assignment
  agents.md            Agent team: roles, tools, responsibilities
backend/               FastAPI application (created by the technical user stories)
frontend/              React application (created by the technical user stories)
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
- After adding or editing an agent file, restart Claude Code or run `/agents` so it is loaded.

The list of agents, their roles and responsibilities is documented in [`docs/agents.md`](docs/agents.md).

---

## 7. Git workflow

- `main` always contains working, reviewed code. **Never push directly to `main`** (exception: setup steps during the solo dry run, see `docs/DECISIONS.md` D-20).
- Work on the branch Spec Kit creates for your story (`/speckit-specify` creates it automatically).
- Commit messages: short and descriptive, referencing the story ID, e.g. `US-03: add vital signs chart`.
- Open a pull request to `main`; at least one teammate reviews it; CI tests must pass before merging.
- Pull often: `git checkout main && git pull`, then start new stories from an updated `main`.
- When your PR completes a roadmap step, update [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) in the same PR; when it changes a decision, add an entry to [docs/DECISIONS.md](docs/DECISIONS.md).

### Never commit

- Real patient data (use only public de-identified datasets or synthetic data)
- Passwords, API keys, tokens or `.env` files
- Personal tool settings such as `.claude/settings.local.json`

---

## 8. Preparing for the live demo

Each student will be assigned a user story during the demo and must build it **from their own computer** in roughly 5–10 minutes. Before demo day, make sure you can:

- [ ] Run every command in section 2 ("Verify your installation") without errors
- [ ] Run the app locally (backend, frontend and database)
- [ ] Run the automated tests
- [ ] Complete the full Spec Kit workflow for a small practice story
- [ ] Invoke each agent in Claude Code

---

## 9. Troubleshooting

| Problem | Fix |
|---|---|
| `uv tool install` fails building `pyyaml` / asks for *Microsoft Visual C++* | You are on Python 3.15. Add `--python 3.13` to the install command, or install Python 3.13 |
| `specify`, `uv` or `claude` is not recognized | Fully close and reopen VS Code (not just the terminal). If it still fails, run `uv tool update-shell` and reopen |
| `No such option: --ai` | Spec Kit v1.x replaced `--ai` with `--integration`. You should not need `specify init` anyway (see section 3) |
| `/speckit-*` commands don't appear | Make sure VS Code / Claude Code is opened **in the project folder** |
