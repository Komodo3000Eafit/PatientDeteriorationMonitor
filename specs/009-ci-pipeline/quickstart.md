# Quickstart: validate the CI pipeline (TS-09)

## 1. Run the three checks locally (before pushing)

From the repository root, Windows PowerShell. Expected results are as of 2026-11-18.

| Check | Commands | Expected |
|---|---|---|
| Backend tests | `cd backend`, `.\.venv\Scripts\Activate.ps1`, `python -m pytest` | all tests pass (289 at TS-08) |
| Frontend tests | `cd frontend`, `npm ci`, `npm test`, `npm run build` | tests pass, then `dist/` is built |
| Dependency check | in the backend venv: `pip install pip-audit==2.10.1`, then from the root `pip-audit -r backend/requirements.txt`; then `cd frontend`, `npm audit --audit-level=high` | "No known vulnerabilities found" and "found 0 vulnerabilities", both exit code 0 |

## 2. Review the workflow file

Check `.github/workflows/ci.yml` against [contracts/ci-checks.md](contracts/ci-checks.md) and [data-model.md](data-model.md):

- triggers are only `pull_request` and `push` to `main`;
- `permissions: contents: read` is the only permission;
- searching the file for `secrets.` and `vars.` finds nothing;
- the only `uses:` lines are `actions/checkout@v7`, `actions/setup-python@v7`, `actions/setup-node@v7`;
- the three job names are exactly `Backend tests`, `Frontend tests`, `Dependency check`.

## 3. Green run (this story's PR)

Push the branch and open the PR to `main`. Expected: three checks appear without starting them by hand and all pass in under 10 minutes. Record the run link in the PR description (AC7).

## 4. Red run (throwaway branch)

1. From the story branch: `git checkout -b ci-red-check`.
2. Add `backend/tests/test_ci_red.py` with one test that does `assert False`, commit, push.
3. Open a **draft** PR from `ci-red-check` to `main` (a push alone doesn't trigger CI).
4. Expected: `Backend tests` fails and its log names `test_ci_red.py`; `Frontend tests` and `Dependency check` still pass.
5. Record the link or a screenshot in this story's PR, then close the draft PR and delete the branch locally and on GitHub (`git push origin --delete ci-red-check`).

## 5. Branch protection (optional, repo owner)

After step 3 has run once, follow the steps in `DEVELOPMENT.md` (CI section) and confirm that a PR with a failing check shows "Merging is blocked".
