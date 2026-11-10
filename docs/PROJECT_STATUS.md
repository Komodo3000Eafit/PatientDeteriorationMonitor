# Project Status

> **Read this first.** This file tells you where the project is right now and what comes next.
> Whoever completes a step updates this file **in the same pull request** as the work.

**Last updated:** 2026-11-09
**Current phase:** 1 — Spec Kit and team setup
**Current step:** Step 7 — Project context documentation ✅ (this commit)
**Next step:** Step 8 — Add the GitHub Copilot integration to Spec Kit
**Delivery deadline:** 2026-11-24 18:00 (see [ASSIGNMENT.md](ASSIGNMENT.md))

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
| 7 | Project context docs (this file, DECISIONS, ASSIGNMENT, agents, DEVELOPMENT, CLAUDE.md, Copilot instructions) | ✅ | |
| 8 | Add Copilot integration to Spec Kit | ⏭ | `specify integration install copilot` — verify flags against v1.3.3 |
| 9 | Project constitution (`/speckit-constitution`) | ⬜ | Draft by one member, pending team review. Must include both AI tools, the agent team and the user story rules |
| 10 | Create the agent team files (`.claude/agents/`, `.github/agents/`) | ⬜ | Design in [agents.md](agents.md) — subject to change |
| 11 | Backlog: ~10 user stories (technical + functional) | ⬜ | 5 baseline + 5 for the live demo |

### Phase 2 — Baseline implementation (one Spec Kit feature per user story)

| # | Step | Status | Notes |
|---|---|---|---|
| 12 | Technical stories: database, FastAPI app, frontend ↔ backend, CI, deployment | ⬜ | Foundation for every functional story |
| 13 | Functional baseline stories (5 total implemented) | ⬜ | Independent from each other |

### Phase 3 — Delivery and demo

| # | Step | Status | Notes |
|---|---|---|---|
| 14 | Evidence: tests, security controls, agent activity log, deployed URL | ⬜ | |
| 15 | Each member rehearses building a story live from their own computer | ⬜ | 5–10 min per story |
| 16 | Submit deliverables | ⬜ | Deadline 2026-11-24 18:00 |

---

## Team onboarding checklist (each member)

- [ ] Apply to GitHub Education and activate **Copilot Student** (verification can take days — do it now)
- [ ] Get a Claude plan with Claude Code
- [ ] Complete Phase 0 following [DEVELOPMENT.md](../DEVELOPMENT.md)
- [ ] Clone the repo and confirm `/speckit` commands appear in Claude Code and Copilot Chat

---

## Open questions / pending decisions

- Final triage scheme: NEWS2 for now; may be replaced by the official Colombian triage regulation (see DECISIONS D-08).
- Public dataset to use for vital signs (or synthetic data).
- Hosting provider for the free deployment.
- Agent team composition may still change (see [agents.md](agents.md)).
