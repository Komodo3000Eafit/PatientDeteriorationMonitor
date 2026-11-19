# PatientDeteriorationMonitor — Context for Claude Code

Academic team project (4 students, deadline 2026-11-24): a **digital twin of a triaged patient** that monitors vital signs every 5 minutes, measures NEWS2 risk and predicts deterioration, and suggests re-triage to a more urgent level. A clinician decides the triage level; the app never changes it on its own. Built with **Spec-Driven Development** using GitHub Spec Kit v1.3.3.

## Read before starting any work

1. `docs/PROJECT_STATUS.md` — current step and what comes next
2. `.specify/memory/constitution.md` — project principles (mandatory)
3. `docs/DECISIONS.md` — why things are the way they are
4. `docs/agents.md` — the agent team (Claude Code subagents in `.claude/agents/`)
5. `docs/ASSIGNMENT.md` — course requirements and grading
6. `docs/GLOSSARY.md` — ubiquitous language (code/API terms in English, UI terms in Spanish)

## Working rules

- **Prefer the simplest solution that works. Do not over-engineer** (constitution Principle XII). Choose plain files, existing tools and small scripts over new services, frameworks or automation. If a simple approach is enough for the academic scope, use it.
- **No code without a spec.** Every change comes from a user story run through the Spec Kit workflow (`/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement`).
- **One user story = one Spec Kit feature** (one `specs/` folder, one branch, one PR). Technical stories (TS-xx) build the foundation; functional stories (US-xx) depend only on that foundation, never on each other.
- **Use the glossary terms** (`docs/GLOSSARY.md`) in specs, code, API fields and UI text. A new term is added to the glossary in the same PR that introduces it (D-40).
- All code, comments, specs and docs in **English**. The UI is **Spanish by default** with an English switch.
- Edit files with Claude's file tools (Edit/Write), **not** with PowerShell commands: Windows PowerShell 5.1 corrupts non-ASCII characters (accents, dashes, emoji) when it rewrites files.
- Never use or commit real patient data, secrets, tokens or `.env` files.
- Risk scoring (NEWS2) must stay behind a swappable module. NEWS2 measures risk from vital signs; the triage level (Triage I–V, Res. 5596 de 2015) is a professional's classification, so one does not replace the other (see `docs/GLOSSARY.md` §1.1).
- Record which agent did what in the PR description (see `docs/agents.md`).
- When a roadmap step is completed, update `docs/PROJECT_STATUS.md` in the same PR. When a decision changes, add an entry to `docs/DECISIONS.md`.
- Do not run `specify init` again; Spec Kit is already set up.
