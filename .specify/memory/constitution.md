<!--
Sync Impact Report
==================
Version change: 1.3.0 → 1.4.0 (MINOR)
Bump rationale: Principle III materially expanded with one new exception (DECISIONS D-58); no
principle removed or redefined incompatibly:
- New page-extension exception: a team-session functional story whose backlog text extends a page
  built by a baseline story it depends on (first case: US-09 on US-02's patient list) MAY edit that
  page's own components, if the baseline behavior is unchanged when the new feature is not used and
  the baseline story's tests keep passing; every such edit MUST be named in the story's decision and
  PR notes. Edits to any other story's code stay forbidden.
- Rationale extended: US-02's `PatientTable` loads its own data and takes no props, so US-09 could
  otherwise only add filter/sort by duplicating the table (Principle XII).

Modified principles: III. Story Types and Independence (one new rule + rationale). No renames.
Added sections: none. Removed sections: none.

Templates:
- ⚠ .specify/templates/plan-template.md — its Principle III check line lists only "registering a
  route or mounting a component"; read it with the v1.3.0 test-assertion exceptions and the new
  v1.4.0 page-extension exception (not edited by this command; follow-up).
- ⚠ .specify/templates/spec-template.md — comment still predates v1.3.0 (see previous report).
- ✅ tasks-template.md, checklist-template.md — no change needed.

Runtime guidance flagged (not modified by this command; follow-up):
- ⚠ CLAUDE.md "never on each other" wording (see previous report); also does not mention the
  page-extension exception.
- docs/DECISIONS.md D-58 records this amendment (same change).

Follow-up TODOs: none.

Previous report (1.3.0):
Version change: 1.2.0 → 1.3.0 (MINOR)
Bump rationale: Principle III materially expanded (DECISIONS D-52); no principle removed or
redefined incompatibly:
- Baseline functional stories (US-01 to US-05) MAY now depend on baseline functional stories
  already merged into `main` (the rule US-06 to US-10 already had), never on unmerged ones.
- New rule: a functional story MAY reuse, by importing without changing them, components,
  helpers and API contracts of merged functional stories (e.g. US-03 `RiskBandBadge`, readings
  contract).
- The "MUST NOT modify another functional story's code" exceptions now also allow updating a
  test assertion that depends only on placeholder content the story replaces, and narrowing an
  assertion in another story's test when the new story's legitimate behavior makes it ambiguous,
  keeping the test's intent unchanged (first used by US-02).
- Rationale extended: US-02, US-04 and US-05 need US-03's stored scores (D-50 forbids
  recomputing NEWS2).

Modified principles: III. Story Types and Independence (rules + rationale). No renames.
Added sections: none. Removed sections: none.

Templates:
- ⚠ .specify/templates/spec-template.md — its comment still says "US-01 to US-05 may depend ONLY
  on technical stories"; read it as superseded by v1.3.0 (not edited by this command; follow-up).
- ✅ .specify/templates/plan-template.md — Principle III check ("dependencies match
  docs/BACKLOG.md; ... no changes to another functional story's code beyond registering a route
  or mounting a component") remains valid; the new placeholder-assertion exception applies.
- ✅ tasks-template.md, checklist-template.md — no change needed.

Runtime guidance flagged (not modified by this command; follow-up):
- ⚠ CLAUDE.md "functional stories (US-xx) depend only on that foundation, never on each other"
  contradicts v1.3.0 for merged baseline stories.
- ⚠ .specify/templates/spec-template.md comment (see above).
- docs/BACKLOG.md US-02 dependencies updated in the same change (D-52).

Follow-up TODOs: none.

Previous report (1.2.0):
Version change: 1.1.0 → 1.2.0 (MINOR)
Bump rationale: materially expanded guidance, no principle removed or redefined
incompatibly (DECISIONS D-41):
- Product Context: the app monitors NEWS2 risk and suggests re-triage; a clinician decides the
  triage level (Triage I–V, Res. 5596 de 2015); the app never changes it on its own.
- Principle V (Swappable and Explainable Clinical Logic): rationale no longer says the Colombian
  triage scheme may replace NEWS2 (NEWS2 measures risk; triage is a professional's
  classification; GLOSSARY §1.1). Rule wording aligned: "risk scoring and deterioration
  prediction" instead of "triage and deterioration scoring"; "re-triage suggestion" instead of
  "escalation".
- Principle VII (Critical-Path Testing): rationale wording aligned ("suggested for re-triage"
  instead of "escalated"); rule unchanged.
- Technology and Deployment Constraints: frontend and backend deploy together on one Azure App
  Service, FastAPI serves the React build (D-39); Azure Static Web Apps removed.
- Development Workflow: new step 2, glossary rule (D-40); later steps renumbered 3–8.

Modified principles: V (rationale + wording), VII (rationale wording). No renames.
Added sections: none (new workflow step only). Removed sections: none.

Templates:
- ✅ .specify/templates/plan-template.md — Principle IX check now "Neon / one Azure App Service
  (FastAPI serves the React build) / GitHub Actions"; Principle V check reworded to risk scoring
  and re-triage suggestions; Principle XI check adds glossary terms.
- ✅ .specify/templates/spec-template.md, tasks-template.md, checklist-template.md — no change
  needed (no references to hosting, triage escalation or terminology).

Runtime guidance flagged (not modified by this command; follow-up):
- ⚠ CLAUDE.md line 3 ("escalating the patient to a more urgent triage level") and line 23
  ("may be replaced by the Colombian triage regulation") contradict v1.2.0.
- ⚠ .claude/agents/backend-dev.md and frontend-dev.md say "every escalation"; read as
  "every re-triage suggestion".
- Merged specs 003, 004, 007 keep their original wording as history; the constitution and
  glossary take precedence (D-41).

Follow-up TODOs: none.

Previous report (1.1.0):
Version change: 1.0.0 → 1.1.0 (MINOR)
Bump rationale: Principle III expanded — team-session stories (US-06 to US-10) may depend on
merged baseline functional stories (US-01 to US-05), never on each other. Backlog lives in
docs/BACKLOG.md (DECISIONS D-25).
Templates: no further changes needed (D-24 edits already cover story IDs and dependencies).

Previous report (1.0.0):
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
monitors vital signs every 5 minutes, measures the patient's NEWS2 risk and predicts whether their
condition will deteriorate. When it does, the app **suggests re-triage** to a more urgent level so
the patient can be attended sooner; **a clinician decides** the triage level (Triage I–V,
Resolución 5596 de 2015). The app MUST NOT change a patient's triage level on its own.

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
- **Functional stories (US-xx)** add app features:
  - **Baseline functional stories (US-01 to US-05)** MAY depend on technical stories and on
    baseline functional stories already merged into `main`, and MUST NOT depend on unmerged ones.
  - **Team-session functional stories (US-06 to US-10)** MAY depend on technical stories and on
    baseline functional stories already merged into `main`, but MUST NOT depend on each other.
- A functional story MAY reuse, by importing them without changing them, the components, helpers
  and API contracts of functional stories already merged into `main` (for example US-03's
  `RiskBandBadge` and readings contract).
- A functional story MUST NOT modify code introduced by another functional story, except to
  register a route, mount a component, update a test assertion that depends only on placeholder
  content the story replaces, or narrow an assertion in another story's test when the new story's
  legitimate behavior makes it ambiguous, keeping the test's intent unchanged. A shared need that requires changing another story's code MUST be
  moved into a technical story first.
- **Page-extension exception:** a team-session functional story whose backlog text extends a page
  built by a baseline story it depends on (for example US-09 "filter and sort the patient list" on
  US-02's patient list) MAY edit that page's own components, provided that (1) the baseline
  behavior stays unchanged when the new feature is not used, and (2) the baseline story's tests
  keep passing. Every such edit MUST be named in the story's decision (`docs/DECISIONS.md`) and in
  its PR notes. It does not allow edits to any other story's code.
- The backlog and each story's dependencies are kept in `docs/BACKLOG.md`.

**Rationale:** functional stories must be buildable concurrently by different students without
merge conflicts. Baseline stories are merged into `main` one by one, and some need the result of
an earlier one: US-02, US-04 and US-05 need the stored scores from US-03, because NEWS2 MUST NOT be
recomputed outside the scoring flow (DECISIONS D-50). Depending only on merged work, and reusing it
without changing it, keeps that safe. The page-extension exception exists because some baseline
components load their own data and take no props (US-02's `PatientTable`), so a story that extends
that page could otherwise only add its feature by duplicating the component, which Principle XII
rejects (never copy and paste UI); the two conditions and the named edits keep the baseline story
safe and reviewable (DECISIONS D-58).

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

- Risk scoring and deterioration prediction MUST be implemented behind a replaceable
  module/interface. NEWS2 is the current scoring system.
- No code outside the scoring module MAY depend on NEWS2-specific rules or thresholds.
- Every alert or re-triage suggestion MUST show which vital signs and which rules produced it.

**Rationale:** NEWS2 measures risk from vital signs, while the triage level is a professional's
classification (Triage I–V, Resolución 5596 de 2015), so one cannot replace the other (see
`docs/GLOSSARY.md` §1.1); keeping the scoring swappable still lets the team change or refine the
risk score without touching the rest of the app. Clinicians must be able to understand and
challenge any automated recommendation.

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

**Rationale:** these paths determine whether a patient is suggested for re-triage; a silent
regression there
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
- **App hosting:** frontend and backend deploy together on **one Azure App Service** (Azure for
  Students credit). FastAPI serves the React production build, so frontend and API share one
  origin and CORS is needed only for local development (DECISIONS D-39).
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
2. Specs, code, API fields and UI text MUST use the preferred terms in `docs/GLOSSARY.md`. A new
   term MUST be added to the glossary in the same pull request that introduces it (DECISIONS
   D-40).
3. The story is run through the full Spec Kit workflow on its own branch (Principle I).
4. The plan's Constitution Check MUST pass, or violations MUST be justified in Complexity
   Tracking.
5. The orchestrator assigns tasks to agents; agents execute them (Principle IV).
6. The pull request MUST include:
   - a link to the story's `specs/` folder;
   - the agent activity log (which agent did what);
   - passing CI (tests and dependency checks);
   - the security-reviewer's findings, if any, and how they were resolved.
7. When a roadmap step is completed, `docs/PROJECT_STATUS.md` MUST be updated in the same pull
   request. When a decision changes, an entry MUST be added to `docs/DECISIONS.md`.
8. A pull request is merged only after at least one teammate reviews it and CI passes.

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

**Version**: 1.4.0 | **Ratified**: 2026-11-10 | **Last Amended**: 2026-11-24
