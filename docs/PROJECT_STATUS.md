# Project Status

> **Read this first.** This file tells you where the project is right now and what comes next.
> Whoever completes a step updates this file **in the same pull request** as the work.

**Last updated:** 2026-11-13
**Current phase:** 1 — Spec Kit and team setup
**Current step:** Step 11 — Technical stories: TS-01 ✅, TS-02 ✅, TS-03 ✅, TS-04 ✅, TS-05 ✅, TS-06 ✅, TS-07 ✅, TS-08 ✅
**Next step:** TS-09 — CI pipeline (see [BACKLOG.md](BACKLOG.md))

> **Where we left off (2026-11-13):** TS-01 to TS-07 are merged to `main`. TS-08 is implemented on branch `008-vital-signs-simulator` (D-37), with standard-library code only and no new dependency, table, endpoint or UI:
> - `backend/app/readings.py` `record_reading(session, patient_id, vitals)` validates with `app.scoring`, adds and flushes one `vital_signs` row, and does not commit. It is the only code that creates readings (enforced by a test).
> - `python -m app.demo_patients [--reset] [--yes]` creates the synthetic PAT-001 to PAT-006 (2 stable, 2 slow, 2 rapid; initial triage 3 to 5). `--reset` clears only those six, in one transaction, after `--yes` or an interactive `yes`.
> - `python -m app.simulator [--demo|--interval-seconds N] [--once|--rounds N] [--minutes M] [--seed S]`: defaults are 300 s, `--demo` 15 s and a 60-minute limit. It saves one reading per active patient per round and continues from each patient's saved readings.
>
> Locally `python -m pytest` gives 289 passed (256 existing + 33 new, about 6.5 s). The security review passed all 7 checks with 2 low and 4 info findings. These were fixed and tested: a generic error message for any exception, the single-writer test also catching bulk inserts, and README notes about `--reset`. The open low finding (no upper bound on `--minutes`) went to the team, and the identifier note is listed below. The Neon check passed: steps 1–2 took 19.9 s, the tables had 6, 12 and then 0 readings, and an invalid host gave only the error type. The demo patients are left on Neon `main`. To resume:
> 1. **Finish TS-08:** commit, then open the PR with the `pytest` output (D-27), the Neon check record and the agent log summary, and merge it. Set TS-08 to ✅ in [BACKLOG.md](BACKLOG.md) when it is merged.
> 2. From an up-to-date `main`, run `/speckit-specify` for TS-09 (CI pipeline), then `/speckit-clarify`.
> 3. Continue as before: plan → tasks → analyze → `claude --agent orchestrator` → review → PR (paste local test output, D-27) → merge.
> 4. Deferred to TS-09 (from the TS-02 to TS-04 security reviews): lock the indirect Python dependencies (including Mako and MarkupSafe) and run the vulnerability scan; optionally move pytest/httpx to a dev requirements file; run `npm test` and `npm audit` in CI (use `npm ci`).
> 5. Notes for later stories:
>    - **TS-08** and the API stories must keep patient and user text fields synthetic, e.g. by checking the `PAT-NNN` identifier pattern (TS-03 review).
>    - **TS-10** must never run `alembic downgrade` in CI/CD, and must not point frequent health probes at `/health` (D-30).
>    - **TS-10/TS-11** (from the TS-04 review): reject `null` and malformed entries in `CORS_ORIGINS`, and add HTTP security headers (CSP, `X-Content-Type-Options`, frame-ancestors).
>    - **Clinical stories** (from TS-06): every clinical endpoint uses `Depends(get_current_user)` and every clinical screen is rendered inside `<RequireAuth>`. **TS-09/TS-10** set `AUTH_SECRET` as a GitHub/Azure secret; **TS-10** adds login rate limiting.
>    - **US-03** (from TS-07): validate request bodies with `ACCEPTED_LIMITS` (or `vital_signs_from_mapping`) and map `InvalidVitalSigns.problems` to a 422 without echoing values; store `system`, `total`, `band` and the entries.
>    - **US-03** (from TS-08): extend `record_reading` to score the reading and store the result. If US-03 adds a table that refers to `vital_signs` or `patients`, add it to the delete list in `reset_demo_patients`.
>    - **US-01** (from TS-08): reject the six demo identifiers PAT-001 to PAT-006 when registering a patient, because `--reset` treats any patient with those identifiers as demo data. Also limit identifiers to `[A-Z0-9-]`, because the simulator prints them raw (TS-08 review).
>    - **US-04** (from TS-07): map `band` to escalation; NEWS2 stays only in `app/scoring/news2.py`, and other code imports only from `app.scoring`.
>    - **Later**: NEWS2 SpO2 Scale 2 needs a per-patient hypercapnic flag.
**Delivery deadline:** 2026-11-24 18:00 (see [ASSIGNMENT.md](ASSIGNMENT.md))

> **Solo dry run:** one member is building the project end to end first, to learn the process and prepare resources. The project will then be redone with the full team using these docs.

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
| 8 | Project constitution (`/speckit-constitution`) | ✅ | v1.1.0 in `.specify/memory/constitution.md` (D-19, D-26). Draft by one member, pending team review (D-14) |
| 9 | Create the agent team files in `.claude/agents/` + agent activity log | ✅ | 6 agents (see [agents.md](agents.md)); CSV activity log per story via `scripts/log-agent.ps1` (D-22) |
| 10 | Align Spec Kit templates with the constitution, then write the backlog | ✅ | Templates: D-24. Backlog: [BACKLOG.md](BACKLOG.md) — 11 TS + 10 US (D-25) |

### Phase 2 — Baseline implementation (one Spec Kit feature per user story)

| # | Step | Status | Notes |
|---|---|---|---|
| 11 | Technical stories TS-01 to TS-11: backend, Neon, tables, frontend, i18n, auth, scoring module, simulator, CI, Azure deployments | 🔄 | Foundation for every functional story. TS-01 ✅ (FastAPI skeleton). TS-02 ✅ (Neon database connection). TS-03 ✅ (tables + Alembic migrations, applied to Neon). TS-04 ✅ (React app skeleton + CORS). TS-05 ✅ (language switch ES/EN + disclaimer banner). TS-06 ✅ (authentication). TS-07 ✅ (clinical scoring module, NEWS2). TS-08 ✅ (vital signs simulator). Next: TS-09 (CI pipeline) |
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
- [ ] Clone the repo and confirm `/speckit` commands appear in Claude Code

---

## Open questions / pending decisions

- Final triage scheme: NEWS2 for now; may be replaced by the official Colombian triage regulation (see DECISIONS D-08).
- Public dataset to use for vital signs (or synthetic data).
- Solo dry run: the "teammate review before merge" rule (constitution, workflow step 7) is self-reviewed until the team joins.
- Agent team composition may still change (see [agents.md](agents.md)).
- GitHub Copilot as a second AI tool: on hold (D-15); can be reconsidered if a license becomes available.
