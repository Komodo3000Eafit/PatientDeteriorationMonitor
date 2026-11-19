# Feature Specification: CI Pipeline

**Feature Branch**: `009-ci-pipeline`

**Created**: 2026-11-18

**Status**: Draft

**Input**: User description: "TS-09 — CI pipeline (technical story, depends on TS-01 and TS-04). As a team member, I want every pull request tested automatically on GitHub, so that broken or vulnerable code can't be merged without anyone noticing. Acceptance criteria: A GitHub Actions workflow runs on every pull request to main and on every push to main. Backend job: Python 3.13, install backend/requirements.txt, run python -m pytest from backend/. No database, no network services and no secrets needed (the tests already use fake values). Frontend job: Node.js 26 LTS, npm ci in frontend/, npm test and npm run build. Dependency check job: scan backend dependencies (including indirect ones such as Mako/MarkupSafe) and frontend dependencies (npm audit) for known vulnerabilities. Decide in the spec which severity fails the build (suggestion: high and critical fail; lower ones are reported but don't fail). The workflow uses no repository secrets and the most restrictive token permissions (read-only contents); pull requests from forks can't access secrets. Results are visible on the PR (check names that clearly say backend tests, frontend tests, dependency check). docs and DEVELOPMENT.md explain what CI checks, how to read a failure, and how to run the same checks locally. D-27 is marked superseded; the constitution's 'tests and dependency checks in CI' gate is now met. A one-time check recorded in the PR: the workflow runs green on this PR, and a deliberately failing test on a throwaway branch makes it red (then deleted). Optional, manual: protect main so PRs need the checks to pass (the repo is public, so this is available on the free plan); documented as a step for the repo owner. Out of scope: deployment (TS-10/TS-11), running against the real Neon database, a linter or code formatter, coverage thresholds. Keep it as simple as possible (D-23): one workflow file, official actions only (actions/checkout, actions/setup-python, actions/setup-node) pinned to a major version."

## Clarifications

### Session 2026-11-18

- Q: Which findings fail the dependency check? → A: Backend: any known vulnerability fails. The backend scanner (pip-audit) reports no severity, so every backend finding fails, whatever its real severity. Frontend: high and critical fail (`npm audit --audit-level=high`); low and moderate are only reported.
- Q: How is a finding accepted as a risk when it can't be fixed yet? → A: Backend: ignore that one advisory with `pip-audit --ignore-vuln <ID>`. Frontend: npm audit has no per-advisory ignore, so the fix is an `overrides` entry in `frontend/package.json` that forces a safe version, or an upgrade. Either way, a comment next to the change gives the reason, and `docs/DECISIONS.md` records it as an accepted risk.
- Q: How are indirect Python dependencies covered? → A: By auditing everything that `backend/requirements.txt` installs, with no lock file (D-23). This resolves the "lock the indirect dependencies" item deferred to TS-09 in `docs/PROJECT_STATUS.md`. A newly published advisory can turn CI red without any code change; that is intended.
- Q: Should CI skip runs when only docs change, and should the out-of-scope list change? → A: No path filters: every pull request runs all three checks. The out-of-scope list stays as written.

## User Story *(mandatory)*

**Story ID**: TS-09

**Type**: Technical

**Story**: As a team member, I want every pull request tested automatically on GitHub, so that broken or vulnerable code can't be merged without anyone noticing.

**Depends on**: TS-01 (backend app and its test suite), TS-04 (frontend app and its test suite).

### Acceptance Criteria

1. **AC1 — When CI runs**: **Given** the repository on GitHub, **When** a pull request targeting `main` is opened or updated, or a commit is pushed to `main`, **Then** the CI workflow runs automatically, with no manual step.
2. **AC2 — Backend tests**: **Given** a CI run, **When** the backend check runs, **Then** it uses Python 3.13, installs the backend's pinned requirements, and runs the full backend test suite from the backend folder, with no database, network service or secret; the check passes only if every test passes.
3. **AC3 — Frontend tests and build**: **Given** a CI run, **When** the frontend check runs, **Then** it uses Node.js 26 LTS, installs exactly the locked frontend dependencies, runs the frontend test suite and builds the production bundle; the check passes only if both the tests and the build succeed.
4. **AC4 — Dependency check**: **Given** a CI run, **When** the dependency check runs, **Then** it scans every installed backend package (direct and indirect, e.g. Mako and MarkupSafe) and every frontend package for known vulnerabilities; it fails if any backend package has a known vulnerability (of any severity) or any frontend package has a high or critical one, and lists low and moderate frontend findings in the log without failing.
5. **AC5 — Least privilege**: **Given** the workflow definition, **When** it is reviewed, **Then** it references no repository secrets, grants the workflow token read-only access to repository contents and nothing else, and only uses a trigger under which pull requests from forks get no secrets and no write access.
6. **AC6 — Visible results**: **Given** a pull request, **When** CI has run, **Then** the pull request shows three separate checks whose names clearly read as backend tests, frontend tests and dependency check, each with its own pass/fail status and a link to its log.
7. **AC7 — Proven red and green**: **Given** this story's pull request, **When** CI runs on it, **Then** all three checks pass; **and Given** a throwaway branch with one deliberately failing test, **When** a draft pull request to `main` triggers CI on it, **Then** the matching check fails. Both results (with links or screenshots) are recorded in the pull request, and the throwaway branch is deleted afterwards.
8. **AC8 — Documentation**: **Given** a new teammate, **When** they read `DEVELOPMENT.md`, **Then** they find what CI checks, how to open and read a failing check, and the exact commands to run the same three checks locally. `docs/DECISIONS.md` marks D-27 as superseded and records this story's decision; `docs/PROJECT_STATUS.md` and `docs/BACKLOG.md` show TS-09 as done and note that the constitution's "tests and dependency checks in CI" gate is now met.
9. **AC9 — Branch protection (optional, manual)**: **Given** the repo owner, **When** they follow the documented steps, **Then** `main` requires the three checks to pass before a pull request can be merged. The steps are documented; doing them is optional and done by hand by the owner.

### Out of Scope

- Deployment to Azure (TS-10, TS-11) and any cloud credentials or OIDC setup.
- Running tests against the real Neon database or any other live service.
- A linter, code formatter or type checker.
- Coverage measurement or coverage thresholds.
- Automatic dependency update bots, scheduled scans, caching tuning, build matrices for several versions, and status badges.
- Changing application code or tests, except the temporary failing test on the throwaway branch.

### Edge Cases

- **Fork pull requests**: a pull request from a fork runs the same checks with a read-only token and no secrets; since the workflow needs no secrets, the checks behave the same as for branches in the repository.
- **Only docs changed**: CI still runs all three checks (no path filters), so the required checks are always reported and branch protection never waits for a check that did not run.
- **One check fails**: the other checks still run to the end and report their own results, so a single run shows every problem.
- **Vulnerability with no fixed version yet**: a failing finding (any backend finding, or a high or critical frontend one) still fails the dependency check; the team resolves it by upgrading, replacing the package, or accepting the risk through the exception process (FR-007).
- **Low-severity backend finding**: the backend scanner reports no severity, so it fails the check like any other backend finding; this is intended and handled the same way as above.
- **New advisory, no code change**: a vulnerability published after the last change can turn the dependency check red on a later run (including on `main`) even though nothing in the repository changed; this is intended, because it is exactly the news CI should bring.
- **Lock file out of date** with the frontend package list: the clean install fails, so the frontend check fails with the install error rather than testing different packages.
- **Advisory database or package registry unreachable**: the check fails rather than passing silently; re-running the check is the documented first step.
- **Tests accidentally need a real setting** (e.g. a database URL or auth secret): the backend check fails, which shows that the test is not self-contained; CI is not given real values to make it pass.
- **Several pushes in quick succession** to the same pull request: each push runs CI; only the latest result matters for merging.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repository MUST contain exactly one CI workflow definition that runs on every pull request targeting `main` and on every push to `main`.
- **FR-002**: The workflow MUST define three independent checks (backend tests, frontend tests, dependency check) whose displayed names clearly say so; a failure in one MUST NOT stop the others from finishing.
- **FR-003**: The backend check MUST use Python 3.13, install the pinned backend requirements, and run the backend test suite from the backend folder; it MUST pass only when all tests pass.
- **FR-004**: The frontend check MUST use Node.js 26 LTS, install exactly the versions in the frontend lock file (a clean install that fails if the lock file does not match), run the frontend tests and build the production bundle; it MUST pass only when install, tests and build all succeed.
- **FR-005**: The dependency check MUST scan the complete installed backend environment from the pinned requirements, including indirect packages, and the complete frontend dependency tree from the lock file, against a public database of known vulnerabilities.
- **FR-006**: The dependency check MUST fail when any backend package has any known vulnerability (pip-audit reports no severity, so every backend finding fails), or when any frontend package has a vulnerability of high or critical severity (`npm audit --audit-level=high`). Low and moderate frontend findings MUST be printed in the check's log but MUST NOT fail the check.
- **FR-007**: An accepted-risk exception MUST be narrow and documented. Backend: one `--ignore-vuln <ID>` per accepted advisory in the workflow's audit command. Frontend (npm audit has no per-advisory ignore): an `overrides` entry in `frontend/package.json` that forces a non-vulnerable version, or an upgrade. Backend: a comment next to the `--ignore-vuln` option MUST give the reason. Frontend: `package.json` can't hold comments, so the reason MUST be given in the `docs/DECISIONS.md` entry and in the pull request. In both cases `docs/DECISIONS.md` MUST record it as an accepted risk. No exception is expected at the time of this story.
- **FR-008**: No check MAY need a database, a network service other than package registries and the vulnerability database, or any secret; the workflow MUST NOT reference repository secrets.
- **FR-009**: The workflow token MUST be limited to read-only access to repository contents, with no other permissions; the workflow MUST NOT use a trigger that runs fork code with access to secrets or a write token.
- **FR-010**: The workflow MUST use only the official GitHub actions for checking out code and setting up Python and Node.js, each pinned to a major version; all other steps MUST be plain commands.
- **FR-011**: A teammate MUST be able to run the same three checks locally with the commands documented in `DEVELOPMENT.md`, and get the same pass/fail outcome as CI on the same commit (apart from newly published advisories).
- **FR-012**: `DEVELOPMENT.md` MUST explain what CI checks, when it runs, how to find and read a failing check on a pull request, how to run each check locally, and what to do when the dependency check fails.
- **FR-013**: `docs/DECISIONS.md` MUST mark D-27 as superseded by this story and add an entry for the CI decisions (triggers, three checks, failing severity, permissions). `docs/PROJECT_STATUS.md` and `docs/BACKLOG.md` MUST show TS-09 as done and state that the constitution's CI gate (tests and dependency checks) is now met. `docs/PROJECT_STATUS.md` MUST mark the deferred "lock the indirect Python dependencies" item as resolved by auditing everything `requirements.txt` installs, with no lock file.
- **FR-014**: The pull request for this story MUST record a green run of all three checks on that pull request and a red run caused by a deliberately failing test on a throwaway branch, which is deleted afterwards.
- **FR-015**: The documentation MUST include the manual steps for the repo owner to require the three checks before merging into `main`; carrying them out is optional.
- **FR-016**: No application code, runtime dependency or test MAY change because of this story, except where the dependency check finds a high or critical vulnerability that must be fixed by upgrading a pinned version.

### Key Entities

- **CI workflow**: the single automated definition stored in the repository; has triggers (pull request to `main`, push to `main`), a token permission setting and three checks.
- **Check**: one named unit of work shown on a pull request (backend tests, frontend tests, dependency check) with a pass/fail status and a log.
- **Vulnerability finding**: a known advisory affecting an installed package; has the package, the installed version, an advisory ID, a severity (frontend only: low, moderate, high or critical; backend findings have none) and, if available, a fixed version.
- **Accepted risk exception**: a recorded decision, with its reason, in `docs/DECISIONS.md`: for the backend, one ignored advisory ID; for the frontend, an `overrides` entry or upgrade that removes the finding.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of pull requests to `main` opened after this story is merged show the three checks without anyone starting them by hand.
- **SC-002**: A deliberately failing test turns its check red on the first run, and the pull request shows which check failed within one click of the check list.
- **SC-003**: A full CI run (all three checks) finishes in under 10 minutes, so feedback arrives while the author is still working on the change.
- **SC-004**: A teammate can run the same three checks locally in under 10 minutes using only `DEVELOPMENT.md`.
- **SC-005**: The workflow holds 0 references to secrets and grants 0 write permissions.
- **SC-006**: At merge time, the dependency check reports 0 known vulnerabilities in backend dependencies and 0 high or critical vulnerabilities in frontend dependencies.

## Assumptions

- **Failing severity** (confirmed in Clarifications): every backend finding fails, because pip-audit reports no severity; frontend high and critical fail, low and moderate are reported only.
- **Indirect backend packages** (confirmed in Clarifications) are covered by auditing everything `requirements.txt` installs, with no lock file (D-23). Indirect versions can therefore change between runs, and a new advisory can turn CI red without a code change; both are accepted.
- The existing backend tests already use fake settings (such as an in-memory test database and a fake auth secret) and need nothing from CI; if one does not, that is a test bug to fix, not a reason to add secrets.
- The vulnerability scanner for the backend may be installed as a plain command inside the check; it is a CI-only tool and is not added to the app's runtime requirements.
- GitHub-hosted Linux runners are used; their free minutes for public repositories are enough (constitution IX, cost control).
- Node.js 26 is an LTS release at the time of this story; the frontend lock file is committed and up to date.
- Keeping test tools (pytest, httpx) in the main requirements file is acceptable for now; splitting them into a development requirements file is optional and not required by this story.
- The red-run check uses a throwaway branch with one obviously failing test; it is never merged.
- Branch protection is set by the repo owner in GitHub's settings; no automation changes repository settings.
