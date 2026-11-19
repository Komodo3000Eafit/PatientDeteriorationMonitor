# Project Status

> **Read this first.** This file tells you where the project is right now and what comes next.
> Whoever completes a step updates this file **in the same pull request** as the work.

**Last updated:** 2026-11-19
**Current phase:** 2 — Baseline implementation
**Current step:** Step 11 — Technical stories: TS-01 ✅, TS-02 ✅, TS-03 ✅, TS-04 ✅, TS-05 ✅, TS-06 ✅, TS-07 ✅, TS-08 ✅, TS-09 ✅
**Next step:** TS-10 — Backend deployment (see [BACKLOG.md](BACKLOG.md))

> **Where we left off (2026-11-19):** TS-01 to TS-09 are merged to `main` (TS-09 as PR #11). TS-09 (CI pipeline, D-38) adds no application code:
> - One workflow, `.github/workflows/ci.yml`, with three independent checks on every PR to `main` and every push to `main`: **Backend tests** (pytest), **Frontend tests** (Vitest + build) and **Dependency check**. It uses `permissions: contents: read`, no secrets and official actions at `@v7`.
> - Audit rules: `pip-audit -r backend/requirements.txt` fails on any finding; `npm audit --audit-level=high` fails on high/critical. Exceptions need `--ignore-vuln` or `overrides` plus a DECISIONS entry. How to read and reproduce the checks: [DEVELOPMENT.md §7.1](../DEVELOPMENT.md#71-continuous-integration-ci).
>
> The constitution's "tests and dependency checks in CI" gate is **met**: green run [CI #1](https://github.com/Komodo3000Eafit/PatientDeteriorationMonitor/actions/runs/44454387339) on the PR, red run [CI #3](https://github.com/Komodo3000Eafit/PatientDeteriorationMonitor/actions/runs/44454880682) on the throwaway branch `ci-red-check` (draft PR closed unmerged, branch deleted locally and on GitHub). PRs now rely on CI instead of pasted test output (D-27 superseded). **Branch protection is on for `main`** (ruleset, 2026-11-19): every change goes through a pull request, the three checks must pass, and force pushes are blocked. **Safe baseline:** tag [`v0.9.0`](https://github.com/Komodo3000Eafit/PatientDeteriorationMonitor/releases/tag/v0.9.0) marks this state of `main` (go back with `git switch -c recover-from-v0.9.0 v0.9.0`). To resume:
> 1. **Hosting changed (D-39):** the **frontend is served by FastAPI on the same Azure App Service**, because Azure Static Web Apps is blocked by the subscription's region policy. [BACKLOG.md](BACKLOG.md) TS-10/TS-11 are reworded; write the TS-10 and TS-11 specs on that basis. The constitution is amended to **v1.2.0** (D-41) to match: one App Service, the app **suggests re-triage and a clinician decides** (Resolución 5596 de 2015), and the glossary rule. Use the terms in [GLOSSARY.md](GLOSSARY.md) (D-40) in every new spec.
> 2. From an up-to-date `main`, run `/speckit-specify` for TS-10 (backend deployment), then continue as before: clarify → plan → tasks → analyze → `claude --agent orchestrator` → review → PR (CI green) → merge.
> 3. ~~Deferred to TS-09 (from the TS-02 to TS-04 security reviews)~~: ~~lock the indirect Python dependencies (including Mako and MarkupSafe)~~ resolved: no lock file, CI audits everything `requirements.txt` installs (D-23, D-38); ~~run the vulnerability scan~~ done (Dependency check); ~~run `npm test` and `npm audit` in CI (use `npm ci`)~~ done. Still open, optional: move pytest/httpx to a dev requirements file.
> 4. Notes for later stories:
>    - **TS-08** and the API stories must keep patient and user text fields synthetic, e.g. by checking the `PAT-NNN` identifier pattern (TS-03 review).
>    - **TS-10** must never run `alembic downgrade` in CI/CD, and must not point frequent health probes at `/health` (D-30).
>    - **TS-10/TS-11** (from the TS-04 review): reject `null` and malformed entries in `CORS_ORIGINS`, and add HTTP security headers (CSP, `X-Content-Type-Options`, frame-ancestors).
>    - **Clinical stories** (from TS-06): every clinical endpoint uses `Depends(get_current_user)` and every clinical screen is rendered inside `<RequireAuth>`. **TS-10** sets `AUTH_SECRET` as a GitHub/Azure secret (TS-09 CI needs none: the tests use a fake value); **TS-10** adds login rate limiting.
>    - **US-03** (from TS-07): validate request bodies with `ACCEPTED_LIMITS` (or `vital_signs_from_mapping`) and map `InvalidVitalSigns.problems` to a 422 without echoing values; store `system`, `total`, `band` and the entries.
>    - **US-03** (from TS-08): extend `record_reading` to score the reading and store the result. If US-03 adds a table that refers to `vital_signs` or `patients`, add it to the delete list in `reset_demo_patients`.
>    - **US-01** (from TS-08): reject the six demo identifiers PAT-001 to PAT-006 when registering a patient, because `--reset` treats any patient with those identifiers as demo data. Also limit identifiers to `[A-Z0-9-]`, because the simulator prints them raw (TS-08 review).
>    - **US-04** (from TS-07 and D-41): map the risk band to a **re-triage suggestion** alert (the triage level changes only through a manual triage event when a clinician accepts; don't let `source = 'automatic'` change it on its own); NEWS2 stays only in `app/scoring/news2.py`, and other code imports only from `app.scoring`.
>    - **Later**: NEWS2 SpO2 Scale 2 needs a per-patient hypercapnic flag.
**Delivery deadline:** 2026-11-24 18:00 (see [ASSIGNMENT.md](ASSIGNMENT.md))

> **Solo dry run:** one member built the foundation (TS-01 to TS-09) end to end first, to learn the process and prepare resources. From 2026-11-19 teammates can start on the next stories from tag `v0.9.0` / current `main`, using these docs.

---

## Roadmap

Legend: ✅ done · 🔄 in progress · ⏭ next · ⬜ pending

### Phase 0 — Local environment (done once per computer; each teammate follows [DEVELOPMENT.md](../DEVELOPMENT.md))

| # | Step | Status | Notes |
|---|---|---|---|
| 1 | Install Python 3.13 and Git | ✅ | Python 3.15 breaks the Spec Kit install on Windows (see DECISIONS D-02) |
| 2 | Install uv and Specify CLI v1.3.3 | ✅ | `--python 3.13` flag if 3.15 is present |
| 3 | Run `specify check` | ✅ | |
| 4 | Install Claude Code and log in | ✅ | |

### Phase 1 — Spec Kit and team setup (done once for the repository)

| # | Step | Status | Notes |
|---|---|---|---|
| 5 | Initialize Spec Kit: `specify init --here --integration claude --script ps` | ✅ | Committed to `main` |
| 6 | Commit Spec Kit setup (`.specify/`, `.claude/skills/`) | ✅ | |
| 7 | Project context docs (this file, DECISIONS, ASSIGNMENT, agents, DEVELOPMENT, CLAUDE.md) | ✅ | Updated: Claude-only agents (D-15) |
| 8 | Project constitution (`/speckit-constitution`) | ✅ | v1.2.0 in `.specify/memory/constitution.md` (D-19, D-26, D-41). Draft by one member, pending team review (D-14) |
| 9 | Create the agent team files in `.claude/agents/` + agent activity log | ✅ | 6 agents (see [agents.md](agents.md)); CSV activity log per story via `scripts/log-agent.ps1` (D-22) |
| 10 | Align Spec Kit templates with the constitution, then write the backlog | ✅ | Templates: D-24. Backlog: [BACKLOG.md](BACKLOG.md) — 11 TS + 10 US (D-25) |

### Phase 2 — Baseline implementation (one Spec Kit feature per user story)

| # | Step | Status | Notes |
|---|---|---|---|
| 11 | Technical stories TS-01 to TS-11: backend, Neon, tables, frontend, i18n, auth, scoring module, simulator, CI, Azure deployments | 🔄 | Foundation for every functional story. TS-01 ✅ (FastAPI skeleton). TS-02 ✅ (Neon database connection). TS-03 ✅ (tables + Alembic migrations, applied to Neon). TS-04 ✅ (React app skeleton + CORS). TS-05 ✅ (language switch ES/EN + disclaimer banner). TS-06 ✅ (authentication). TS-07 ✅ (clinical scoring module, NEWS2). TS-08 ✅ (vital signs simulator). TS-09 ✅ (CI pipeline). Next: TS-10 |
| 12 | Functional baseline stories US-01 to US-05 | ⬜ | Implemented by one member; US-06 to US-10 are built by the team in the final session |

### Phase 3 — Delivery and demo

| # | Step | Status | Notes |
|---|---|---|---|
| 13 | Evidence: tests, security controls, agent activity log, deployed URL | ⬜ | |
| 14 | Each member rehearses building a story live from their own computer | ⬜ | 5–10 min per story |
| 15 | Submit deliverables | ⬜ | Deadline 2026-11-24 18:00 |

---

## Team onboarding checklist (each member)

- [ ] Get a Claude plan that includes Claude Code (needed to run the agents)
- [ ] Complete Phase 0 following [DEVELOPMENT.md](../DEVELOPMENT.md)
- [ ] Ask the repo owner to add you as a collaborator
- [ ] Clone the repo and confirm `/speckit` commands appear in Claude Code
- [ ] Read [GLOSSARY.md](GLOSSARY.md) and the constitution (v1.2.0) before writing a spec
- [ ] Work on a branch per story; `main` is protected, so every change goes through a pull request with the three CI checks green

---

## Open questions / pending decisions

- ~~Final triage scheme~~ resolved (D-41): NEWS2 measures risk; the triage level (Triage I–V, Resolución 5596 de 2015) is a clinician's classification; the app only suggests re-triage. Open: the UI label for triage levels (decide in US-02, e.g. "Triage I").
- Public dataset to use for vital signs (or synthetic data).
- Teammate review before merge (constitution, workflow step 7): self-reviewed during the solo dry run; once teammates join, someone other than the author reviews each PR.
- Agent team composition may still change (see [agents.md](agents.md)).
- GitHub Copilot as a second AI tool: on hold (D-15); can be reconsidered if a license becomes available.
