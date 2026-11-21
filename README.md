# PatientDeteriorationMonitor
Student project to develop a monitor patient deterioration application using spec kit for SDD from github

- Developing the project: [DEVELOPMENT.md](DEVELOPMENT.md)
- Terms used in the app, the API and the specs (English and Spanish): [docs/GLOSSARY.md](docs/GLOSSARY.md)

## Repository layout

```
.
├── backend/              FastAPI app (Python) + tests and database migrations
│   ├── app/
│   │   ├── main.py           App entry point; mounts the API under /api and serves the frontend
│   │   ├── db.py             Database engine and session (Neon via DATABASE_URL)
│   │   ├── models.py         SQLAlchemy models (users, patients, vital_signs, triage_events, alerts, …)
│   │   ├── auth.py           Login endpoint and get_current_user dependency
│   │   ├── passwords.py      Password hashing
│   │   ├── patients.py       Patient registration and listing
│   │   ├── readings.py       Save and score a vital-signs reading
│   │   ├── readings_api.py   Readings API routes
│   │   ├── scoring/          Replaceable clinical scoring module — import only from app.scoring
│   │   │   ├── base.py           Scoring interface
│   │   │   ├── news2.py          NEWS2 implementation (the only place NEWS2 is computed)
│   │   │   └── limits.py         Vital-sign ranges
│   │   ├── simulator.py      Synthetic vital-signs generator (tests and demos only)
│   │   ├── seed_demo_users.py / demo_patients.py  Seed data for demos
│   │   ├── security_headers.py / static_serving.py  Security headers and SPA fallback
│   │   ├── requirements.txt  Python dependencies
│   │   └── alembic.ini + migrations/  Forward-only database migrations
│   └── tests/            Backend tests (pytest)
├── frontend/             React app (Vite)
│   └── src/
│       ├── main.jsx / App.jsx   Entry point and routes
│       ├── pages/            Route pages
│       ├── components/       Shared UI (StatusBadge, TriageLevelBadge, Card, Button, Icons)
│       ├── api/              API client (calls /api, relative URLs)
│       ├── auth/             Auth context and RequireAuth route guard
│       ├── hooks/ · utils/   Reusable hooks and helpers
│       ├── i18n/             Spanish (default) and English strings
│       └── styles/           Design tokens and global styles
├── specs/                One Spec Kit feature per user story (spec, plan, tasks, contracts)
├── docs/                 Project context: PROJECT_STATUS, BACKLOG, DECISIONS, GLOSSARY, agents, ASSIGNMENT
├── scripts/              Helper scripts (e.g. the agent activity log)
├── .specify/             Spec Kit configuration, templates and the constitution
├── .github/
│   └── workflows/        CI (ci.yml: tests + dependency check) and deploy (deploy.yml: build and deploy to Azure)
├── .claude/ · .kiro/     AI assistant agents, skills and settings (kept in sync)
├── AGENTS.md · CLAUDE.md Always-on project context for the AI assistants
└── DEVELOPMENT.md        How to set up and run the project locally
```
