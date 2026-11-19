# Implementation Plan: CI Pipeline

**Branch**: `009-ci-pipeline` | **Date**: 2026-11-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/009-ci-pipeline/spec.md`

## Summary

TS-09 adds one GitHub Actions workflow, `.github/workflows/ci.yml` (`name: CI`), with three independent jobs:

- **Backend tests**: Python 3.13, `pip install -r requirements.txt`, `python -m pytest` in `backend/`.
- **Frontend tests**: Node.js 26, `npm ci`, `npm test` (already `vitest run`, runs once), `npm run build` in `frontend/`.
- **Dependency check**: `pip-audit -r backend/requirements.txt` (any finding fails; it resolves indirect packages in its own environment), then `npm audit --audit-level=high` in `frontend/` (high and critical fail, dev dependencies included).

It runs on `pull_request` and `push` to `main`, with `permissions: contents: read`, no secrets, official actions only at `@v7` (checked 2026-11-18, research R1), and `timeout-minutes: 10` per job.

Docs: a CI section in `DEVELOPMENT.md` (what runs, reading a failure, the same commands locally, handling a failed dependency check, branch protection steps for the owner); D-27 superseded and D-38 added in `DECISIONS.md`; `PROJECT_STATUS.md` and `BACKLOG.md` show TS-09 done and the constitution's CI gate met. No application code, dependency or test changes (both audits are clean today).

## Technical Context

**Language/Version**: GitHub Actions workflow YAML. Runtimes in CI: Python 3.13, Node.js 26 LTS.

**Primary Dependencies**: `actions/checkout@v7`, `actions/setup-python@v7`, `actions/setup-node@v7` (official). CI-only tool: `pip-audit==2.10.1`, installed in the job, not added to `requirements.txt`. `npm audit` ships with npm.

**Storage**: N/A (setup-python/setup-node built-in caches for pip and npm downloads only).

**Testing**: the existing suites: pytest (backend, about 289 tests, no database, fake `AUTH_SECRET` from `tests/conftest.py`) and Vitest (frontend, jsdom, `fetch` mocked). The workflow itself is verified by the green run on this PR and the red run on a throwaway branch (research R12).

**Target Platform**: GitHub-hosted `ubuntu-latest` runners (free for public repositories).

**Project Type**: web application (backend + frontend); this story touches only CI configuration and docs.

**Performance Goals**: whole run (three jobs in parallel) under 10 minutes (SC-003); expected about 1–2 minutes.

**Constraints**: no secrets or repository variables; token `contents: read` only; no `pull_request_target`; no path filters; no new scripts, tools or config files besides the workflow; no linter, formatter or coverage.

**Scale/Scope**: 1 new file (about 60 lines of YAML) and 4 doc updates (`DEVELOPMENT.md`, `docs/DECISIONS.md`, `docs/PROJECT_STATUS.md`, `docs/BACKLOG.md`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Spec-driven and traceable**: every workflow element and doc change maps to an AC/FR (traceability below).
- [x] **II. Small Scrum story**: one workflow file and one docs section.
- [x] **III. Independence**: depends on TS-01 and TS-04, as `docs/BACKLOG.md` lists; no application code changes.
- [x] **IV. Multi-agent**: each task has an owner agent, logged in `agent-log.csv`:
  - **devops**: `ci.yml` and the `DEVELOPMENT.md` CI section;
  - **qa-tester**: runs the three checks locally, the green run and the red-run proof;
  - **security-reviewer**: permissions, triggers, secrets, fork safety, action pinning, audit rules;
  - **orchestrator**: `DECISIONS.md` (D-27 superseded, D-38), `PROJECT_STATUS.md`, `BACKLOG.md`, the agent log and the PR record.
- [x] **V. Clinical logic**: not touched.
- [x] **VI. Data privacy**: no data, no secrets; CI uses only the fake test values already in the repo.
- [x] **VII. Tests**: this story makes the critical-path tests run in CI on every PR. The previous exception (D-27, local test output pasted in PRs) ends with this story.
- [x] **VIII. Security baseline**: dependencies are now checked in CI; least-privilege token; no secrets in CI; fork PRs can't reach secrets.
- [x] **IX. Deployable at low cost**: GitHub Actions on a public repository is free; no new service.
- [x] **X. Stack**: unchanged.
- [x] **XI. Language**: workflow and docs in English.
- [x] **XII. Simplicity**: one file, three plain jobs, official actions only, no matrix, concurrency, path filters, scripts, bots or badges.

**Post-design re-check (after Phase 1)**: all items pass. Phase 1 added only: pinning `pip-audit` to an exact version (as every Python dependency in the repo is pinned; R7) and the throwaway branch needing a draft PR to trigger CI (R12). No Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/009-ci-pipeline/
├── spec.md
├── plan.md                 # This file
├── research.md             # Phase 0: versions, triggers, permissions, each job, audits, timeouts, local runs, branch protection, red/green proof
├── data-model.md           # Phase 1: workflow, checks, findings, exceptions
├── quickstart.md           # Phase 1: local checks, workflow review, green and red runs, branch protection
├── contracts/
│   └── ci-checks.md        # Phase 1: check names, when they run, pass/fail rules
├── checklists/
│   └── requirements.md
└── tasks.md                # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
.github/
└── workflows/
    └── ci.yml              # NEW: the only workflow (three jobs)

DEVELOPMENT.md              # CHANGED: new CI section; §7 and §8 point to it
docs/DECISIONS.md           # CHANGED: D-27 → Superseded by D-38; new D-38
docs/PROJECT_STATUS.md      # CHANGED: TS-09 done, CI gate met, deferred items resolved
docs/BACKLOG.md             # CHANGED: TS-09 spec link and status
```

**Structure Decision**: the existing web-application layout is unchanged. The workflow lives in GitHub's required location and sets `working-directory` per job, so `backend/` and `frontend/` keep their own commands exactly as their READMEs describe.

### Design notes

- **`ci.yml` outline** (devops writes it; values from research):
  - `name: CI`; `on.pull_request.branches: [main]`, `on.push.branches: [main]`; `permissions: contents: read`.
  - `backend` (`name: Backend tests`, `runs-on: ubuntu-latest`, `timeout-minutes: 10`, `defaults.run.working-directory: backend`): checkout; setup-python `python-version: "3.13"`, `cache: pip`, `cache-dependency-path: backend/requirements.txt`; `pip install -r requirements.txt`; `python -m pytest`.
  - `frontend` (`name: Frontend tests`, same runner/timeout, `working-directory: frontend`): checkout; setup-node `node-version: "26"`, `cache: npm`, `cache-dependency-path: frontend/package-lock.json`; `npm ci`; `npm test`; `npm run build`.
  - `dependencies` (`name: Dependency check`, same runner/timeout): checkout; setup-python (as above); setup-node (as above); `pip install pip-audit==2.10.1`; `pip-audit -r backend/requirements.txt` with a comment saying where `--ignore-vuln <ID>` exceptions go and that each needs a DECISIONS entry; `npm audit --audit-level=high` with `working-directory: frontend` and a comment on the `overrides` exception route.
  - Each step has a short `name:` so a failure points to the step ("Run backend tests", "Audit backend dependencies", …).
- **`DEVELOPMENT.md` CI section** (new section after "7. Git workflow", e.g. "7.1 Continuous integration (CI)"):
  - what runs and when (table of the three checks, from the contract);
  - reading a failure: PR → "Checks" / the red ✗ next to the check → "Details" → the failed step; typical causes per check (failing test, lock file out of date, a finding with its advisory ID and fixed version);
  - running the same checks locally (commands from quickstart §1);
  - a failed dependency check: upgrade the pinned version, or accept the risk (backend `--ignore-vuln <ID>`, frontend `overrides`) with a reason and a DECISIONS entry; a new advisory can turn CI red without a code change, on purpose;
  - branch protection for the repo owner (research R11), optional;
  - §7 "CI tests must pass before merging" and §8 checklist link to the new section.
- **`DECISIONS.md`**: D-27 status → "Superseded by D-38 (TS-09)". D-38: one workflow, three checks, triggers, `contents: read`, no secrets, `@v7` actions, failing rules (backend any finding, frontend high/critical), exception routes, no lock file for indirect Python packages, no path filters; rejected: `pull_request_target`, SHA pinning, Safety, Dependabot as a check, path filters, lock file.
- **`PROJECT_STATUS.md`**: TS-09 ✅, next step TS-10; the "Where we left off" note says the constitution's "tests and dependency checks in CI" gate is met; item 4 (deferred to TS-09) marked done (lock-file item already marked resolved in the clarify step); PRs now rely on CI instead of pasted output (D-27 superseded).

### Traceability

| Requirement / AC | Delivered by |
|---|---|
| FR-001, AC1 (triggers) | `ci.yml` `on:`; green run on this PR |
| FR-002, AC6 (three named independent checks) | three jobs with `name:`, no `needs`; red run shows the other two still green |
| FR-003, AC2 (backend) | `backend` job |
| FR-004, AC3 (frontend) | `frontend` job |
| FR-005, FR-006, AC4 (audits and failing rules) | `dependencies` job; R7, R8 |
| FR-007 (exceptions) | comments in `ci.yml`; `DEVELOPMENT.md` CI section; D-38 |
| FR-008, FR-009, AC5 (no secrets, least privilege, fork safety) | `permissions`, `pull_request` trigger; security review |
| FR-010 (official actions, major pins) | `uses:` lines at `@v7` |
| FR-011, FR-012, AC8 (docs, local commands) | `DEVELOPMENT.md` CI section; quickstart §1 |
| FR-013, AC8 (decisions and status) | `DECISIONS.md`, `PROJECT_STATUS.md`, `BACKLOG.md` |
| FR-014, AC7 (green and red runs) | quickstart §3–4; PR description |
| FR-015, AC9 (branch protection) | `DEVELOPMENT.md` CI section; R11 |
| FR-016 (no app changes) | diff limited to `ci.yml` and docs |

## Complexity Tracking

No violations.
