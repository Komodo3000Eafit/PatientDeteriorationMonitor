# PatientDeteriorationMonitor — Project Context

Academic team project (4 students, deadline 2026-11-24): a **digital twin of a triaged patient** that monitors vital signs every 5 minutes and predicts deterioration, escalating the patient to a more urgent triage level. Built with **Spec-Driven Development** using GitHub Spec Kit v1.3.3.

## Read before starting any work

1. `docs/PROJECT_STATUS.md` — current step and what comes next
2. `.specify/memory/constitution.md` — project principles (mandatory)
3. `docs/DECISIONS.md` — why things are the way they are
4. `docs/agents.md` — the agent team
5. `docs/ASSIGNMENT.md` — course requirements and grading

## AI tooling

This repo is configured for more than one assistant. Use whichever you have; they share the same specs, docs and workflow.

- **Kiro** reads custom agents from `.kiro/agents/`, MCP servers from `.kiro/settings/mcp.json`, and skills from `.kiro/skills/`. Although `.kiro/skills/` is a junction to `.claude/skills/` locally, git commits it as a full copy rather than a link, so `.kiro/skills/` must be kept in sync with `.claude/skills/`. This `AGENTS.md` is Kiro's always-on project context.
- **Claude Code** reads subagents from `.claude/agents/`, skills from `.claude/skills/`, the MCP server from `.mcp.json`, and context from `CLAUDE.md`.

The six team agents (orchestrator, backend-dev, frontend-dev, qa-tester, security-reviewer, devops) exist in both `.kiro/agents/` and `.claude/agents/`; keep the two in sync when you change a role. See `docs/agents.md`.

## Working rules

- **Prefer the simplest solution that works. Do not over-engineer** (constitution Principle XII). Choose plain files, existing tools and small scripts over new services, frameworks or automation. If a simple approach is enough for the academic scope, use it.
- **No code without a spec.** Every change comes from a user story run through the Spec Kit workflow (`specify` → `clarify` → `plan` → `tasks` → `analyze` → `implement`).
- **One user story = one Spec Kit feature** (one `specs/` folder, one branch, one PR). Technical stories (TS-xx) build the foundation; functional stories (US-xx) depend only on that foundation, never on each other.
- All code, comments, specs and docs in **English**. The UI is **Spanish by default** with an English switch.
- Edit files with the assistant's file tools, **not** with PowerShell commands: Windows PowerShell 5.1 corrupts non-ASCII characters (accents, dashes, emoji) when it rewrites files.
- Never use or commit real patient data, secrets, tokens or `.env` files.
- Triage scoring (NEWS2 for now) must stay behind a swappable module — it may be replaced by the Colombian triage regulation.
- Record which agent did what in the PR description (see `docs/agents.md`).
- When a roadmap step is completed, update `docs/PROJECT_STATUS.md` in the same PR. When a decision changes, add an entry to `docs/DECISIONS.md`.
- Do not run `specify init` again; Spec Kit is already set up.
