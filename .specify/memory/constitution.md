<!--
Sync Impact Report
==================
Version change: (unversioned template) → 1.0.0
Bump rationale: Initial ratification; all placeholders replaced with project-specific governance.

Modified principles (template slot → new title):
- [PRINCIPLE_1_NAME] → I. Spec-Driven and Traceable (NON-NEGOTIABLE)
- [PRINCIPLE_2_NAME] → II. Small Scrum User Stories
- [PRINCIPLE_3_NAME] → III. Story Types and Independence
- [PRINCIPLE_4_NAME] → IV. Multi-Agent Collaboration
- [PRINCIPLE_5_NAME] → V. Swappable and Explainable Clinical Logic

Added principles (beyond the 5 template slots, per user request for 12):
- VI. Data Privacy (NON-NEGOTIABLE)
- VII. Critical-Path Testing
- VIII. Security Baseline
- IX. Full-Stack, Deployable and Low-Cost
- X. Technology Constraints
- XI. Language
- XII. Simplicity

Added sections:
- Product Context and Scope (top of document)
- Technology and Deployment Constraints (SECTION_2)
- Development Workflow and Quality Gates (SECTION_3)
- Governance (filled)

Removed sections: none

Templates requiring updates (not modified by this command; they read the constitution at runtime):
- ⚠ .specify/templates/plan-template.md — "Constitution Check" gate should be filled per feature
  against Principles I–XII.
- ⚠ .specify/templates/spec-template.md — user stories should use the "As a <role>, I want...,
  so that..." format with acceptance criteria and a TS-xx / US-xx identifier.
- ⚠ .specify/templates/tasks-template.md — tests are mandatory for critical paths (Principle VII),
  not optional.

Follow-up TODOs:
- Principle XII input was truncated ("avoid over-engineering given the academic"); completed as
  "given the academic scope and timeline". Team to confirm during review (DECISIONS D-14).
- Constitution is a draft by one member, pending team review via PR (DECISIONS D-14).
-->

# PatientDeteriorationMonitor Constitution

## Product Context and Scope

PatientDeteriorationMonitor is a **digital twin of a patient after triage classification**. It
monitors vital signs every 5 minutes and predicts whether the patient's condition will
deteriorate, so the patient's triage level can be escalated to a more urgent one and they are
attended sooner.

- **Theoretical users:** doctors and nurses.
- **Actual user:** the course professor evaluating the project.
- **Team and deadline:** academic team project, 4 students, delivery 2026-11-24.
- **Method:** Spec-Driven Development with GitHub Spec Kit v1.3.3 and Claude Code.
- **Status:** this is NOT a certified medical device. It is a decision-support prototype for
  academic purposes only, and the UI MUST state this.

## Core Principles

### I. Spec-Driven and Traceable (NON-NEGOTIABLE)

- Every feature MUST start as a spec created through the Spec Kit workflow
  (`/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` →
  `/speckit-analyze` → `/speckit-implement`).
- No code MAY be written without a spec that requires it.
- Every user story MUST be traceable spec → plan → tasks → code → tests → deployment. Tasks
  MUST reference their story ID, and tests MUST reference the acceptance criteria they verify.

**Rationale:** Spec-Driven Development is the core of the assignment; traceability is how the
team proves each delivered behavior was specified, built and verified.

### II. Small Scrum User Stories

- User stories MUST use the format "As a <role>, I want <goal>, so that <benefit>" and MUST
  include testable acceptance criteria.
- Each story MUST be short, readable and small enough for one student to specify and implement
  in 5–10 minutes.
- One user story = one Spec Kit feature = one `specs/` folder, one branch and one pull request.

**Rationale:** each student must build a story live in class; small, isolated stories make that
feasible and keep reviews focused.

### III. Story Types and Independence

- **Technical stories (TS-xx)** set up the architecture (e.g. PostgreSQL database, FastAPI app,
  frontend–backend connection, CI/CD, deployment) and form the baseline foundation.
- **Functional stories (US-xx)** add app features. They MAY depend only on the technical
  baseline.
- A functional story MUST NOT depend on, or modify code introduced by, another functional story.
  Shared needs MUST be moved into a technical story first.

**Rationale:** functional stories must be buildable concurrently by different students without
merge conflicts.

### IV. Multi-Agent Collaboration

- Development MUST use a team of Claude Code subagents in `.claude/agents/` with differentiated
  responsibilities:
  - **orchestrator** — assigns tasks to agents and verifies results against acceptance criteria;
  - **backend-dev** — FastAPI, database, clinical scoring module;
  - **frontend-dev** — React UI and i18n;
  - **qa-tester** — automated tests on critical paths;
  - **security-reviewer** — read-only; reports findings and MUST NOT change code;
  - **devops** (optional) — CI/CD and deployment.
- Each agent MUST have only the tools its role needs (least privilege).
- Agents MUST actually execute the work, and each story's pull request MUST record which agent
  did what (see `docs/agents.md`).

**Rationale:** the project is graded under the multi-agent modality, which requires
demonstrable, real collaboration between differentiated agents.

### V. Swappable and Explainable Clinical Logic

- Triage and deterioration scoring MUST be implemented behind a replaceable module/interface.
  NEWS2 is the current implementation.
- No code outside the scoring module MAY depend on NEWS2-specific rules or thresholds.
- Every escalation or alert MUST show which vital signs and which rules produced it.

**Rationale:** the project must comply with Colombian regulations, and the official Colombian
triage scheme may replace NEWS2; clinicians must be able to understand and challenge any
automated recommendation.

### VI. Data Privacy (NON-NEGOTIABLE)

- Only public de-identified datasets or synthetic data MAY be used.
- Real patient data, credentials, tokens, secrets and `.env` files MUST NOT be stored in the
  repository or committed.

**Rationale:** health data is highly sensitive; an academic prototype has no legal basis to
process real patient information.

### VII. Critical-Path Testing

- Automated tests are MANDATORY for: triage scoring, deterioration prediction, API endpoints and
  security controls.
- Tests MUST run in CI and MUST pass before a pull request is merged.

**Rationale:** these paths determine whether a patient is escalated; a silent regression there
defeats the purpose of the product.

### VIII. Security Baseline

- All API endpoints MUST validate their input.
- Clinical views MUST require authentication.
- Secrets MUST be provided only through environment variables (and GitHub secrets in CI).
- Dependencies MUST be checked for known vulnerabilities in CI.
- Basic OWASP practices MUST be followed (e.g. no injection, safe error messages, CORS
  restricted to known origins).

**Rationale:** even a prototype handling simulated clinical data must demonstrate secure
engineering practice, and security is part of the grading.

### IX. Full-Stack, Deployable and Low-Cost

- The app MUST include a frontend, a backend API and a database, and MUST be deployed to a
  publicly accessible environment.
- Any teammate MUST be able to install and run the app locally from documented instructions.
- Cloud costs MUST stay within free plans and the Azure for Students credit (see "Technology and
  Deployment Constraints").

**Rationale:** the deliverable is a working, reachable product, built by students with no
budget.

### X. Technology Constraints

- Backend: Python with FastAPI.
- Frontend: React.
- Database: PostgreSQL.
- Deviations require a constitution amendment.

**Rationale:** a fixed stack keeps four students and their agents working on compatible code.

### XI. Language

- All code, comments, specs, plans, tasks and documentation MUST be in English.
- The user interface MUST be in Spanish by default, with an option to switch to English.

**Rationale:** English keeps the engineering artifacts consistent; the end users are Spanish
speakers.

### XII. Simplicity

- The simplest solution that meets the spec MUST be preferred.
- Over-engineering MUST be avoided given the academic scope and timeline; any added complexity
  (new service, framework, abstraction or infrastructure) MUST be justified in the plan's
  Complexity Tracking section.

**Rationale:** the deadline is short and the team is small; unneeded complexity is the main
risk to delivery.

## Technology and Deployment Constraints

- **Database:** PostgreSQL on Neon (free plan).
- **Backend:** FastAPI on Azure App Service (Azure for Students credit).
- **Frontend:** React on Azure Static Web Apps (Azure for Students credit).
- **CI/CD:** GitHub Actions runs the tests and deploys to Azure using OIDC federation. Cloud
  credentials MUST NOT be stored in the repository.
- **Secrets:** database connection strings and other secrets are provided only through
  environment variables and GitHub secrets.
- **Cost control:** any process that keeps the database awake continuously (such as the vital
  signs simulator) MUST run only during testing and demos.
- **Monitoring cadence:** the product model assumes a new vital-signs reading every 5 minutes;
  simulators MAY accelerate this for demos.

## Development Workflow and Quality Gates

1. A story is written in the Scrum format with a TS-xx or US-xx identifier (Principles II–III).
2. The story is run through the full Spec Kit workflow on its own branch (Principle I).
3. The plan's Constitution Check MUST pass, or violations MUST be justified in Complexity
   Tracking.
4. The orchestrator assigns tasks to agents; agents execute them (Principle IV).
5. The pull request MUST include:
   - a link to the story's `specs/` folder;
   - the agent activity log (which agent did what);
   - passing CI (tests and dependency checks);
   - the security-reviewer's findings, if any, and how they were resolved.
6. When a roadmap step is completed, `docs/PROJECT_STATUS.md` MUST be updated in the same pull
   request. When a decision changes, an entry MUST be added to `docs/DECISIONS.md`.
7. A pull request is merged only after at least one teammate reviews it and CI passes.

## Governance

- This constitution supersedes all other practices and guidance files. Runtime guidance for
  Claude Code lives in `CLAUDE.md` and `docs/`; where they conflict with this document, this
  document wins and the conflicting file MUST be corrected.
- **Amendments** are proposed via pull request that edits this file, states the reason, and adds
  an entry to `docs/DECISIONS.md`. They require approval from the team (per DECISIONS D-14, the
  initial draft is reviewed and amended by the whole team).
- **Versioning** follows semantic versioning:
  - MAJOR — a principle is removed or redefined in a backward-incompatible way;
  - MINOR — a principle or section is added or materially expanded;
  - PATCH — clarifications and wording fixes.
- **Compliance review:** every plan MUST pass the Constitution Check, `/speckit-analyze` MUST be
  run before implementation, and every pull request review MUST verify compliance with these
  principles.

**Version**: 1.0.0 | **Ratified**: 2026-11-10 | **Last Amended**: 2026-11-10
