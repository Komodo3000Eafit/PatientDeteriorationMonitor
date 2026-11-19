---

description: "Task list for TS-09 CI pipeline"
---

# Tasks: CI Pipeline

**Input**: Design documents from `specs/009-ci-pipeline/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/ci-checks.md](contracts/ci-checks.md), [quickstart.md](quickstart.md)

**Tests**: No new automated tests. This story adds no application code. The workflow is verified by running the three checks locally (T006), the security review (T007), a green run on this PR (T009) and a deliberately red run (T010). No test file is added to the story branch.

**Organization**: This feature has one story (TS-09), so all story tasks carry the `[TS-09]` label.

## Format: `[ID] [P?] [Story] Description (owner)`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **(owner)**: at the end of the line. **Agent** owners: devops, qa-tester, security-reviewer, orchestrator. **(human)** = a manual step for the person running the story (it pushes to GitHub, opens or closes PRs, or changes repository settings, so agents don't do it).
- All paths are relative to the repository root.
- Edit files with Edit/Write, not PowerShell (CLAUDE.md). Keep the files UTF-8.
- **Only these files change**: `.github/workflows/ci.yml` (new), `DEVELOPMENT.md`, `docs/DECISIONS.md`, `docs/PROJECT_STATUS.md`, `docs/BACKLOG.md`, and this story's `agent-log.csv`. Do not touch `backend/`, `frontend/` or `.specify/` (FR-016). No new scripts, tools or config files.
- Agents log each step with `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/log-agent.ps1 -Agent <agent> -Task <Txxx> -Action <action> -Details "<text>"`.

---

## Phase 1: Setup

- [X] T001 [TS-09] Baseline: run the three checks locally exactly as in [quickstart.md](quickstart.md) §1, before any change, and note the results for the PR description: `python -m pytest` in `backend/` (venv active; 289 passed at TS-08), `npm ci`, `npm test`, `npm run build` in `frontend/`, then `pip install pip-audit==2.10.1` in the backend venv, `pip-audit -r backend/requirements.txt` from the root, and `npm audit --audit-level=high` in `frontend/`. Expected: all pass, "No known vulnerabilities found", "found 0 vulnerabilities". If an audit finds something, stop and report it to the orchestrator (an upgrade would need its own decision, FR-016) (qa-tester, agent)

---

## Phase 2: Foundational

None. TS-01 and TS-04 are merged; their test suites already need no database or secrets.

---

## Phase 3: TS-09 CI pipeline 🎯 MVP

**Goal**: every PR to `main` and every push to `main` runs three named checks (Backend tests, Frontend tests, Dependency check) with a read-only token and no secrets, and the team knows how to read and reproduce them.

**Independent Test**: this story's PR shows the three checks green without starting them by hand (T009), and a draft PR with a failing test shows "Backend tests" red while the other two stay green (T010).

### Workflow file

- [X] T002 [TS-09] Create `.github/workflows/ci.yml` per [plan.md](plan.md) "Design notes" and [data-model.md](data-model.md). Top comment: "CI for PatientDeteriorationMonitor (TS-09). Check names are referenced by branch protection; keep them unchanged. See specs/009-ci-pipeline/contracts/ci-checks.md."
  - `name: CI`.
  - `on:` only `pull_request: branches: [main]` and `push: branches: [main]`. **No** `pull_request_target`, `workflow_run`, `workflow_dispatch`, `paths` or `paths-ignore` (FR-001, FR-009; R3).
  - Top-level `permissions: contents: read` and nothing else. No `secrets.`, `vars.` or `env:` values anywhere (FR-008; R4).
  - Three jobs, **no `needs`** between them, each `runs-on: ubuntu-latest` and `timeout-minutes: 10` (FR-002; R9):
    - **`backend`**, `name: Backend tests`, `defaults.run.working-directory: backend`. Steps: `actions/checkout@v7`; `actions/setup-python@v7` with `python-version: "3.13"`, `cache: pip`, `cache-dependency-path: backend/requirements.txt`; "Install backend requirements": `pip install -r requirements.txt`; "Run backend tests": `python -m pytest` (FR-003; R5).
    - **`frontend`**, `name: Frontend tests`, `defaults.run.working-directory: frontend`. Steps: `actions/checkout@v7`; `actions/setup-node@v7` with `node-version: "26"`, `cache: npm`, `cache-dependency-path: frontend/package-lock.json`; "Install frontend dependencies": `npm ci`; "Run frontend tests": `npm test`; "Build frontend": `npm run build` (FR-004; R6).
    - **`dependencies`**, `name: Dependency check`. Steps: `actions/checkout@v7`; `actions/setup-python@v7` (same inputs as backend); `actions/setup-node@v7` (same inputs as frontend); "Install pip-audit": `pip install pip-audit==2.10.1`; "Audit backend dependencies": `pip-audit -r backend/requirements.txt`, preceded by a comment: "Any finding fails (pip-audit reports no severity). To accept a risk, add --ignore-vuln <ID> here with the reason and a docs/DECISIONS.md entry."; "Audit frontend dependencies": `npm audit --audit-level=high` with `working-directory: frontend`, preceded by a comment: "High and critical fail; low and moderate are only reported. Dev dependencies are included. npm has no per-advisory ignore: fix with an upgrade or an overrides entry in frontend/package.json, plus a docs/DECISIONS.md entry." (FR-005 to FR-007; R7, R8).
  - The only `uses:` lines are the three official actions at `@v7` (FR-010; R1).

  (devops, agent)

### Docs

- [X] T003 [P] [TS-09] Add a CI section to `DEVELOPMENT.md` as a new subsection "7.1 Continuous integration (CI)" right after "7. Git workflow" / "Never commit" (keep the numbering of the other sections). Content (FR-011, FR-012, FR-015):
  - **What runs and when**: the three checks, from [contracts/ci-checks.md](contracts/ci-checks.md) (names, triggers, what fails each one). Note: no path filters; pushes to other branches without a PR don't run CI.
  - **Reading a failure**: on the PR, open the "Checks" tab or click "Details" next to the red ✗ → open the failed step (step names say what failed). Typical causes: a failing test (the pytest/Vitest summary names it), `npm ci` failing because `package-lock.json` is out of date (run `npm install` locally and commit the lock file), an audit finding (shows the package, version, advisory ID and fixed version). If the advisory database or a registry was unreachable, use "Re-run failed jobs" first.
  - **Run the same checks locally**: the commands from [quickstart.md](quickstart.md) §1, in PowerShell, from the repository root.
  - **When the dependency check fails**: upgrade the pinned version (backend `requirements.txt`, frontend `package.json` + `npm install`), or accept the risk: backend `--ignore-vuln <ID>` on the `pip-audit` line in `ci.yml`, frontend an `overrides` entry in `frontend/package.json`; in both cases the reason next to the change (YAML comment, or the PR description for JSON) and a `docs/DECISIONS.md` entry. A newly published advisory can turn CI red without any code change; that is intended.
  - **Branch protection (optional, repo owner)**: Settings → Branches → add a branch protection rule (or ruleset) for `main` → "Require a pull request before merging" and "Require status checks to pass before merging" → select `Backend tests`, `Frontend tests`, `Dependency check`. The checks appear in the list only after they have run once. Free because the repository is public. "Require branches to be up to date" is optional.
  - In §7, change "CI tests must pass before merging" to link to the new section; in the §8 checklist, add "Run the three CI checks locally (see 7.1)".

  (devops, agent)
- [X] T004 [P] [TS-09] In `docs/DECISIONS.md`: set D-27's status to "Superseded by D-38 (TS-09)", and add **D-38** (date 2026-11-18) after D-37, in the table's format: one workflow `.github/workflows/ci.yml` with three independent checks (Backend tests, Frontend tests, Dependency check) on `pull_request` and `push` to `main`, no path filters; `permissions: contents: read`, no secrets; official actions at `@v7`; Python 3.13, Node.js 26; backend audit `pip-audit==2.10.1 -r backend/requirements.txt` where **any** finding fails (no severity reported), frontend `npm audit --audit-level=high` including dev dependencies; exceptions only via `--ignore-vuln <ID>` (backend) or `overrides`/upgrade (frontend) with a DECISIONS entry; indirect Python packages covered by `-r`, **no lock file**; a new advisory may turn CI red without a code change (intended); 10-minute timeouts. Rationale: constitution VII and VIII CI gates, D-23. Rejected: `pull_request_target`, SHA pinning, Safety, Dependabot as a check, path filters, a lock file, a linter/coverage (out of scope). Also state that "CI must pass before merging" is a process rule (reviewer checks it) unless the repo owner turns on branch protection (T013), which makes GitHub enforce it. Status: Active (orchestrator, agent)
- [X] T005 [P] [TS-09] Update `docs/PROJECT_STATUS.md` and `docs/BACKLOG.md`:
  - **Do not mark TS-09 ✅ here.** It becomes ✅ only in T012, after the manual green and red runs pass.
  - `PROJECT_STATUS.md`: "Last updated" 2026-11-18; current step lists TS-09 🔄; next step TS-10 (backend deployment); replace the "Where we left off" note with a short TS-09 summary (one workflow, three checks, audit rules, D-38) and state that the constitution's "tests and dependency checks in CI" gate is **met once T009–T010 pass**, after which PRs rely on CI instead of pasted test output (D-27 superseded). Keep the still-open "Notes for later stories" list. In the item "Deferred to TS-09", keep the lock-file item marked resolved (already done in the clarify step) and mark the scan and `npm test`/`npm audit` in CI as done; the optional dev requirements split stays open as optional. Roadmap step 11 notes: add "TS-09 🔄 (CI pipeline, in review). Next: TS-10".
  - `BACKLOG.md`: TS-09 row: Spec = link to `../specs/009-ci-pipeline/spec.md`, Status 🔄.

  (orchestrator, agent)

### Verification (agents)

- [X] T006 [TS-09] Check the result against [quickstart.md](quickstart.md) §1–2: re-run the three local checks **following only `DEVELOPMENT.md` §7.1** (not the quickstart), note how long it took (target under 10 minutes, SC-004) and anything in §7.1 that was unclear or missing, and expect the same results as T001; review `.github/workflows/ci.yml`: only the two triggers on `main`, `permissions: contents: read` only, no match for `secrets.`, `vars.`, `pull_request_target`, `paths`; exactly three `uses:` actions, all `@v7`; job names exactly `Backend tests`, `Frontend tests`, `Dependency check`; `timeout-minutes: 10` on each; YAML indentation valid (2 spaces, no tabs). Run `git status --short` (shows new, untracked files such as `ci.yml`) **and** `git diff --stat main` (shows changes to tracked files), and confirm that together they list only the files allowed in the Format section plus this story's `specs/009-ci-pipeline/` folder (qa-tester, agent)
- [X] T007 [TS-09] Security review (read-only) of `.github/workflows/ci.yml` and the `DEVELOPMENT.md` CI section: explicitly confirm that the only triggers are `pull_request` and `push` to `main` (no `pull_request_target` or other trigger) and that the only permission is `contents: read`, so fork PRs get no secrets and no write token (FR-009; fork runs can't be tried in this repo, so this review is the check); also: no secrets or repository variables, official actions only with major pins (note SHA pinning as an accepted trade-off, D-38), the audit failing rules match FR-006, the exception routes need a DECISIONS entry, no command echoes environment values. Report findings; the orchestrator assigns any fix to devops and re-runs T006 (security-reviewer, agent)
- [X] T008 [TS-09] Fill this story's `specs/009-ci-pipeline/agent-log.csv` (every agent task assigned/done) and draft the PR description: link to `specs/009-ci-pipeline/`, the agent activity summary (which agent did what), the local results from T006, the security findings and how they were resolved, and two empty placeholders "Green run: <link>" and "Red run: <link>" for T009 and T010 (orchestrator, agent)

### Manual checks (human)

- [ ] T009 [TS-09] **Green run.** Commit the changes on `009-ci-pipeline`, push, and open the PR to `main` with the description from T008. Confirm the three checks appear by themselves as `CI / Backend tests (pull_request)`, `CI / Frontend tests (pull_request)`, `CI / Dependency check (pull_request)` and all pass in under 10 minutes. Paste the run link into "Green run: <link>" in the PR description. If a check fails, give the log to the orchestrator for a fix before continuing (AC1, AC6, AC7, SC-001, SC-003) (human)
- [ ] T010 [TS-09] **Red run.** From `009-ci-pipeline`: `git checkout -b ci-red-check`; add `backend/tests/test_ci_red.py` with one test `def test_ci_red(): assert False  # TS-09 red-run check, never merged`; commit and `git push -u origin ci-red-check`; open a **draft** PR from `ci-red-check` to `main` (a push alone doesn't trigger CI). Confirm `Backend tests` fails and its log names `test_ci_red.py`, while `Frontend tests` and `Dependency check` pass. **Before closing anything**, paste the failed run link (or a screenshot) into "Red run: <link>" in this story's PR description (AC7, FR-002, FR-014, SC-002) (human)
- [ ] T011 [TS-09] **Clean up the red run** (only after T010's link is recorded): close the draft PR without merging; `git checkout 009-ci-pipeline`; `git branch -D ci-red-check`; `git push origin --delete ci-red-check`. Confirm `backend/tests/test_ci_red.py` is not on `009-ci-pipeline` and the branch no longer appears on GitHub (human)
- [ ] T012 [TS-09] **Mark TS-09 done** (only after T009 is green, T010's red-run link is recorded and T011 is done): in `docs/BACKLOG.md` set the TS-09 status 🔄 → ✅; in `docs/PROJECT_STATUS.md` set TS-09 🔄 → ✅ in the current step and in roadmap step 11, and change "met once T009–T010 pass" to "met (green and red runs recorded in the PR)". Edit with Edit/Write, not PowerShell. Commit (`TS-09: mark done after CI green/red runs`) and push to `009-ci-pipeline`; this starts a new CI run on the PR (FR-013, AC8) (human)
- [ ] T013 [TS-09] **Optional — branch protection (repo owner).** After T009 has run once, follow `DEVELOPMENT.md` §7.1 "Branch protection" to require `Backend tests`, `Frontend tests` and `Dependency check` on `main`. Note in the PR whether it was done (AC9, FR-015) (human)
- [ ] T014 [TS-09] **Merge.** After a teammate's review, and only when the three checks of the PR's **latest** commit (the run started by T012's push) are green, merge the PR. The T009 link stays in the description as evidence of the first green run. Confirm the push to `main` starts a CI run with the `(push)` checks and that it passes (AC1) (human)

---

## Phase 4: Polish

None beyond T006–T008; the docs are part of the story (FR-012, FR-013).

---

## Dependencies & Execution Order

- **T001** first (baseline).
- **T002** (workflow) before the docs, because the docs quote its job and step names.
- **T003, T004, T005** in parallel after T002 (different files).
- **T006** after T002–T005; **T007** after T006; **T008** after T007 (and after any fixes).
- **T009** (human) after T008; **T010** after T009 is green; **T011** only after T010's link is recorded; **T012** after T011; **T013** optional, any time after T009; **T014** last, after T012's CI run is green.

## Parallel Example: TS-09

```text
# After T002 is done:
Task: "T003 Add CI section 7.1 to DEVELOPMENT.md" (devops)
Task: "T004 D-27 superseded + D-38 in docs/DECISIONS.md" (orchestrator)
Task: "T005 Update docs/PROJECT_STATUS.md and docs/BACKLOG.md" (orchestrator)
```

## Implementation Strategy

1. Agents: T001 → T002 → T003–T005 → T006 → T007 → T008 (run with `claude --agent orchestrator` / `/speckit-implement`).
2. Human: T009 (green) → T010 (red, record link) → T011 (clean up) → T012 (mark ✅, push) → T013 (optional branch protection) → T014 (merge when the latest run is green).
3. The MVP is the whole story: CI is only useful once the green and red runs prove it works.

## Notes

- Agents never push, open or close PRs, delete remote branches or change repository settings; those are the (human) tasks.
- The red-run test file exists only on `ci-red-check` and must never reach `009-ci-pipeline` or `main`.
- If a later story renames a job, branch protection silently stops matching it; the contract says the names stay fixed.
