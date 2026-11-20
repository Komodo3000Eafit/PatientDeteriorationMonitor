# Contract: Deploy Workflow Changes (TS-11)

How `.github/workflows/deploy.yml` changes to build and ship the frontend with the backend. The
workflow's trigger, OIDC auth, migration step and `main`/CI gating stay exactly as TS-10 left them.

## 1. Unchanged from TS-10 (must not regress)

- `on: workflow_run` for workflow `CI`, `types: [completed]`.
- `if: workflow_run.conclusion == 'success' && head_branch == 'main'` (fork PRs / other branches never deploy).
- `permissions: id-token: write, contents: read`; `environment: production`.
- Forward-only migration step (`alembic upgrade head`), **never** downgrade.
- Azure login via OIDC (`azure/login@v2`), no stored publish profile / client secret.
- A **single** `azure/webapps-deploy@v3` step with `app-name: pmd-backend`, `package: backend`.

## 2. Added steps (before the deploy step)

Order inside the `deploy` job: checkout → setup-python → pip install → **[new frontend build]** →
migration → Azure login → deploy. (The build may run anywhere before deploy; placing it with the
other setup steps keeps the package ready.)

```yaml
- uses: actions/setup-node@v7
  with:
    node-version: "26"   # matches CI frontend job
    cache: npm
- name: Build frontend
  working-directory: frontend
  env:
    VITE_API_BASE_URL: ""   # same-origin relative API base in the deployed build
  run: |
    npm ci
    npm run build
- name: Stage build into backend package
  run: |
    # Vite outputs frontend/dist; place it where FastAPI serves it, inside the packaged backend dir
    rm -rf backend/app/static
    cp -r frontend/dist backend/app/static
```

(Exact copy commands are finalised in implementation; the contract is: the build output ends up in
`backend/app/static/` before the single deploy step runs.)

## 3. End-to-end check (after the deploy step)

A step (or documented manual check) asserts, with one retry for Neon waking:

| Check | Expected |
|-------|----------|
| `GET https://<app>/` | 200, `Content-Type: text/html` |
| `GET https://<app>/patients/PAT-001` | 200, `text/html` (SPA shell, not 404) |
| `GET https://<app>/health` | 200, JSON with `status`, `version`, `database` |

Refs: FR-009, FR-012, AC7, SC-001, SC-002, SC-003, SC-005.

## 4. Invariants

- Still exactly **1** App Service, **1** public URL, **1** deploy step, **1** Azure credential path (OIDC).
- `ci.yml` is **not** changed (TS-09 stays read-only / secret-free).
- No build artifact is committed: `backend/app/static/` is git-ignored; it exists only in the CI
  runner's workspace during deploy (or in a local build).
