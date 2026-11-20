# Contract: Deploy workflow and App Service (TS-10)

Defines the deploy pipeline and the App Service it targets. Field values are fixed by this contract; exact action patch versions are confirmed when `deploy.yml` is written (research R10).

## Workflow `deploy.yml`

```yaml
name: Deploy backend

on:
  workflow_run:
    workflows: ["CI"]        # TS-09's workflow name; must match exactly
    types: [completed]

permissions:
  id-token: write            # OIDC token request
  contents: read

jobs:
  deploy:
    name: Deploy backend
    runs-on: ubuntu-latest
    environment: production  # unlocks environment secrets; OIDC subject ...:environment:production
    timeout-minutes: 15
    # Only a green CI on main deploys; fork PRs and other branches never do.
    if: ${{ github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == 'main' }}
    steps:
      - uses: actions/checkout@v7
        with: { persist-credentials: false }
      - uses: actions/setup-python@v7
        with: { python-version: "3.13" }
      - run: pip install -r backend/requirements.txt
      # Forward-only. NEVER `alembic downgrade` (FR-006, AC5, D-30).
      - name: Apply database migrations
        working-directory: backend
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: python -m alembic upgrade head
      - name: Azure login (OIDC)
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
      - name: Deploy to App Service
        uses: azure/webapps-deploy@v3
        with:
          app-name: pmd-backend
          package: backend
```

### Rules

1. The trigger MUST be `workflow_run` on `CI`; the deploy MUST NOT run if `conclusion != 'success'` or `head_branch != 'main'` (AC2, FR-002).
2. The workflow MUST NOT reference a publish profile, client secret or any long-lived Azure credential. `AZURE_*` are IDs, not passwords (AC3, FR-003).
3. The migrate step MUST run only `alembic upgrade head`; `downgrade` MUST never appear in this or any CI/CD file (AC5, FR-006). A migration failure MUST fail the job before the deploy step (no partial release).
4. `DATABASE_URL` and `AUTH_SECRET` MUST come from GitHub secrets / App Service settings and MUST NOT be echoed in any step or log (AC4, FR-004/005).
5. `ci.yml` MUST NOT be modified by this story (D-38).
6. The deploy job MUST declare `environment: production`: the `AZURE_*` and `DATABASE_URL` secrets are environment secrets, and the Azure federated credential trusts only the subject `...:environment:production`.

## App Service settings (set once; quickstart §1)

| Setting | Value | Source |
|---|---|---|
| `DATABASE_URL` | Neon pooled connection string | app setting (the migration step uses a separate direct string from the `production` environment secret) |
| `AUTH_SECRET` | ≥ 32-char random value | app setting only (not a GitHub secret) |
| `ACCESS_TOKEN_MINUTES` | 1–1440 (default 480) | app setting |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` | app setting |
| `WEBSITES_PORT` | `8000` | app setting |
| Startup Command | `gunicorn app.main:app -k uvicorn.workers.UvicornWorker --workers 2 --bind=0.0.0.0:8000 --timeout 120` | App Service config |

Rules:
- `AUTH_SECRET` MUST be marked/stored as a secret (never plaintext in the repo, workflow or logs) (FR-005).
- No Always On, no auto-heal ping and no uptime monitor MAY target `/health` (AC6, FR-007, D-30).

## Deployed behaviour (acceptance)

- `GET /health` on the Azure URL MUST return HTTP 200 with `{ "status": "ok", "version": "<v>", "database": "ok" }` after a successful deploy; one retry is allowed for a database waking from scale-to-zero (AC1, FR-011, SC-001).
- When the database is briefly unreachable, `/health` still returns 200 with `database: "unavailable"` (existing TS-02 behaviour); the AC1 check retries once before failing.
