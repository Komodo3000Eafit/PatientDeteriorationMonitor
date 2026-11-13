# Feature Specification: Database Tables and Migrations

**Feature Branch**: `003-db-tables-migrations`

**Created**: 2026-11-13

**Status**: Draft

**Input**: User description: "TS-03 — Database tables and migrations (technical story, depends on TS-02). As a developer, I want the database tables created and versioned through migrations so that every team member and every environment gets the same schema with one command. Tables (fields at a high level; exact types are for the plan): users: username (unique), password hash (never plain text), full name, role (doctor or nurse), created at. patients: synthetic identifier/name (no real patient data, D-09), age, sex, admitted at, current triage level (1–5, 1 = most urgent), status (active or discharged). vital_signs: patient, recorded at, respiratory rate, SpO2, on supplemental oxygen (yes/no), systolic blood pressure, heart rate, consciousness level (AVPU), temperature — the NEWS2 inputs (D-08). triage_events: patient, time, previous level, new level, score, reason, source (initial, automatic, manual), user who made it (optional). alerts: patient, created at, severity, message, status (open or acknowledged), acknowledged by and at (optional). Acceptance criteria: One documented command creates or upgrades the schema on the database in DATABASE_URL; running it twice changes nothing. A downgrade command removes the TS-03 tables. Relationships are enforced (every vital sign, triage event and alert belongs to an existing patient) and invalid values are rejected (e.g. triage level outside 1–5, unknown role). Automated tests check the schema definition and these rules without a real database or network (as in TS-02). The migration is applied to our Neon database once by hand and verified (tables listed); credentials never appear in code, logs or committed files. backend/README.md explains how to run the migrations. Out of scope: seed or demo data (TS-06, TS-08), API endpoints, scoring logic (TS-07). Keep it as simple as possible (D-23). Triage levels may later follow the Colombian scheme (D-08), so keep them as a plain 1–5 number."

## Clarifications

### Session 2026-11-13

- Q: Should the consciousness field accept the NEWS2 ACVPU scale (A, C = new confusion, V, P, U) or only classic AVPU? → A: ACVPU (`A`, `C`, `V`, `P`, `U`). All other assumptions in this spec are accepted as written.
- Q: How are the database rules checked against the real database, given the automated tests run without one? → A: During the one-time manual run on Neon, inside a transaction that is rolled back, try (1) a vital sign for a non-existent patient, (2) a triage level of 6, (3) an unknown user role, and confirm each is rejected; then run downgrade and upgrade once and confirm both work. This is a manual check recorded in the acceptance criteria and quickstart, not an automated test.

## User Story *(mandatory)*

**Story ID**: TS-03

**Type**: Technical

**Story**: As a developer, I want the database tables created and versioned through migrations, so that every team member and every environment gets the same schema with one command.

**Depends on**: TS-02

### Acceptance Criteria

1. **AC1**: **Given** `DATABASE_URL` points to an empty database, **When** a developer runs the documented upgrade command, **Then** the five tables `users`, `patients`, `vital_signs`, `triage_events` and `alerts` exist with the fields listed in Key Entities, and the database records which schema version it is at.
2. **AC2**: **Given** the schema is already at the latest version, **When** the developer runs the upgrade command again, **Then** it finishes successfully and nothing in the schema changes.
3. **AC3**: **Given** the schema is at the TS-03 version, **When** the developer runs the documented downgrade command, **Then** the five TS-03 tables are removed and the database is back at the state before TS-03.
4. **AC4**: **Given** the TS-03 schema, **When** someone tries to store a vital sign, triage event or alert for a patient that does not exist, or a triage event / alert that names a user that does not exist, **Then** the database rejects it.
5. **AC5**: **Given** the TS-03 schema, **When** someone tries to store an invalid value (triage level outside 1–5, a role other than doctor/nurse, a patient status other than active/discharged, an unknown consciousness level, triage source or alert status, an SpO2 outside 0–100, a duplicate username, or a missing required field), **Then** the database rejects it.
6. **AC6**: **Given** a fresh clone with no `.env` file and no network access, **When** a developer runs the documented test command, **Then** tests that check the schema definition (tables, fields, relationships and the rules in AC4–AC5) and the upgrade/downgrade steps run and pass without a real database.
7. **AC7**: **Given** the project's Neon database, **When** a developer applies the migration once by hand following the documentation, **Then** listing the database tables shows the five TS-03 tables, and no connection string or password appears in code, logs, command output pasted into the PR, or committed files.
8. **AC8**: **Given** the migration has just been applied to Neon (AC7), **When** the developer, inside a transaction that is then rolled back, tries to insert (1) a vital sign for a non-existent patient, (2) a patient with triage level 6 and (3) a user with an unknown role, **Then** the database rejects each one and no test row remains; and **When** the developer then runs the downgrade command followed by the upgrade command once, **Then** both succeed and the five tables are present again. This is a manual check (not an automated test), and its result is recorded in the PR.
9. **AC9**: **Given** a teammate reading `backend/README.md`, **When** they look for how to manage the schema, **Then** it explains the upgrade, downgrade and "which version am I at" commands and that they use the `DATABASE_URL` from TS-02.

### Out of Scope

- Seed or demo data, including demo users (TS-06) and synthetic patients/readings (TS-08).
- API endpoints, request/response schemas or any UI.
- Triage scoring or deterioration logic (TS-07, US-03, US-04); this story only stores the score and reason.
- Password hashing code (TS-06); this story only provides a field that holds a hash.
- Running migrations automatically on app start, in CI (TS-09) or on deployment (TS-10).
- Indexes or tuning beyond what relationships and uniqueness need.

### Edge Cases

- `DATABASE_URL` is missing or the database is unreachable: the migration command fails with a clear, generic message and exit status that is not zero, without printing the connection string or password.
- A migration fails halfway: the database is left as it was before that migration (no half-created schema).
- A triage event of source "initial" has no previous level; other triage events may also omit it, but when present it must be 1–5.
- A triage event or alert made by the system (automatic) has no user; a manual one may name the user who made it.
- An alert that is open has no "acknowledged by/at"; acknowledging it fills them (enforced only in that the referenced user must exist).
- Deleting a patient or user that still has related vital signs, triage events or alerts is rejected (patients are discharged, not deleted).
- The Neon database is asleep (scale-to-zero) when the command runs: it wakes up and the command completes; it does not need to be fast.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The schema MUST be defined by versioned migration files committed to the repository; the first (TS-03) migration creates the five tables described in Key Entities.
- **FR-002**: One documented command MUST upgrade the database in `DATABASE_URL` to the latest schema version; running it when already up to date MUST change nothing and succeed.
- **FR-003**: One documented command MUST downgrade the database by one version; downgrading from the TS-03 version MUST remove exactly the five TS-03 tables.
- **FR-004**: The migration commands MUST read the connection only from `DATABASE_URL` (the same setting and TLS behaviour as TS-02, D-31) and MUST NOT print the connection string or password, including in error output.
- **FR-005**: Every vital sign, triage event and alert MUST reference an existing patient; every user reference (triage event author, alert acknowledged by) MUST reference an existing user or be empty. Deleting a referenced patient or user MUST be rejected.
- **FR-006**: The database MUST reject values outside the allowed sets: triage levels (current, previous, new) only whole numbers 1–5; role only `doctor` or `nurse`; patient status only `active` or `discharged`; consciousness only `A`, `C`, `V`, `P`, `U`; triage source only `initial`, `automatic` or `manual`; alert status only `open` or `acknowledged`; alert severity only `low`, `medium` or `high`; sex only `female`, `male` or `other`.
- **FR-007**: The database MUST reject physically impossible values: SpO2 outside 0–100, age outside 0–130, negative respiratory rate, heart rate or systolic blood pressure, and a negative triage score.
- **FR-008**: Usernames and patient identifiers MUST be unique. The users table MUST store only a password hash, never a plain-text password field.
- **FR-009**: Required fields MUST NOT be missing (NULL): all fields listed in Key Entities except those marked optional. Rejecting blank text is input validation in the API stories.
- **FR-010**: Timestamps MUST include the time zone and default to the current time where they mark creation (`created at`, `admitted at`, `recorded at`, triage event time).
- **FR-011**: Automated tests MUST verify, without a real database, `.env` file or network access: that the five tables and their fields exist in the schema definition; that the relationships and rules in FR-005 to FR-009 are declared; and that the upgrade and downgrade steps create and drop the TS-03 tables.
- **FR-012**: `backend/README.md` MUST document the upgrade, downgrade and current-version commands, that they use `DATABASE_URL`, and how to list the tables to verify. The feature's quickstart MUST give the exact manual verification steps of AC7–AC8 (list tables; the three rejected inserts inside a rolled-back transaction; one downgrade + upgrade). `docs/PROJECT_STATUS.md` MUST note that the migration was applied to the Neon database and verified.
- **FR-013**: The schema MUST NOT contain any field for real patient identity (national ID, address, phone, insurance); patient identifiers and names are synthetic (D-09).

### Key Entities

Fields marked *(optional)* may be empty; all others are required.

- **User**: a clinician who can log in (accounts are created in TS-06). Fields: id, username (unique), password hash, full name, role (`doctor` | `nurse`), created at.
- **Patient**: a synthetic triaged patient being monitored. Fields: id, identifier (unique synthetic code, e.g. `PAT-001`), name (synthetic), age (years), sex (`female` | `male` | `other`), admitted at, current triage level (1–5, 1 = most urgent), status (`active` | `discharged`).
- **Vital sign reading**: one set of NEWS2 inputs for a patient at a point in time (D-08). Fields: id, patient, recorded at, respiratory rate (breaths/min), SpO2 (%), on supplemental oxygen (yes/no), systolic blood pressure (mmHg), heart rate (beats/min), consciousness (`A` | `C` | `V` | `P` | `U`), temperature (°C, one decimal).
- **Triage event**: a change of (or the first) triage level for a patient, with its explanation (constitution Principle V). Fields: id, patient, occurred at, previous level *(optional)*, new level, score *(optional)*, reason (text), source (`initial` | `automatic` | `manual`), made by user *(optional)*.
- **Alert**: a notice to clinicians about a patient. Fields: id, patient, created at, severity (`low` | `medium` | `high`), message (text), status (`open` | `acknowledged`, default `open`), acknowledged by user *(optional)*, acknowledged at *(optional)*.

Relationships: a patient has many vital sign readings, triage events and alerts; a user may author many triage events and acknowledge many alerts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A teammate with a configured `backend/.env` can bring an empty database to the current schema with a single command in under 2 minutes by following only `backend/README.md`.
- **SC-002**: Running the upgrade command a second time reports no changes, and upgrade → downgrade → upgrade ends with the same five tables.
- **SC-003**: 100% of the tests pass on a machine with no `.env` file and no network access, and the full suite completes in under 30 seconds.
- **SC-004**: Each invalid-value rule and each relationship in FR-005 to FR-008 is covered by at least one automated check.
- **SC-005**: The Neon database lists exactly the five TS-03 tables (plus the migration version record) after the manual run, and a search of the repository and the PR finds zero real connection strings or passwords.

## Assumptions

- The migration tool, folder layout, column types and how the tests inspect the schema are chosen in the plan (simplest option, D-23); reusing `app.db.database_url()` / `get_engine()` from TS-02 is expected.
- Consciousness uses the NEWS2 **ACVPU** scale (`C` = new confusion) because NEWS2 scores new confusion; the description's "AVPU" is read as this scale (confirmed in Clarifications).
- Alert severity uses three values (`low`, `medium`, `high`), matching NEWS2's low / medium / high clinical-risk bands; the mapping from score to severity belongs to TS-07/US-04.
- Triage levels are stored as plain numbers 1–5 with no NEWS2-specific meaning, so the Colombian scheme (Resolución 5596 de 2015, also 5 levels) can replace NEWS2 without a schema change (D-08).
- The current triage level is stored on the patient for simple listing (US-02); keeping it in step with the latest triage event is the job of the stories that change levels (US-01, US-04).
- No upper limits are enforced on respiratory rate, heart rate, blood pressure or temperature beyond non-negative values; plausibility checks belong to input validation in API stories.
- The migration is applied by hand against the Neon default branch (`neondb`, D-29); automatic migration on deploy is decided in TS-10.
- Tests without a database check the declared schema and the migration steps (for example by generating the SQL offline); that the database actually rejects bad rows, and that downgrade and upgrade work, is verified once by hand on Neon (AC8), not in the automated suite.
