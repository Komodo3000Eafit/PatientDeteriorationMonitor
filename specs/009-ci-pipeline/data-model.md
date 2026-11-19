# Data Model: CI Pipeline (TS-09)

This story adds no database tables, API data or stored records. The "entities" from the spec are parts of the workflow file and of the docs.

## CI workflow (`.github/workflows/ci.yml`)

| Field | Value | Rule |
|---|---|---|
| `name` | `CI` | Shown as the prefix of every check on a PR |
| Triggers | `pull_request` to `main`, `push` to `main` | No `pull_request_target`, no path filters (FR-001, FR-009) |
| `permissions` | `contents: read` | No other permission (FR-009, SC-005) |
| Secrets / variables | none | No `secrets.*` or `vars.*` anywhere (FR-008) |
| Jobs | 3, independent | No `needs` between them (FR-002) |

## Check (job)

| Job key | Displayed name | Runtimes | Steps (in order) | Timeout |
|---|---|---|---|---|
| `backend` | `Backend tests` | Python 3.13 | checkout, setup-python (pip cache), `pip install -r requirements.txt`, `python -m pytest` (in `backend/`) | 10 min |
| `frontend` | `Frontend tests` | Node.js 26 | checkout, setup-node (npm cache), `npm ci`, `npm test`, `npm run build` (in `frontend/`) | 10 min |
| `dependencies` | `Dependency check` | Python 3.13, Node.js 26 | checkout, setup-python, setup-node, `pip install pip-audit==2.10.1`, `pip-audit -r backend/requirements.txt`, `npm audit --audit-level=high` (in `frontend/`) | 10 min |

State: each check is queued → running → passed / failed / timed out / cancelled. Only "passed" counts as green.

## Vulnerability finding

| Field | Backend (pip-audit) | Frontend (npm audit) |
|---|---|---|
| Package, installed version | yes | yes |
| Advisory ID | yes (e.g. `PYSEC-…`, `GHSA-…`) | yes (GHSA link) |
| Severity | none reported | low / moderate / high / critical |
| Fixed version | when known | when known (`npm audit fix` hint) |
| Fails the check | always | high or critical only |

## Accepted risk exception

| Side | Where it lives | Required next to it |
|---|---|---|
| Backend | `--ignore-vuln <ID>` on the `pip-audit` line in `ci.yml` (one per advisory) | YAML comment with the reason + a `docs/DECISIONS.md` entry |
| Frontend | `overrides` entry in `frontend/package.json` (or a version upgrade) | reason in the PR and a `docs/DECISIONS.md` entry (JSON has no comments) |

None exist at the time of this story (both audits clean on 2026-11-18).
