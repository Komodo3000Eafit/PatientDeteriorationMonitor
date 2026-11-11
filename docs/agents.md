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
| orchestrator | `tasks.md`, `docs/` only | Yes (status checks and the log script) — never commits or pushes |
| backend-dev, frontend-dev, devops | Application / pipeline files for their task | Yes |
| qa-tester | Test files only — reports failures instead of fixing app code | Yes (runs tests) |
| security-reviewer | Nothing (read-only; the orchestrator logs its work) | No |

## Evidence of collaboration

The assignment requires agents to **really** do the work. Every story has an **agent activity log**: `specs/<feature>/agent-log.csv`, committed with the story. It opens in Excel or VS Code.

Rows are added with one script, which fills in the timestamp and the story automatically (from the current branch):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/log-agent.ps1 -Agent backend-dev -Task T001 -Action done -Details "Created POST /vitals"
```

| Who | Logs |
|---|---|
| orchestrator | `assigned` before each delegation; `verified` or `rework` after checking a result; the security-reviewer's `done` and `finding` rows |
| backend-dev, frontend-dev, qa-tester, devops | Their own `started` and `done` / `failed` rows |

Actions: `assigned`, `started`, `done`, `failed`, `finding`, `verified`, `rework`. Outside a story branch, rows go to `logs/agent-log.csv`.

Example:

```
"Timestamp","Story","Agent","Task","Action","Details"
"2026-11-12 10:02:11","003-vitals-history","orchestrator","T001","assigned","Assigned to backend-dev: endpoint GET /patients/{id}/vitals"
"2026-11-12 10:02:15","003-vitals-history","backend-dev","T001","started",""
"2026-11-12 10:04:40","003-vitals-history","backend-dev","T001","done","Added endpoint and query in backend/app/vitals.py"
"2026-11-12 10:05:02","003-vitals-history","orchestrator","T001","verified","Meets AC1 and AC2"
"2026-11-12 10:07:30","003-vitals-history","qa-tester","T005","failed","test_vitals_range fails; backend-dev to fix"
```

At the end of the story the orchestrator summarizes the log for the pull request description. Claude Code also keeps every agent's full conversation on the developer's computer, which can be shown live during the demo as extra proof.
