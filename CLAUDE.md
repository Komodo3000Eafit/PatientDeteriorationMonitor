# PatientDeteriorationMonitor — Context for Claude Code

Academic team project (4 students, deadline 2026-11-24): a **digital twin of a triaged patient** that monitors vital signs every 5 minutes and predicts deterioration, escalating the patient to a more urgent triage level. Built with **Spec-Driven Development** using GitHub Spec Kit v1.3.3.

## Read before starting any work

1. `docs/PROJECT_STATUS.md` — current step and what comes next
2. `.specify/memory/constitution.md` — project principles (mandatory)
3. `docs/DECISIONS.md` — why things are the way they are
4. `docs/agents.md` — the agent team (Claude Code subagents in `.claude/agents/`)
5. `docs/ASSIGNMENT.md` — course requirements and grading

## Working rules

- **No code without a spec.** Every change comes from a user story run through the Spec Kit workflow (`/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement`).
- **One user story = one Spec Kit feature** (one `specs/` folder, one branch, one PR). Technical stories (TS-xx) build the foundation; functional stories (US-xx) depend only on that foundation, never on each other.
- All code, comments, specs and docs in **English**. The UI is **Spanish by default** with an English switch.
- Never use or commit real patient data, secrets, tokens or `.env` files.
- Triage scoring (NEWS2 for now) must stay behind a swappable module — it may be replaced by the Colombian triage regulation.
- Record which agent did what in the PR description (see `docs/agents.md`).
- When a roadmap step is completed, update `docs/PROJECT_STATUS.md` in the same PR. When a decision changes, add an entry to `docs/DECISIONS.md`.
- Do not run `specify init` again; Spec Kit is already set up.
