# Feature Specification: FastAPI App Skeleton

**Feature Branch**: `001-fastapi-app-skeleton`

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "TS-01 (Technical story): FastAPI app skeleton. As a developer, I want a minimal FastAPI backend in the backend/ folder with a GET /health endpoint that returns the app status and version, a pytest test suite with a passing test for /health, and documented commands to install dependencies, run the app locally and run the tests, so that the team has a working base to build every other backend story on. Depends on: None. Out of scope: database, authentication, deployment, frontend."

## User Story *(mandatory)*

**Story ID**: TS-01

**Type**: Technical

**Story**: As a developer, I want a minimal backend service in the `backend/` folder with a health check that reports the app status and version, an automated test suite with a passing test for that health check, and documented commands to install dependencies, run the app locally and run the tests, so that the team has a working base to build every other backend story on.

**Depends on**: None

### Acceptance Criteria

1. **AC1**: **Given** the backend is running locally, **When** a client sends a GET request to `/health`, **Then** it receives a success response (HTTP 200) whose JSON body contains a `status` field with the value `"ok"` and a `version` field with the app's current version.
2. **AC2**: **Given** a fresh clone of the repository, **When** a developer runs the documented test command from `backend/`, **Then** the test suite runs and the `/health` test passes.
3. **AC3**: **Given** a teammate with only the documented prerequisites installed, **When** they follow the documented commands to install dependencies and start the app, **Then** the app starts locally and `/health` answers as described in AC1.
4. **AC4**: **Given** the app version is defined in a single place, **When** that value is changed, **Then** `/health` reports the new version without any other code change.

### Out of Scope

- Database connection or database status in `/health` (TS-02).
- Authentication and protected routes (TS-06).
- Deployment, CI pipeline and cloud configuration (TS-09, TS-10).
- Frontend and CORS configuration (TS-04).
- Any clinical feature, scoring or patient data.

### Edge Cases

- A request to a path that does not exist returns a "not found" response, not a server error.
- A request to `/health` with a method other than GET (e.g. POST) is rejected with a "method not allowed" response.
- `/health` exposes no internal details (no stack traces, environment variables, paths or secrets).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The backend MUST live in the `backend/` folder of the repository, using the project's mandated stack (Python with FastAPI, constitution Principle X).
- **FR-002**: The backend MUST expose `GET /health` returning HTTP 200 with a JSON body `{"status": "ok", "version": "<app version>"}`.
- **FR-003**: The app version MUST be defined in exactly one place and reused by `/health`.
- **FR-004**: The backend MUST include an automated test suite (pytest) with at least one test per acceptance criterion that can be automated (AC1, AC4), runnable with a single command, that does not need the app to be started manually.
- **FR-005**: Dependencies MUST be declared in a file in `backend/` so they can be installed with one documented command.
- **FR-006**: The repository MUST document, in `backend/README.md` (linked from `DEVELOPMENT.md`), the prerequisites and the exact commands to install dependencies, run the app locally and run the tests.
- **FR-007**: The skeleton MUST NOT require any secret, `.env` file or external service to install, run or test.

### Key Entities

- **Health status**: the response of the health check; has a `status` (always `"ok"` when the app is up) and a `version` (the app's version string).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A teammate can go from a fresh clone to a running app answering the health check in under 10 minutes by following only the documentation.
- **SC-002**: 100% of the tests in the suite pass on a clean local setup with a single command.
- **SC-003**: The health check answers in under 1 second on a developer machine.
- **SC-004**: The full test suite completes in under 30 seconds.

## Assumptions

- The initial app version is `0.1.0`.
- Python 3.13 is the supported runtime (see DECISIONS D-02); a local virtual environment is used for dependencies.
- `/health` is public (no authentication); later stories (TS-02) may add fields such as database status without breaking `status` and `version`.
- The app runs locally on the default development port of the chosen server; the exact command is fixed in the plan.
- Running the test suite in CI is handled by TS-09, not by this story.
