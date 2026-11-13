# Feature Specification: Language and Disclaimer

**Feature Branch**: `005-language-disclaimer`

**Created**: 2026-11-13

**Status**: Draft

**Input**: User description: "TS-05 — Language and disclaimer (technical story, depends on TS-04). As a clinician using the app, I want the interface in Spanish by default with a switch to English, and a clear notice that this is an academic prototype, so that I can read the app in my language and never mistake it for a certified medical tool. Acceptance criteria: All UI text (currently the TS-04 start page) comes from one place per language (Spanish and English); no visible text is hard-coded in components. Later screens add their texts the same way. Spanish is the default on first visit. A visible language switch (ES / EN) changes all visible text immediately, without reloading the page or calling the backend again. The chosen language is remembered in this browser for the next visit; if that storage isn't available, the app still works and falls back to Spanish. The page's language attribute (html lang) matches the selected language. A disclaimer banner is always visible on every page, in the selected language: Spanish "Prototipo académico: no es un dispositivo médico certificado." / English "Academic prototype: not a certified medical device." It cannot be closed or hidden. If a text is missing in English, the Spanish text is shown instead of a blank or a key name. Automated frontend tests (no backend, no network) cover: Spanish default, switching to English and back, the remembered choice, the html lang attribute, the banner in both languages, and the missing-text fallback. Existing TS-04 tests keep passing. frontend/README.md explains how to add or change texts. Out of scope: translating backend messages or API data, more languages, login (TS-06), deployment (TS-11). Keep it as simple as possible (D-23): prefer a small translations module over an i18n library unless the plan shows a clear need."

## Clarifications

### Session 2026-11-13

- All assumptions in this spec are accepted as written (user, 2026-11-13).
- Q: On long pages, should the disclaimer banner stay pinned at the top of the screen while scrolling, or scroll away with the content? → A: Pinned: it stays at the top of the screen while the page content scrolls below it.

## User Story *(mandatory)*

**Story ID**: TS-05

**Type**: Technical

**Story**: As a clinician using the app, I want the interface in Spanish by default with a switch to English, and a clear notice that this is an academic prototype, so that I can read the app in my language and never mistake it for a certified medical tool.

**Depends on**: TS-04

### Acceptance Criteria

1. **AC1**: **Given** the frontend code, **When** a developer looks for the text shown on the start page, **Then** every visible text (title, status messages, switch labels, banner) is defined once per language in one Spanish and one English text collection kept in a single place, and no component contains visible text of its own.
2. **AC2**: **Given** a browser that has never opened the app (nothing remembered), **When** the start page loads, **Then** all visible text is in Spanish, including the banner and the browser tab title.
3. **AC3**: **Given** the start page in Spanish after the `/health` result is shown, **When** the user selects **EN** in the language switch, **Then** all visible text changes to English immediately, without a page reload and without a new call to the backend, and the `/health` result already shown is kept (now in English); **and When** the user selects **ES**, **Then** it changes back to Spanish the same way.
4. **AC4**: **Given** the user selected English, **When** they open or reload the app later in the same browser, **Then** it starts in English; **and Given** the browser's storage is unavailable or holds an unknown value, **When** the app loads or the user switches language, **Then** it shows no error, starts in Spanish, and the switch still works for the current visit.
5. **AC5**: **Given** any selected language, **When** the page is shown, **Then** the document's language attribute is `es` for Spanish and `en` for English, and it updates when the language is switched.
6. **AC6**: **Given** any page of the app and any state of it (checking, ok, database unavailable, backend unreachable), **When** it is shown, **Then** a disclaimer banner is visible with the text `Prototipo académico: no es un dispositivo médico certificado.` in Spanish or `Academic prototype: not a certified medical device.` in English, and it has no close, hide or dismiss control.
7. **AC7**: **Given** a text that exists in Spanish but is missing in English, **When** English is selected, **Then** that text appears in Spanish instead of being blank or showing an internal key name.
8. **AC8**: **Given** a fresh clone with no running backend and no network access, **When** a developer runs `npm test` in `frontend/`, **Then** tests for AC2–AC7 (Spanish default, switch to English and back without a new backend call, remembered choice, storage unavailable, language attribute, banner in both languages, missing-text fallback) and all existing TS-04 tests pass.
9. **AC9**: **Given** a teammate reading `frontend/README.md`, **When** they need to add or change a text, **Then** it explains where the texts live, how to add a text in both languages and use it in a component, and that a missing English text falls back to Spanish.

### Out of Scope

- Translating backend messages, error details or API data (the backend answers are not shown as text; values such as the version number are shown as they are).
- Languages other than Spanish and English; detecting the browser's preferred language.
- Translating dates, numbers or units (none are shown yet).
- Login (TS-06), deployment (TS-11), CI (TS-09).
- Any change to the backend or to the `/health` contract.

### Edge Cases

- Browser storage blocked or throwing (private mode, disabled storage): Spanish is used, the switch works for the current visit, nothing is remembered, no error is shown.
- A remembered value that is not a supported language (e.g. `fr`, empty, corrupted): treated as Spanish.
- The user switches language while the page is still in the "checking" state: the checking message changes language and the `/health` result, when it arrives, is shown in the selected language; the backend is still called only once.
- The user clicks the language that is already selected: nothing changes.
- A text missing in **both** languages (a developer mistake): the app does not crash; tests catch it because every text used must exist in Spanish (Spanish is the complete reference collection).
- Texts with a value inserted (the API version): the value is shown unchanged in both languages.
- A page taller than the screen: the banner stays pinned at the top while the content scrolls underneath, and it does not cover the page content when the page is scrolled to the top.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The frontend MUST keep all visible UI text in one Spanish and one English collection of texts, identified by stable keys, in one place. Components MUST get every visible text by key; no visible text MAY be written directly in a component.
- **FR-002**: Spanish MUST be the reference language: every key used by the app MUST exist in Spanish. English MAY lack a key, in which case the Spanish text MUST be shown (never blank, never the key).
- **FR-003**: Spanish MUST be the default when no valid choice is remembered.
- **FR-004**: A language switch with two options, **ES** and **EN**, MUST be visible on every page, show which option is selected, and be usable with the keyboard and announced by screen readers (each option has an accessible name, e.g. "Español" / "English").
- **FR-005**: Switching language MUST update all visible text immediately, without reloading the page and without calling the backend again; data already received (the `/health` result) MUST be kept.
- **FR-006**: The selected language MUST be remembered in the browser and used on the next visit. If remembering or reading it fails, or the stored value is not `es` or `en`, the app MUST use Spanish and keep working without showing an error.
- **FR-007**: The document's language attribute MUST be `es` or `en` to match the selected language, and the browser tab title MUST be in the selected language.
- **FR-008**: A disclaimer banner MUST be shown at the top of every page, in every state, and MUST stay pinned at the top of the screen while the page content scrolls (it never scrolls out of view), with exactly `Prototipo académico: no es un dispositivo médico certificado.` (Spanish) or `Academic prototype: not a certified medical device.` (English). It MUST NOT have a close or hide control and MUST NOT depend on the backend or on storage.
- **FR-009**: The banner and the switch MUST be part of one shared page frame that every screen is shown inside, so later screens get them without extra work.
- **FR-010**: The TS-04 start page behaviour (one `/health` call per load, 10 s timeout, four states, reload hint) MUST NOT change; only its texts move into the collections and gain English versions.
- **FR-011**: Automated frontend tests MUST cover AC2–AC7 without a running backend or network, and every existing TS-04 test MUST keep passing (updated only to read the texts from the same collections if needed).
- **FR-012**: `frontend/README.md` MUST explain where the texts live, how to add or change a text in both languages and use it, the Spanish fallback, and how the remembered choice works. `docs/PROJECT_STATUS.md` MUST be updated when the story is done.
- **FR-013**: No new runtime dependency unless the plan shows a clear need (D-23); nothing is sent to the backend or any external service about the language choice.

### Key Entities

- **Text collection**: the set of UI texts for one language (Spanish or English), each identified by a stable key; Spanish is complete, English may lack keys.
- **Selected language**: `es` or `en`; defaults to `es`; remembered in the browser when possible.
- **Disclaimer banner**: a permanent notice at the top of every page with the fixed text above, in the selected language.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the visible texts on the start page (title, all four states, switch, banner, tab title) appear in English after selecting EN and in Spanish after selecting ES, with no reload, in the automated tests and in a manual check.
- **SC-002**: The disclaimer banner is visible in 100% of the page states tested (checking, ok, database unavailable, unreachable) in both languages.
- **SC-003**: A search of the frontend components finds no visible Spanish or English text outside the two text collections.
- **SC-004**: With browser storage unavailable, the app loads in Spanish and switching works in 100% of the tests; with English remembered, a new visit starts in English.
- **SC-005**: 100% of frontend tests (new and TS-04) pass with no running backend and no network, and the run completes in under 30 seconds.
- **SC-006**: A teammate can add a new text in both languages and show it on a page in under 5 minutes, following only `frontend/README.md`.

## Assumptions

- The texts live in the frontend as a small translations module, not an i18n library, unless the plan shows a clear need (D-23); the exact file layout, key names and how components read the current language are chosen in the plan.
- The browser's local storage is the place to remember the choice; it is per browser and per device, and holds only `es` or `en` (not personal data).
- English texts for the TS-04 start page are written as part of this story (e.g. "Patient Deterioration Monitor", "Checking the connection to the server…", "API: running", "Version: {version}", "Database: available" / "not available", "Cannot connect to the server.", "Reload the page to check again."); exact wording is fixed in the plan's contract.
- The switch shows both options (ES and EN) at all times, with the current one marked, rather than a single toggle that shows only the other language.
- The language does not depend on the browser's preferred language: first visit is always Spanish, as the constitution requires.
- "Every page" today means the single start page; the shared page frame (FR-009) makes later screens (login in TS-06, functional stories) show the banner and switch automatically.
- A manual check in a browser (switch both ways, reload keeps English, banner visible) is recorded in the PR, as in TS-04; until TS-09 (CI) the PR also includes the local `npm test` output (D-27).
