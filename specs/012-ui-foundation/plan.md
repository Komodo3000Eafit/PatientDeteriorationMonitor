# Implementation Plan: UI Foundation

**Branch**: `012-ui-foundation` | **Date**: 2026-11-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/012-ui-foundation/spec.md`

## Summary

TS-12 gives the baseline stories one shared look and four reusable pieces, with no new dependency:

- **Tokens and base styles**: `styles/tokens.css` is the only file that holds color values and defines spacing, type scale (nothing below 16px), radius, focus and 44px target tokens. `styles/global.css` sets the page, text, form-control and focus basics. Both are imported once in `main.jsx`.
- **Shared components** in `components/`, each with a CSS Module and a test: `Button`, `Card`, `StatusBadge`, `TriageLevelBadge`, plus `Icons.jsx` (inline SVG, no icon library).
- **Helpers** in `utils/monitoringStatus.js`: `statusToToken` and `statusToLabelKey`, with unit tests. Unknown or missing values become `no_data`.
- **Migration**: `App.css` is removed. Its rules move into `global.css`, `AppShell.module.css` and `LoginPage.module.css` and use tokens. The language switch, sign-out and sign-in buttons use `Button`. The login error becomes a soft box (`critical-soft` background, dark text, error icon).
- **Folders**: `StartPage` and `LoginPage` move with `git mv` to `pages/start/` and `pages/login/`. Only two import lines change (`App.jsx`, `RequireAuth.jsx`). `hooks/` is kept with a `.gitkeep`.
- **Guards** (tests that run with `npm test`): a raw-color scan of `src/` and a contrast test over the token pairs. Both read the real files, so they fail when someone breaks the rule.

Docs: `frontend/README.md`, `docs/GLOSSARY.md` (monitoring status, triage level display), `docs/DECISIONS.md` (D-42), `docs/PROJECT_STATUS.md`, `docs/BACKLOG.md`.

## Technical Context

**Language/Version**: JavaScript (ES modules), React 19, CSS (custom properties, CSS Modules). Node.js 26 LTS.

**Primary Dependencies**: none added. Existing: React, Vite 8, Vitest 5, Testing Library, jsdom. CSS Modules are built into Vite; icons are inline SVG.

**Storage**: N/A (no data, no browser storage, no API call).

**Testing**: Vitest + Testing Library (jsdom), no backend and no network. Verified in research R1: `.module.css` imports work in Vitest (class names are generated, so tests import the same `styles` object) and `node:fs` is available for the two guard tests. jsdom does no layout, so the 44px and focus rules are checked two ways: static CSS assertions in tests, and a manual keyboard pass in the PR (SC-004).

**Target Platform**: modern desktop and tablet browsers.

**Project Type**: web application. This story touches only `frontend/` and docs; the backend is unchanged.

**Performance Goals**: none beyond the existing test run staying under 30 seconds (TS-05 SC-005).

**Constraints**: no new dependency; no raw color outside `tokens.css`; no inline `style`; no font size below 1rem; UI text only through `translations.js`; no clinical logic in the frontend (Principle V); existing tests keep passing unchanged except where an import path forces an edit (none expected).

**Scale/Scope**: 4 new components and one icons file, 6 CSS Modules (4 components, `AppShell` and the login page), 1 helper module, 2 CSS files in `styles/`, 3 guard tests, 10 new i18n keys per language, 2 file moves, 2 import edits, 1 file removed (`App.css`), 5 docs.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Spec-driven and traceable**: every file maps to an AC/FR (traceability table below); tasks will cite the AC they serve.
- [x] **II. Small Scrum story**: one technical story. It is larger than most (tokens + four components + migration), but every part is small and plain; no part is optional for the baseline stories.
- [x] **III. Independence**: depends only on TS-05 and TS-06, as `docs/BACKLOG.md` lists. It touches `AppShell`, `App.jsx`, `RequireAuth` and the two pages, all technical-story code. No functional story is modified.
- [x] **IV. Multi-agent**: each task has an owner, logged in `agent-log.csv`:
  - **frontend-dev**: tokens, global styles, components, helpers, migration, page moves, translations, `frontend/README.md`, glossary rows;
  - **qa-tester**: helper tests, component tests, the raw-color scan, the contrast test; the manual keyboard and grayscale pass is a human step (T031);
  - **security-reviewer**: read-only check of no inline styles, no new dependency, no hard-coded text or data in the UI;
  - **orchestrator**: `DECISIONS.md` (D-42), `PROJECT_STATUS.md`, `BACKLOG.md`, the agent log and the PR record.
- [x] **V. Clinical logic**: the frontend only displays a status and a level it is given. `statusToToken` and `statusToLabelKey` map a name to a name; nothing compares scores, thresholds or triage levels. The triage badge checks only that the input is a whole number 1 to 5, to avoid showing a wrong label. The app never changes a triage level.
- [x] **VI. Data privacy**: no data at all; tests use no patient values.
- [x] **VII. Tests**: this story touches no scoring, prediction, API or security control, so Principle VII does not require tests. They are still written for every AC (spec FR-017) and run in CI (TS-09).
- [x] **VIII. Security baseline**: no input is sent anywhere; no secrets; no `dangerouslySetInnerHTML`; SVG icons are static markup in code; no new dependency (nothing new for the dependency check).
- [x] **IX. Deployable at low cost**: no new service; the build output stays static files that FastAPI will serve (D-39).
- [x] **X. Stack**: React frontend, plain CSS; backend and database untouched.
- [x] **XI. Language**: code, comments and docs in English; every UI text in `translations.js` in Spanish and English; new terms (`monitoring status`, triage level display) added to `docs/GLOSSARY.md` in this PR.
- [x] **XII. Simplicity**: plain CSS files, no CSS-in-JS, no icon library, no gallery page, no variants nobody needs yet (Button has two, Card has no variants, badges have none). The two guard tests are small, read files and use no library. Rejected alternatives are in research.

**Post-design re-check (after Phase 1)**: all items pass. Phase 1 added only three tokens beyond the spec list (`--color-border`, `--color-border-strong`, `--color-primary-hover`) because inputs, cards and the primary hover need them (R3). No Complexity Tracking entry is needed.

## Project Structure

### Documentation (this feature)

```text
specs/012-ui-foundation/
├── spec.md
├── plan.md                 # This file
├── research.md             # Phase 0: decisions and rejected alternatives (R1-R10)
├── data-model.md           # Phase 1: tokens, monitoring status, triage level, text keys
├── quickstart.md           # Phase 1: how to validate the story
├── contracts/
│   ├── tokens.md           # Phase 1: every token, value, use and contrast pair
│   ├── components.md       # Phase 1: props of Button, Card, StatusBadge, TriageLevelBadge, Icons
│   └── helpers-and-guards.md   # Phase 1: utils helpers, text keys, the two guard tests
├── checklists/
│   └── requirements.md
└── tasks.md                # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
frontend/
├── README.md                       # edit: structure, token rule, components, how to add a token/status
├── src/
│   ├── main.jsx                    # edit: import styles/tokens.css, then styles/global.css
│   ├── App.jsx                     # edit: StartPage import path; drop the App.css import
│   ├── App.css                     # DELETE (rules moved, see below)
│   ├── styles/
│   │   ├── tokens.css              # new: the only file with color values
│   │   ├── global.css              # new: page, text, form controls, focus; old `main` rule
│   │   ├── tokens.test.js          # new: AC1 values, type scale, every var(--x) is defined
│   │   ├── contrast.test.js        # new: AC10 contrast pairs
│   │   └── noRawColors.test.js     # new: AC2 scan, no inline style, no solid status as text
│   ├── components/
│   │   ├── AppShell.jsx            # edit: CSS Module, Button for sign-out and language switch
│   │   ├── AppShell.module.css     # new: header, disclaimer, user block, switch (from App.css)
│   │   ├── Button.jsx / .module.css / .test.jsx
│   │   ├── Card.jsx / .module.css / .test.jsx
│   │   ├── StatusBadge.jsx / .module.css / .test.jsx
│   │   ├── TriageLevelBadge.jsx / .module.css / .test.jsx
│   │   └── Icons.jsx               # new: four status icons (named exports); no test file of its own
│   ├── pages/
│   │   ├── start/StartPage.jsx     # moved with git mv from src/StartPage.jsx; imports fixed
│   │   └── login/
│   │       ├── LoginPage.jsx       # moved with git mv; uses Button and OctagonXIcon
│   │       └── LoginPage.module.css  # new: form and error box (from App.css)
│   ├── hooks/.gitkeep              # new: folder kept; first hook arrives with a later story
│   ├── utils/
│   │   ├── monitoringStatus.js     # new: MONITORING_STATUSES, statusToToken, statusToLabelKey
│   │   └── monitoringStatus.test.js
│   ├── auth/RequireAuth.jsx        # edit: LoginPage import path
│   ├── i18n/translations.js        # edit: monitoringStatus.* and triageLevel.* keys (es + en)
│   └── testing/
│       ├── sourceFiles.js          # new: list source files, read tokens (used by the guard tests)
│       └── contrast.js             # new: luminance and contrast ratio (used by contrast.test.js)
docs/
├── GLOSSARY.md                     # edit: monitoring status; triage level display; §1.1 mismatch 1 resolved
├── DECISIONS.md                    # edit: D-42
├── PROJECT_STATUS.md               # edit: TS-12 done
└── BACKLOG.md                      # edit: TS-12 done with spec link
```

**Structure Decision**: web application, `frontend/` only. Folder layout is the one in the frontend-dev agent's "Project structure". Each page has its own folder (`pages/start/`, `pages/login/`). Existing tests (`App.test.jsx`, `auth/auth.test.jsx`) reach the pages only through `App`, so they need no change. Components use `export default` (existing convention, `AppShell`); helpers, constants and the icons use named exports.

### Where each old `App.css` rule goes

| Old rule | New home |
|---|---|
| `body`, `main` | `styles/global.css` |
| `.app-header`, `.disclaimer`, `.language-switch`, `.user-block`, `.user-name` | `components/AppShell.module.css` |
| `.language-switch button`, `.user-block button`, `.login-form button` | `components/Button.module.css` (shared) |
| `.language-switch button[aria-pressed="true"]` | `Button.module.css`, `[aria-pressed="true"]` state |
| `.login-form`, `.login-form input` | `pages/login/LoginPage.module.css`; shared input look in `global.css` |
| `.login-form [role="alert"]` (raw `#a40000`) | `LoginPage.module.css`, soft error box (R5) |

### Traceability

| Spec item | Delivered by |
|---|---|
| AC1, FR-001 | `styles/tokens.css`; `tokens.test.js` |
| AC2, FR-002, FR-014 | `App.css` migration; `noRawColors.test.js` |
| AC3, FR-003, FR-015 | `styles/global.css` |
| AC4, FR-004 | page moves, `hooks/.gitkeep`, two import edits; existing tests |
| AC5, AC6, FR-005, FR-006, FR-011 | `StatusBadge`, `Icons`, `monitoringStatus.js` |
| AC7, FR-007 | `TriageLevelBadge` |
| AC8, FR-008, FR-009 | `Card`, `Button`, `AppShell` and `LoginPage` migration |
| AC9, FR-010 | `utils/monitoringStatus.js` + test |
| AC10, FR-012, FR-013 | `contrast.test.js`, `testing/contrast.js` |
| AC11 | static CSS assertions in component tests + manual keyboard pass |
| AC12, FR-016 | `translations.js` keys; `translations.test.js` (existing, must still pass) |
| AC13, FR-019 | README, glossary, D-42, status, backlog |
| AC14, FR-017, FR-018 | `npm test`, `npm run build`, `package.json` unchanged |

## Complexity Tracking

No Constitution Check violations. Nothing to justify.
