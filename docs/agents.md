# AI Agent Team

> **Status:** agreed design, **subject to change**. Agent files are created in roadmap step 10 (see [PROJECT_STATUS.md](PROJECT_STATUS.md)).

We use a team of custom agents with differentiated roles across **Claude Code** and **GitHub Copilot** (grading Modality B). Each agent gets only the tools its role needs (least privilege).

| Agent | Tool | File | Role and responsibilities | Tool access |
|---|---|---|---|---|
| **orchestrator** | Claude Code (main session) | `.claude/agents/orchestrator.md` | Reads the story's spec and tasks, decides which agent handles each task, verifies outputs against acceptance criteria, keeps traceability and the activity log | Read, search, delegate |
| **backend-dev** | Claude Code | `.claude/agents/backend-dev.md` | FastAPI endpoints, PostgreSQL models/migrations, swappable triage scoring module (NEWS2) | Read, edit, run |
| **qa-tester** | Claude Code | `.claude/agents/qa-tester.md` | Automated tests on critical paths (triage scoring, prediction, API, security); runs them and reports failures back to the orchestrator | Read, edit, run tests |
| **frontend-dev** | GitHub Copilot | `.github/agents/frontend-dev.agent.md` | React UI, Spanish by default with English switch, integration with the API | Read, edit, run |
| **security-reviewer** | GitHub Copilot | `.github/agents/security-reviewer.agent.md` | Input validation, secrets handling, dependency and OWASP checks. **Read-only**: reports findings, does not change code | Read, search |
| *devops (optional)* | GitHub Copilot | `.github/agents/devops.agent.md` | CI/CD pipeline and deployment | Read, edit, run |

## How agents are invoked

- **Claude Code:** the main session acts as orchestrator and delegates to subagents. You can also call one directly: *"Use the qa-tester agent to write tests for US-03"*.
- **Copilot (VS Code):** pick the agent from the agent dropdown in Copilot Chat. Handoffs between Copilot agents only work in VS Code.

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
