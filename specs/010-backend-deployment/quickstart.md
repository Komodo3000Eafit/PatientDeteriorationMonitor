# Quickstart: Backend Deployment (TS-10)

How to set up the one-time Azure/OIDC pieces, run the new tests locally, trigger a deploy and verify the deployed app. Commands are PowerShell (team is on Windows). Details live in the contracts and [data-model.md](data-model.md); this is the run/verify guide.

## 1. One-time setup (repo owner, by hand)

Done once; not automated (no workflow changes Azure tenant settings).

1. **Create the OIDC identity on Azure** (research R2): a **user-assigned managed identity** `id-patient-monitor-deploy` in `rg-patient-monitor` (Brazil South) with the role **Colaborador de sitio web (Website Contributor) on the Web App `pmd-backend` only** (not the resource group: least privilege, and the identity cannot edit its own federated credentials). Its **federated credential** `github-production` (issuer `https://token.actions.githubusercontent.com`, audience `api://AzureADTokenExchange`) trusts only the GitHub environment `production` of this repository, using GitHub's immutable subject (owner and repository IDs): `repo:Komodo3000Eafit@354689751/PatientDeteriorationMonitor@1452090878:environment:production`. If a deploy fails with "No matching federated identity record found", compare the subject in the error with this one.
2. **Create the GitHub environment and its secrets**: a GitHub **environment** `production` (Settings → Environments), deployment branches restricted to `main`, with **environment secrets** (not repository secrets) `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` (identifiers) and `DATABASE_URL` (the Neon **direct**, non-pooled connection string, used only by the migration step). Only a job with `environment: production` can read them. `AUTH_SECRET` is **not** a GitHub secret: it lives only in the App Service settings. No publish profile, no client secret.
3. **Set App Service settings and startup command** (contract `deploy-workflow.md`): `DATABASE_URL`, `AUTH_SECRET`, `ACCESS_TOKEN_MINUTES`, `SCM_DO_BUILD_DURING_DEPLOYMENT=true`, `WEBSITES_PORT=8000`, and the gunicorn Startup Command. Confirm **Always On is off** and **no probe targets `/health`** (D-30).

Expected: the App Service exists with the settings above; `az webapp show -g rg-patient-monitor -n pmd-backend` lists it; no long-lived credential is stored anywhere.

## 2. Run the new security-control tests locally

From `backend/` with the dev dependencies installed (`pip install -r requirements.txt`):

```powershell
cd backend
python -m pytest -k "rate_limit or cors or security_headers" -q
```

Expected:
- login rate-limit tests pass: valid login within the limit → 200; (limit + 1) attempt → 429; after the window → 200; separate clients independent;
- CORS tests pass: `null`, `http://`, `example.com`, `*` and an all-invalid value each fail startup; valid lists parse; default applies only when unset;
- security-header tests pass: `/health` and a 401 both carry the CSP (with `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`.

The full suite (`python -m pytest`) stays green; these are the same tests CI runs before merge.

## 3. Trigger a deploy

The deploy is automatic:

1. Merge this story's PR into `main` (branch protection: the three CI checks must be green).
2. The `CI` workflow runs on `main`; when it finishes **successfully**, the `Deploy backend` workflow starts (`workflow_run`).
3. Watch Actions → **Deploy backend**: checkout → install → **Apply database migrations** (`alembic upgrade head`, forward-only) → Azure login (OIDC) → Deploy to App Service.

Expected: the deploy job runs only for `main` with a green CI; it does not run for fork PRs or other branches; the log shows no `alembic downgrade` and no secret values.

## 4. Verify the deployed app (AC1 / SC-001)

```powershell
# Replace with the App Service default hostname.
$url = "https://pmd-backend.azurewebsites.net/health"
# One retry: the first call may wake Neon from scale-to-zero.
try { $r = Invoke-RestMethod $url } catch { Start-Sleep 8; $r = Invoke-RestMethod $url }
$r | ConvertTo-Json
```

Expected: HTTP 200 with `status: "ok"`, a `version`, and `database: "ok"`. Record the URL and this result in the PR.

If `database` is `"unavailable"` after the retry: check the App Service `DATABASE_URL` setting and that the Neon database is not suspended over quota; the app itself is still up (200), so this is a database/connection issue, not a deploy failure.

## 5. Quick security spot-check on the deployed URL

```powershell
(Invoke-WebRequest "https://pmd-backend.azurewebsites.net/health").Headers |
  Select-Object 'Content-Security-Policy','X-Content-Type-Options','X-Frame-Options'
```

Expected: all three headers present with the contract values. (Login rate limiting is verified by the automated tests in §2, not by hammering the live endpoint.)

## 6. Update docs (same PR)

- `DEVELOPMENT.md`: deployment section (trigger chain, OIDC setup, app settings, migrations, startup command, the URL and `/health` check).
- `docs/DECISIONS.md`: add **D-42** (TS-10 decisions, research R1–R10).
- `docs/PROJECT_STATUS.md`: TS-10 ✅ with the deployed URL; mark the carry-over items resolved (no downgrade, no `/health` probe, `AUTH_SECRET` secret, login rate limiting, CORS null/malformed, security headers); next step TS-11.
- `docs/BACKLOG.md`: TS-10 spec link and status ✅.
