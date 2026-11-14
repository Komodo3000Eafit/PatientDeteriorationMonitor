# Project Status

> **Read this first.** This file tells you where the project is right now and what comes next.
> Whoever completes a step updates this file **in the same pull request** as the work.

**Last updated:** 2026-11-13
**Current phase:** 1 — Spec Kit and team setup
**Current step:** Step 11 — Technical stories: TS-01 ✅, TS-02 ✅, TS-03 ✅, TS-04 ✅, TS-05 ✅, TS-06 ✅
**Next step:** TS-07 — Clinical scoring module (see [BACKLOG.md](BACKLOG.md))

> **Where we left off (2026-11-13):** TS-01 to TS-05 are merged to `main`. TS-06 is implemented on branch `006-authentication` (D-35). The backend has `POST /auth/login` (PBKDF2 password check, generic 401, PyJWT HS256 token, default 480 minutes) and `GET /me`, protected by the reusable `get_current_user` dependency; `/health` stays public. The app refuses to start without an `AUTH_SECRET` of at least 32 characters. Demo users `demo.doctor` (Dra. Ana Demo) and `demo.nurse` (Enf. Luis Demo) are created on Neon with `python -m app.seed_demo_users`. The frontend shows a login page inside `AppShell` until the user signs in, keeps the session in `sessionStorage['pdm.session']`, adds the token in `client.js`, and wraps clinical screens in `<RequireAuth>`; the header shows the name, translated role and a sign-out button. Locally `python -m pytest` gives 136 passed (about 6 s), `npm test` gives 63 passed (5 files, about 1 s), and `npm run build` succeeds. The security review passed: 1 low finding (an oversized token `sub` gave 503 instead of 401) was fixed and tested, with 5 info notes. Manual checks ([quickstart.md](../specs/006-authentication/quickstart.md)) passed. On Neon (step 2): seeding twice, a missing demo password, a missing `AUTH_SECRET`, the identical 401s, the nurse login with `GET /me`, and `/health`. In the browser (step 3), checked by the user: the login page with the banner and ES/EN, the generic wrong-password error, doctor and nurse sign-in with translated roles, reload, logout, a tampered token ("session ended") and the backend stopped ("cannot connect"). **Teammates must run `pip install -r requirements.txt` (adds PyJWT) and add `AUTH_SECRET`, `DEMO_DOCTOR_PASSWORD` and `DEMO_NURSE_PASSWORD` to `backend/.env`** (see `backend/.env.example`). To resume:
> 1. **Finish TS-06:** commit, then open the PR with the `pytest`, `npm test` and `npm run build` output, the manual check results (D-27) and the agent log summary, and merge it. Set TS-06 to ✅ in [BACKLOG.md](BACKLOG.md) when it is merged.
> 2. From an up-to-date `main`, run `/speckit-specify` for TS-07 (clinical scoring module), then `/speckit-clarify`. NEWS2 must stay behind a replaceable interface (constitution V).
> 3. Continue as before: plan → tasks → analyze → `claude --agent orchestrator` → review → PR (paste local test output, D-27) → merge.
> 4. Deferred to TS-09 (from the TS-02 to TS-04 security reviews): lock the indirect Python dependencies (including Mako and MarkupSafe) and run the vulnerability scan; optionally move pytest/httpx to a dev requirements file; run `npm test` and `npm audit` in CI (use `npm ci`).
> 5. Notes for later stories:
>    - **TS-08** and the API stories must keep patient and user text fields synthetic, e.g. by checking the `PAT-NNN` identifier pattern (TS-03 review).
>    - **TS-10** must never run `alembic downgrade` in CI/CD, and must not point frequent health probes at `/health` (D-30).
>    - **TS-10/TS-11** (from the TS-04 review): reject `null` and malformed entries in `CORS_ORIGINS`, and add HTTP security headers (CSP, `X-Content-Type-Options`, frame-ancestors).
>    - **Clinical stories** (from TS-06): every clinical endpoint uses `Depends(get_current_user)` and every clinical screen is rendered inside `<RequireAuth>`. **TS-09/TS-10** set `AUTH_SECRET` as a GitHub/Azure secret; **TS-10** adds login rate limiting.
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
| 11 | Technical stories TS-01 to TS-11: backend, Neon, tables, frontend, i18n, auth, scoring module, simulator, CI, Azure deployments | 🔄 | Foundation for every functional story. TS-01 ✅ (FastAPI skeleton). TS-02 ✅ (Neon database connection). TS-03 ✅ (tables + Alembic migrations, applied to Neon). TS-04 ✅ (React app skeleton + CORS). TS-05 ✅ (language switch ES/EN + disclaimer banner). TS-06 ✅ (authentication). Next: TS-07 (scoring module) |
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
