# Contract: CI checks (TS-09)

The workflow's interface to people and to branch protection is the set of check names, when they run and what makes them fail. Later stories (TS-10, TS-11, US-xx) MUST keep these names unchanged, because branch protection refers to them by name.

## Check names (exact)

| Check name (job `name:`) | Shown on a PR as |
|---|---|
| `Backend tests` | `CI / Backend tests (pull_request)` |
| `Frontend tests` | `CI / Frontend tests (pull_request)` |
| `Dependency check` | `CI / Dependency check (pull_request)` |

On pushes to `main` the suffix is `(push)`.

## When they run

| Event | Runs |
|---|---|
| PR opened, reopened or updated (new commits), base `main`, from a branch or a fork | all three |
| Push (including merge) to `main` | all three |
| Push to any other branch without a PR to `main` | none |

## Pass / fail rules

| Check | Fails when |
|---|---|
| Backend tests | install fails, or any pytest test fails or errors, or 10 minutes pass |
| Frontend tests | `npm ci` fails (including lock file out of date), any Vitest test fails, the build fails, or 10 minutes pass |
| Dependency check | pip-audit reports any backend vulnerability not ignored by `--ignore-vuln`; or npm audit reports a high or critical frontend vulnerability; or either tool can't reach its advisory data; or 10 minutes pass |

## Guarantees

- No secrets, no repository variables, token = `contents: read`.
- No database or service other than the package registries and advisory databases.
- The same commands, documented in `DEVELOPMENT.md`, give the same result locally on the same commit (apart from newly published advisories).
