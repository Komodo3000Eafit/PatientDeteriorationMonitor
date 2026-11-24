# PatientDeteriorationMonitor

A **digital twin of the patient after triage**: the app follows each patient's vital signs, scores every reading with a clinical early-warning scale (NEWS2) and warns the clinical team when a patient is getting worse, so they can re-triage them to a more urgent level in time.

> **Academic prototype: not a certified medical device.** All patients and readings are synthetic. Built as a university project on Spec-Driven Development (SDD) with GitHub Spec Kit and a team of AI agents.

**Live app:** https://pmd-backend-dndva3fceca5fvdy.brazilsouth-01.azurewebsites.net
(free Azure plan: the first request after a while can take 1–3 minutes while the app wakes up)

## What the app does

The interface is in **Spanish by default**, with a switch to English. There are two roles: **doctor** and **nurse**.

| Story | Feature | Who |
|---|---|---|
| US-01 | Register a patient with their initial triage level (codes `PAT-007`, `PAT-008`, …) | Nurse |
| US-02 | Patient list with the latest score and risk band, refreshed every 15 s | Doctor, nurse |
| US-03 | Record a vital-signs reading; it is validated and scored with NEWS2 (risk band low / low-medium / medium / high) | Nurse |
| US-04 | Re-triage suggestion when a reading crosses into the medium or high band; the doctor accepts (changes the triage level) or dismisses it | Doctor |
| US-05 | Patient detail page: patient data, current reading, triage history | Doctor, nurse |
| US-08 | Deterioration prediction: a warning when the score rises across the last 3 readings | Doctor, nurse |
| US-06, US-07, US-09, US-10 | Vital-signs chart, alert acknowledgement, list filter/sort, CSV export | Built live in the final class session |

The triage level **never changes automatically**: the app only suggests, and a clinician decides. Current status of every story: [docs/BACKLOG.md](docs/BACKLOG.md) and [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md).

### Demo accounts and data

- Users `demo.doctor` and `demo.nurse` (passwords are not in the repository; ask the team).
- Demo patients `PAT-001` to `PAT-006` follow three scenarios: stable, slow deterioration and rapid deterioration. A simulator (`python -m app.simulator`) adds synthetic readings for them; see [DEVELOPMENT.md](DEVELOPMENT.md).

## Tech stack

| Part | Technology |
|---|---|
| Frontend | React 19 + Vite, React Router, CSS Modules with design tokens, lucide-react icons |
| Backend | Python 3.13, FastAPI, SQLAlchemy, Alembic migrations |
| Database | PostgreSQL on Neon (free plan) |
| Auth | Username and password, signed tokens, role checks (doctor / nurse) |
| Hosting | One Azure App Service: FastAPI serves the API under `/api` and the built React app |
| CI/CD | GitHub Actions: backend tests, frontend tests and dependency audit on every PR; deploy to Azure after every merge to `main` (OIDC, no stored Azure passwords) |
| Clinical scale | NEWS2, isolated in a replaceable module (`backend/app/scoring/`) |

## How it was built

Every feature goes through **GitHub Spec Kit**: specify → clarify → plan → tasks → analyze → implement. Each story has its own folder in [`specs/`](specs/) with the spec, plan, contracts, tasks and an activity log of the agents that worked on it.

The implementation is done by a **team of six Claude Code agents** with separate roles ([docs/agents.md](docs/agents.md)):

| Agent | Role |
|---|---|
| orchestrator | Assigns each task, verifies the result against the acceptance criteria, keeps the log |
| backend-dev | FastAPI endpoints, models, migrations, scoring module |
| frontend-dev | React pages and components, translations |
| qa-tester | Writes the tests first, runs the suites, maps every acceptance criterion to a test |
| security-reviewer | Read-only review: auth, validation, secrets, dependencies |
| devops | CI/CD, deployment, checks on a temporary database branch |

Project rules live in the constitution (`.specify/memory/constitution.md`); every design decision is recorded in [docs/DECISIONS.md](docs/DECISIONS.md), and the shared vocabulary (English and Spanish) in [docs/GLOSSARY.md](docs/GLOSSARY.md).

## Quality and security

- Automated tests on the critical paths (scoring, API, auth, UI), run in CI on every PR; `main` is protected and only accepts merges with all checks green.
- Every API route requires sign-in except `/health`; role checks per action; inputs validated with fixed, safe error messages.
- Secrets only in GitHub environment secrets and App Service settings, never in the repository.
- Dependency audit in CI (`pip` and `npm audit`), security headers, forward-only database migrations.

## Documentation

| Document | Contents |
|---|---|
| [DEVELOPMENT.md](DEVELOPMENT.md) | Local setup, running the app, Spec Kit, git workflow, AI tools |
| [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) | Where the project is and what comes next |
| [docs/BACKLOG.md](docs/BACKLOG.md) | Technical and functional user stories |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decision log (D-01, D-02, …) |
| [docs/GLOSSARY.md](docs/GLOSSARY.md) | Terms used in the app, the API and the specs |
| [docs/agents.md](docs/agents.md) | The AI agent team and how to run it |
| [docs/ASSIGNMENT.md](docs/ASSIGNMENT.md) | Summary of the course assignment |

## Repository layout

```
.
├── backend/              FastAPI app (Python) + tests and database migrations
│   ├── app/
│   │   ├── main.py           App entry point; mounts the API under /api and serves the frontend
│   │   ├── db.py             Database engine and session (Neon via DATABASE_URL)
│   │   ├── models.py         SQLAlchemy models (users, patients, vital_signs, reading_scores, triage_events, alerts)
│   │   ├── auth.py           Login endpoint and get_current_user dependency
│   │   ├── passwords.py      Password hashing
│   │   ├── patients.py       Patient registration and detail (US-01, US-05)
│   │   ├── patient_list.py   Patient list with latest scores (US-02)
│   │   ├── readings.py       Save and score a reading — the single creation point (US-03)
│   │   ├── readings_api.py   Readings API routes (US-03)
│   │   ├── retriage.py / retriage_api.py      Re-triage suggestions (US-04)
│   │   ├── prediction.py / prediction_api.py  Deterioration prediction (US-08)
│   │   ├── scoring/          Replaceable clinical scoring module — import only from app.scoring
│   │   │   ├── base.py           Scoring interface
│   │   │   ├── news2.py          NEWS2 implementation (the only place NEWS2 is computed)
│   │   │   └── limits.py         Vital-sign ranges
│   │   ├── simulator.py      Synthetic vital-signs generator (tests and demos only)
│   │   ├── seed_demo_users.py / demo_patients.py  Seed data for demos
│   │   └── security_headers.py / static_serving.py  Security headers and SPA fallback
│   ├── requirements.txt  Python dependencies
│   ├── alembic.ini + migrations/  Forward-only database migrations
│   └── tests/            Backend tests (pytest)
├── frontend/             React app (Vite)
│   └── src/
│       ├── main.jsx / App.jsx   Entry point and routes
│       ├── pages/            Route pages (login, patient-list, patient-detail, register-patient, record-reading, not-found)
│       ├── components/       Shared UI (AppShell, Card, Button, StatusBadge, TriageLevelBadge, Icons)
│       ├── api/              API client (calls /api, relative URLs)
│       ├── auth/             Auth context and RequireAuth route guard
│       ├── hooks/ · utils/   Reusable hooks and helpers
│       ├── i18n/             Spanish (default) and English strings
│       └── styles/           Design tokens and global styles
├── specs/                One Spec Kit feature per user story (spec, plan, tasks, contracts, agent log)
├── docs/                 Project context: PROJECT_STATUS, BACKLOG, DECISIONS, GLOSSARY, agents, ASSIGNMENT
├── scripts/              Helper scripts (e.g. the agent activity log)
├── .specify/             Spec Kit configuration, templates and the constitution
├── .github/workflows/    CI (ci.yml: tests + dependency check) and deploy (deploy.yml: build and deploy to Azure)
├── .claude/ · .kiro/     AI assistant agents, skills and settings (kept in sync)
├── AGENTS.md · CLAUDE.md Always-on project context for the AI assistants
└── DEVELOPMENT.md        How to set up and run the project locally
```
