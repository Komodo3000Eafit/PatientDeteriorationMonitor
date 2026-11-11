# AI Agent Team

> **Status:** agreed design, **subject to change**. Agent files are created in roadmap step 9 (see [PROJECT_STATUS.md](PROJECT_STATUS.md)).

We use a team of custom **Claude Code subagents** with differentiated roles (grading Modality B). All agents live in `.claude/agents/`. Each agent gets only the tools its role needs (least privilege).

> GitHub Copilot was planned as a second tool but is **on hold** (see DECISIONS D-15). The roles below can be split across tools again later without changing the workflow.

| Agent | File | Role and responsibilities | Tool access |
|---|---|---|---|
| **orchestrator** | `.claude/agents/orchestrator.md` | Reads the story's spec and tasks, decides which agent handles each task, verifies outputs against acceptance criteria, keeps traceability and the activity log | Read, search, delegate |
| **backend-dev** | `.claude/agents/backend-dev.md` | FastAPI endpoints, PostgreSQL models/migrations, swappable triage scoring module (NEWS2) | Read, edit, run |
| **frontend-dev** | `.claude/agents/frontend-dev.md` | React UI, Spanish by default with English switch, integration with the API | Read, edit, run |
| **qa-tester** | `.claude/agents/qa-tester.md` | Automated tests on critical paths (triage scoring, prediction, API, security); runs them and reports failures back to the orchestrator | Read, edit, run tests |
| **security-reviewer** | `.claude/agents/security-reviewer.md` | Input validation, secrets handling, dependency and OWASP checks. **Read-only**: reports findings, does not change code | Read, search |
| *devops (optional)* | `.claude/agents/devops.md` | CI/CD pipeline and deployment | Read, edit, run |

## How agents are invoked

- **Automatically:** the main Claude Code session (or the orchestrator) delegates to a subagent when a task matches the subagent's `description`. Clear descriptions matter.
- **Manually:** ask for one by name, e.g. *"Use the qa-tester agent to write tests for US-03"*.
- Subagents are loaded when a session starts. After adding or editing an agent file, restart Claude Code or run `/agents`.

## Evidence of collaboration

The assignment requires agents to **really** do the work. For every user story, record in the pull request description (or `docs/agents-log.md`) which agent did what:

```
Story: US-03 — Show vital signs history
- orchestrator: split tasks T001–T006, assigned to agents
- backend-dev: T001–T003 (endpoint + query)
- frontend-dev: T004 (chart component)
- qa-tester: T005 (API tests) — found 1 failure, fixed by backend-dev
- security-reviewer: T006 (validation review) — no issues
```
