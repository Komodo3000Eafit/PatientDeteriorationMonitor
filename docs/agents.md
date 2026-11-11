# AI Agent Team

> **Status:** agent files created in `.claude/agents/` (roadmap step 9). The design is still **subject to change** — edit the agent files and this page together.

We use a team of custom **Claude Code subagents** with differentiated roles (grading Modality B). All agents live in `.claude/agents/`. Each agent gets only the tools its role needs (least privilege).

> GitHub Copilot was planned as a second tool but is **on hold** (see DECISIONS D-15). The roles below can be split across tools again later without changing the workflow.

| Agent | File | Role and responsibilities | Tool access |
|---|---|---|---|
| **orchestrator** | `.claude/agents/orchestrator.md` | Reads the story's spec and tasks, decides which agent handles each task, verifies outputs against acceptance criteria, keeps traceability and the activity log | Read, search, delegate |
| **backend-dev** | `.claude/agents/backend-dev.md` | FastAPI endpoints, PostgreSQL models/migrations, swappable triage scoring module (NEWS2) | Read, edit, run |
| **frontend-dev** | `.claude/agents/frontend-dev.md` | React UI, Spanish by default with English switch, integration with the API | Read, edit, run |
| **qa-tester** | `.claude/agents/qa-tester.md` | Automated tests on critical paths (triage scoring, prediction, API, security); runs them and reports failures back to the orchestrator | Read, edit, run tests |
| **security-reviewer** | `.claude/agents/security-reviewer.md` | Input validation, secrets handling, dependency and OWASP checks. **Read-only**: reports findings, does not change code | Read, search |
| **devops** | `.claude/agents/devops.md` | CI/CD pipeline and deployment | Read, edit, run |

## How agents are invoked

- **Orchestrated (recommended for implementing a story):** start Claude Code with the orchestrator as the main agent:
  ```powershell
  claude --agent orchestrator
  ```
  Then ask it to implement the current story (e.g. *"Implement the story in specs/003-vitals-history using /speckit-implement"*). The orchestrator can delegate **only** to the five specialist agents.
- **Spec Kit steps** (`/speckit-specify`, `/speckit-clarify`, `/speckit-plan`, `/speckit-tasks`, `/speckit-analyze`) run in a normal `claude` session or the VS Code panel.
- **Manually:** in any Claude Code session, ask for one agent by name, e.g. *"Use the qa-tester agent to write tests for US-03"*.
- Agents are loaded when a session starts. After adding or editing an agent file, restart Claude Code. To check which agents are available, ask Claude: *"List the custom subagents available in this project"* (the old `/agents` command was removed from Claude Code).

### Who may change what

| Agent | Can edit | Runs commands |
|---|---|---|
| orchestrator | `tasks.md`, `agent-log.md`, `docs/` only | Yes (status checks) — never commits or pushes |
| backend-dev, frontend-dev, devops | Application / pipeline files for their task | Yes |
| qa-tester | Test files only — reports failures instead of fixing app code | Yes (runs tests) |
| security-reviewer | Nothing (read-only) | No |

## Evidence of collaboration

The assignment requires agents to **really** do the work, and declaring roles is not enough. We keep two kinds of evidence for every story:

1. **Automatic activity log (tamper-resistant).** Claude Code hooks (`.claude/settings.json`) call `scripts/log-agent-activity.ps1` on every agent event and append one JSON line to `logs/agent-activity/<branch>.jsonl`:
   - `delegate`: one agent hands a task to another (who → whom, task description)
   - `start` / `finish`: an agent begins and ends its work (with its final report)
   - `tool`: an agent edits or creates a file, or runs a command (e.g. tests)

   The log is written by Claude Code itself, not by the agents, so the agents can't invent it. One file per branch avoids merge conflicts between stories. **Commit the log with the story.**
2. **Human-readable summary.** The orchestrator keeps `specs/<feature>/agent-log.md` and generates `specs/<feature>/agent-report.md` from the automatic log:
   ```powershell
   .\scripts\agent-report.ps1 -Out specs\<feature>\agent-report.md
   ```
   The report shows the delegations, which files each agent changed, the commands it ran and its results. Paste it into the pull request description.

Full conversation transcripts of every agent are also saved by Claude Code on the developer's computer (under the user's `.claude/projects/` folder). They're not committed, but they can be shown live during the demo as extra proof.

Example of the summary:

```
Story: US-03 — Show vital signs history
- orchestrator: split tasks T001–T006, assigned to agents
- backend-dev: T001–T003 (endpoint + query)
- frontend-dev: T004 (chart component)
- qa-tester: T005 (API tests) — found 1 failure, fixed by backend-dev
- security-reviewer: T006 (validation review) — no issues
```
