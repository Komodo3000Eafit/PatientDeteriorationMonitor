# Research: CI Pipeline (TS-09)

Each entry: **Decision**, **Rationale**, **Alternatives considered**. Versions were checked on 2026-11-18 against the live sources, not from memory.

## R1 — Action versions

- **Decision**: `actions/checkout@v7`, `actions/setup-python@v7`, `actions/setup-node@v7`.
- **Rationale**: latest releases on 2026-11-18 (`gh api repos/actions/<name>/releases/latest`): checkout v7.0.1 (2026-07-20), setup-python v7.1.0 (2026-10-22), setup-node v7.1.0 (2026-10-08). A major-version tag gets fixes without edits and is what the story asks for (FR-010).
- **Alternatives considered**: pinning to a full commit SHA (stronger supply-chain guarantee, but needs an update bot or manual bumps; out of scope, D-23); minor-version tags (no real benefit over the major tag for official actions).

## R2 — Runtime versions

- **Decision**: Python `"3.13"` and Node.js `"26"` (quoted strings in YAML), on `ubuntu-latest`.
- **Rationale**: Python 3.13 is the project version (D-02). Node.js 26 is an LTS line ("Lithium", 26.13.1 released 2026-11-10, from `nodejs.org/dist/index.json`). Quoting avoids YAML reading `3.10`-style values as numbers. Linux runners are free for public repositories.
- **Alternatives considered**: a version matrix (out of scope); Windows runners (slower; the code is OS-independent and the team's Windows-specific issues are local install issues, not test issues).

## R3 — Triggers and fork safety

- **Decision**: `on: pull_request: branches: [main]` and `on: push: branches: [main]`; no `pull_request_target`, no `workflow_run`, no path filters.
- **Rationale**: with `pull_request`, GitHub runs fork code with a read-only token and no secrets (FR-009). No path filters, so the three checks are always reported and branch protection never waits for a check that did not run (Clarifications).
- **Alternatives considered**: `pull_request_target` (runs with the base repository's secrets and a write token; unsafe with fork code and not needed); `concurrency` with `cancel-in-progress` (saves a few minutes, adds a concept; not needed, D-23).

## R4 — Token permissions and secrets

- **Decision**: top-level `permissions: contents: read`, nothing else; no `secrets.*`, no `env` values from repository variables.
- **Rationale**: checkout needs only read access; nothing writes to the repository, issues or PRs (FR-008, FR-009, SC-005). The backend tests already set a fake `AUTH_SECRET` and remove `DATABASE_URL` in `backend/tests/conftest.py`, so no value is needed.
- **Alternatives considered**: `permissions: {}` (checkout of a public repo would still work, but `contents: read` states the intent and also works if the repo becomes private).

## R5 — Backend check

- **Decision**: setup-python with `cache: pip` and `cache-dependency-path: backend/requirements.txt`; `pip install -r requirements.txt`; `python -m pytest`; all with `working-directory: backend`.
- **Rationale**: matches the local commands in `backend/README.md`. setup-python's pip cache looks for `requirements.txt` at the repository root by default and fails if it finds none, so the path must be given. `python -m pytest` adds `backend/` to `sys.path`, as locally (AC2, FR-003).
- **Alternatives considered**: a virtual environment in CI (the runner is already disposable); a separate dev requirements file (optional, not required by the spec).

## R6 — Frontend check

- **Decision**: setup-node with `cache: npm` and `cache-dependency-path: frontend/package-lock.json`; `npm ci`, `npm test`, `npm run build`; all with `working-directory: frontend`.
- **Rationale**: `npm ci` installs exactly the lock file and fails if it does not match `package.json` (FR-004, edge case). `npm test` is already `vitest run`, which runs once and exits; Vitest also never watches when the `CI` environment variable is set, which GitHub sets. The build catches import and bundling errors that tests may miss.
- **Alternatives considered**: `npm install` (can change the lock file and hide drift).

## R7 — Backend dependency audit

- **Decision**: `pip install pip-audit==2.10.1`, then `pip-audit -r backend/requirements.txt`. Any finding fails (exit code 1). Exceptions: `--ignore-vuln <ID>` added to that command with a comment (FR-007).
- **Rationale**: with `-r`, pip-audit installs the requirements into its own temporary virtual environment and audits everything that resolves, including indirect packages such as Mako and MarkupSafe (Clarifications), and it does not audit the runner's own pip or setuptools. It uses the PyPI/OSV advisory data and reports no severity, so every finding fails (FR-006). Pinned to the current release (2.10.1, Python ≥ 3.10) like every other Python dependency in the repo, so a new pip-audit release can't change CI behaviour unannounced. It is installed only in CI and locally by hand; it is not added to `requirements.txt` (spec Assumptions). Checked locally on 2026-11-18: "No known vulnerabilities found".
- **Alternatives considered**: auditing the installed environment without `-r` (would also report the runner's pip/setuptools, which are not ours); Safety (needs an account/API key for current data); Dependabot alerts (not a PR check, and settings-based, not in the repo); a lock file for indirect packages (rejected, D-23 and Clarifications).

## R8 — Frontend dependency audit

- **Decision**: `npm audit --audit-level=high` in `frontend/`, with no `--omit=dev`; no install step needed before it.
- **Rationale**: npm audit reads `package-lock.json` directly, so it covers the full tree, including dev dependencies (Vite, Vitest, jsdom), which run on developers' machines and in CI. `--audit-level=high` makes only high and critical findings fail; all findings are still printed (FR-006). Checked locally on 2026-11-18: "found 0 vulnerabilities". Exceptions: an `overrides` entry in `frontend/package.json` or an upgrade, since npm audit has no per-advisory ignore (FR-007).
- **Alternatives considered**: `--omit=dev` (would hide vulnerable build and test tools); a third-party audit tool (not needed).

## R9 — Job layout and timeouts

- **Decision**: one file `.github/workflows/ci.yml`, workflow `name: CI`, three independent jobs (no `needs`), each with `timeout-minutes: 10`. Job `name:` values: `Backend tests`, `Frontend tests`, `Dependency check`. The dependency job sets up both Python and Node.js.
- **Rationale**: independent jobs run in parallel and each reports its own result, so one failure does not hide another (FR-002, edge case). The PR shows them as "CI / Backend tests (pull_request)" etc. (AC6). Today the backend suite takes about 7 s and the frontend about as long, so 10 minutes is generous but stops a stuck job long before GitHub's 6-hour default (SC-003).
- **Alternatives considered**: one job with all steps (a failing step stops the rest); two workflow files (the story asks for one).

## R10 — Running the checks locally

- **Decision**: `DEVELOPMENT.md` lists the same commands, run from the repository root on Windows PowerShell: backend tests in the activated `backend/.venv`; `npm ci` (or the existing `npm install`), `npm test`, `npm run build` in `frontend/`; `pip install pip-audit==2.10.1` into the backend venv, then `pip-audit -r backend/requirements.txt`, and `npm audit --audit-level=high` in `frontend/`.
- **Rationale**: same commands as CI, so the same outcome (FR-011). pip-audit's packages installed and ran on Windows with Smart App Control on (checked 2026-11-18 via `uvx`, D-31). Installing it into the backend venv does not affect the audit, because `-r` resolves in a separate environment.
- **Alternatives considered**: a script that runs all checks (the story forbids new scripts; the commands are short); `uvx pip-audit` (works too and is mentioned as an option, but `pip install` matches CI).

## R11 — Branch protection (manual, optional)

- **Decision**: document the steps for the repo owner: Settings → Branches → add a rule (or ruleset) for `main` → "Require a pull request before merging" and "Require status checks to pass", then select `Backend tests`, `Frontend tests` and `Dependency check`. The checks appear in the picker only after they have run once, so do it after this story's PR has run.
- **Rationale**: free for public repositories (AC9, FR-015). Done by hand; nothing in the repo changes settings.
- **Alternatives considered**: setting it with `gh api` (automation of settings; not asked for); "require branches to be up to date" (adds extra re-runs; left to the owner's choice and mentioned as optional).

## R12 — Proving red and green

- **Decision**: green = this story's PR shows the three checks passing. Red = a throwaway branch `ci-red-check` from this branch, with one test file `backend/tests/test_ci_red.py` containing `assert False`, pushed and opened as a draft PR to `main` (so the `pull_request` trigger runs); record the link/screenshot of the failing "Backend tests" check, then close the PR and delete the branch.
- **Rationale**: a push to a non-`main` branch alone does not trigger the workflow (triggers are `main` only), so a draft PR is needed (AC7, FR-014). The other two checks should stay green on that run, which also shows FR-002.
- **Alternatives considered**: breaking a test on the story branch and reverting it (leaves noise in the story's history).
