# Feature Specification: UI Foundation

**Feature Branch**: `012-ui-foundation`

**Created**: 2026-11-19

**Status**: Draft

**Input**: User description: "TS-12 — UI foundation (technical story). Build the frontend UI foundation that baseline functional stories will reuse. Scope from the backlog: design tokens in `frontend/src/styles/tokens.css`: colors including status colors stable (#10B981 / #D1FAE5), warning (#F59E0B / #FEF3C7), critical (#E11D48 / #FFE4E6) and no_data (#64748B / #F1F5F9) with their soft variants, plus bg (#FFFFFF), bg-subtle (#F8FAFC), primary (#2563EB), primary-soft (#EFF6FF), text (#1E293B); plus spacing, type scale, radius and focus tokens. Base styles in `styles/global.css`; migrate `App.css` to tokens (no raw hex values anywhere in component styles). Folder structure from the frontend-dev agent: `pages/`, `hooks/`, `utils/`, `styles/`; move `StartPage` and `LoginPage` into `pages/`. Shared components reused by baseline stories: status badge (color + icon + text label), triage level badge, card, button. Status-to-token and status-to-label helpers in `utils/` with unit tests. Accessibility: never use color as the only signal (color + icon + label); meet WCAG AA contrast (status colors used for backgrounds/borders/icons with dark slate text, not as text on light backgrounds); visible focus state; 16px+ body text; 44x44px click targets. Depends on TS-05 (language + disclaimer) and TS-06 (authentication), both merged. This is a technical story (no end-user behavior); acceptance criteria are verifiable UI-foundation outcomes. Follow the constitution: English artifacts, keep it simple (Principle XII), no new libraries unless required."

## Clarifications

### Session 2026-11-19

- Q: How should the triage level badge write the level in each language? → A: "Triage I" to "Triage V" (Roman numerals, as in Resolución 5596 de 2015) in both Spanish and English; the same text is used in both languages.
- Q: What color should the status badge icon be drawn in? → A: The dark `text` color (about 12:1 on every soft background). The status color appears only as the badge's background tint (soft variant) and border.
- Q: Which preferred term should the glossary use for `stable`, `warning`, `critical` and `no_data`? → A: **monitoring status**. The plain word `status` stays reserved for a patient's `active` / `discharged` state. The term is not shown as a label in the UI.

## User Story *(mandatory)*

**Story ID**: TS-12

**Type**: Technical

**Story**: As a team member building a baseline user story, I want one set of design tokens, base styles and shared UI components (status badge, triage level badge, card, button), so that every screen looks the same, meets accessibility rules from the start, and nobody re-creates or copies UI between stories.

**Depends on**: TS-05 (language and disclaimer), TS-06 (authentication).

### Acceptance Criteria

1. **AC1 — Design tokens**: **Given** the frontend code, **When** a developer opens `frontend/src/styles/tokens.css`, **Then** it defines, as named variables, these colors exactly: `stable` `#10B981` with soft `#D1FAE5`; `warning` `#F59E0B` with soft `#FEF3C7`; `critical` `#E11D48` with soft `#FFE4E6`; `no_data` `#64748B` with soft `#F1F5F9`; background `#FFFFFF`; subtle background `#F8FAFC`; primary `#2563EB` with soft `#EFF6FF`; text `#1E293B`; **and** it defines spacing, type scale (body size 16px or larger), border radius and focus-ring tokens.
2. **AC2 — No raw colors outside the tokens**: **Given** every stylesheet and component in `frontend/src/`, **When** an automated check scans them, **Then** the only file containing a raw color value (hex, `rgb()`, `hsl()` or a named color other than `transparent` and `currentColor`) is `tokens.css`. The old `App.css` styles (page frame, disclaimer banner, user block, language switch, login form, error message) are migrated to tokens, and the screens still work exactly as before (only colors and sizes may change).
3. **AC3 — Base styles**: **Given** the running app, **When** any screen is shown, **Then** `styles/global.css` (loaded once for the whole app) gives the page the token background and text color, a body text size of at least 16px, a readable line height, consistent form-control styling, and a visible focus indicator on every keyboard-focusable element.
4. **AC4 — Folder structure and moved pages**: **Given** the `frontend/src/` folder, **When** a developer lists it, **Then** `pages/`, `hooks/`, `utils/` and `styles/` exist alongside the current `api/`, `auth/`, `i18n/`, `components/` and `testing/`; **and** `StartPage` and `LoginPage` live inside `pages/` (with their imports updated), behave exactly as before, and every existing frontend test still passes.
5. **AC5 — Status badge**: **Given** a monitoring status of `stable`, `warning`, `critical` or `no_data`, **When** the status badge is rendered, **Then** it shows the status color (soft background tint and solid border), a distinct icon drawn in the dark `text` color, and a text label in the selected language (Estable / Stable, Vigilar / Watch, Crítico / Critical, Sin datos / No data); the label is real text readable by screen readers, the icon is decorative to assistive technology, and no status is told apart by color alone.
6. **AC6 — Status badge fallback**: **Given** a missing, empty or unrecognized status value, **When** the status badge is rendered, **Then** it shows the `no_data` appearance and label; it never shows `stable` for missing data and never crashes.
7. **AC7 — Triage level badge**: **Given** a triage level from 1 to 5, **When** the triage level badge is rendered, **Then** it shows the level as text ("Triage I" to "Triage V", 1 = most urgent) in a neutral style that does not use any status color (the triage level is a clinician's classification, not a monitoring status); **and Given** a missing or out-of-range level, **Then** it shows a neutral "no level" text instead of a wrong level.
8. **AC8 — Card and button**: **Given** a developer using the shared card, **When** it is rendered with a title and content, **Then** it shows the content on a token surface with border, radius and spacing, and the title as a heading; **and Given** the shared button, **When** it is rendered as primary or secondary, enabled or disabled, **Then** it uses token colors, is at least 44×44px, shows a visible focus indicator, can be used with the keyboard, does nothing when disabled, and defaults to a non-submitting button unless told otherwise. The existing buttons (language switch, sign out, sign in) use it or the same styles, so they also meet 44×44px.
9. **AC9 — Helpers with unit tests**: **Given** the `utils/` folder, **When** a developer needs presentation data for a monitoring status, **Then** a status-to-token helper returns the status's color token names (solid and soft) and a status-to-label helper returns its translation key; both return the `no_data` values for a missing or unrecognized status. They contain no clinical logic (no scores, thresholds or triage comparisons). Unit tests cover the four statuses and the fallback.
10. **AC10 — Contrast**: **Given** the token values, **When** an automated test computes the contrast ratio of each text and background pair used by the shared components and base styles, **Then** body text and labels reach at least 4.5:1 (for example `text` on each soft status color, on `bg`, on `bg-subtle` and on `primary-soft`; white on `primary` for primary buttons), and non-text elements that carry meaning reach at least 3:1 against their background: the badge icon (`text` on each soft status color) and the focus ring. Status borders reinforce the meaning but do not carry it alone. Status colors are used only for backgrounds, borders and icons, never as text color on a light background.
11. **AC11 — Accessibility in use**: **Given** the shared components and the two existing pages, **When** a user navigates by keyboard, **Then** every interactive element is reachable, shows a visible focus indicator, and has a click target of at least 44×44px; no meaning is conveyed by color alone; texts are 16px or larger.
12. **AC12 — Language**: **Given** any text added by this story (status labels, triage level labels, "no level"), **When** the language is switched between Spanish and English, **Then** the text changes without a reload; every text exists in `translations.js` in both languages, and no text is hard-coded in a component.
13. **AC13 — Documentation**: **Given** a teammate starting a baseline story, **When** they read `frontend/README.md`, **Then** they find the folder structure, how to use tokens (and that raw colors are not allowed), how to use each shared component with an example, and how to add a token or a status. `docs/GLOSSARY.md` has the new terms added in this PR (monitoring status and the triage level label). `docs/PROJECT_STATUS.md` and `docs/BACKLOG.md` show TS-12 as done.
14. **AC14 — Nothing else breaks**: **Given** the finished story, **When** `npm test` and `npm run build` run in `frontend/`, **Then** both pass with no network and no backend, no runtime dependency has been added, and the backend is unchanged.

### Out of Scope

- Pages or features that use the new components (patient list, patient detail, alerts): those belong to US-02, US-04 and US-05.
- Client routing (TS-13) and any change to how `App.jsx` chooses the screen.
- Computing a patient's monitoring status, scores or risk bands: the backend does that; this story only displays a status it is given (constitution Principle V).
- Showing the time of the last reading for `no_data`, tables, charts, dialogs, form-field components, loaders and other components: each story that needs one adds it.
- A component gallery or style-guide page.
- Dark mode, theming, responsive layout work beyond what the existing screens already need, and animations.
- A CSS framework, UI component library, icon library or any other new dependency.
- Backend changes, deployment (TS-10, TS-11) and CI changes (TS-09).

### Edge Cases

- **Unknown, empty or missing status** (backend adds a new value, or sends none): the badge shows `no_data`, never `stable`.
- **Status passed in a different case or with spaces**: treated as unrecognized (the backend contract is the four lowercase values) and shown as `no_data`.
- **Triage level out of range, not a whole number, or a numeric string**: shows the neutral "no level" text; only whole numbers 1 to 5 are valid.
- **Label missing in English**: falls back to the Spanish text through the existing text lookup (TS-05); never shows a key or blank.
- **Long label or text zoom up to 200%**: the badge wraps or grows without cutting the text or breaking the 44×44px target of nearby controls.
- **Browser forced-colors or high-contrast mode**: badges keep their border, icon and label, so status is still readable.
- **Disabled button**: stays visible with sufficient contrast for its label, is not focusable by click, and does not run its action.
- **Existing error message color on the login form**: still meets 4.5:1 on the background it sits on after the migration, with an icon or text that shows it is an error (not color alone).
- **Existing disclaimer banner**: stays pinned, non-closable and visible in every state; only its colors come from tokens.
- **A developer adds a raw color to a component style**: the automated scan (AC2) fails the tests.
- **Page moved but an import is missed**: build and tests fail, so it cannot be merged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `frontend/src/styles/tokens.css` MUST be the single place where color values are written. It MUST define the status colors with soft variants, the surface, primary and text colors listed in AC1 with exactly those values, plus spacing, type scale, radius and focus tokens.
- **FR-002**: Every other stylesheet and component MUST refer to colors, spacing, type sizes, radius and focus only through tokens. The legacy `App.css` styles MUST be migrated and the file MUST NOT keep any raw color value.
- **FR-003**: `frontend/src/styles/global.css` MUST be loaded once for the whole app and MUST set the base page styles: token colors, body text of at least 16px, line height, form-control basics, and a visible focus indicator on all focusable elements.
- **FR-004**: The folders `pages/`, `hooks/`, `utils/` and `styles/` MUST exist in `frontend/src/` as described in the frontend-dev agent's project structure; `StartPage` and `LoginPage` MUST move into `pages/` with imports and tests updated and their behavior unchanged. Folders that have no file yet (such as `hooks/`) MUST be kept in the repository with a placeholder file.
- **FR-005**: A shared **status badge** component MUST show, for each monitoring status (`stable`, `warning`, `critical`, `no_data`), the status color (soft background tint and solid border), an icon that is different for each status and drawn in the `text` color, and a translated text label. The label MUST be exposed to screen readers as text; the icon MUST be hidden from assistive technology.
- **FR-006**: The status badge MUST treat a missing, empty or unrecognized status as `no_data`.
- **FR-007**: A shared **triage level badge** component MUST show a triage level 1 to 5 as "Triage I" to "Triage V" in a neutral style that uses no status color, and MUST show a neutral "no level" text for any other value. It MUST NOT compute, compare or change a triage level.
- **FR-008**: A shared **card** component MUST provide a surface with token background, border, radius and padding, an optional title shown as a heading, and content passed as children.
- **FR-009**: A shared **button** component MUST offer at least a primary and a secondary variant, MUST be at least 44×44px, MUST show the focus indicator, MUST support a disabled state, and MUST default to a non-submitting button. The existing buttons in the page frame and the login form MUST use it, or share its styles, so they meet the same size and focus rules.
- **FR-010**: `utils/` MUST contain a status-to-token helper (status → solid and soft color token names) and a status-to-label helper (status → translation key). Both MUST return the `no_data` result for a missing or unrecognized status and MUST contain no clinical logic. Both MUST have unit tests covering the four statuses and the fallback.
- **FR-011**: Status MUST NOT be conveyed by color alone anywhere in the shared components: each status badge has color, icon and text label.
- **FR-012**: Contrast MUST meet WCAG 2.1 AA: at least 4.5:1 for text and 3:1 for meaningful non-text elements (the badge icon and the focus ring). Status borders reinforce the meaning but never carry it alone, so they have no 3:1 requirement. Status colors MUST be used only for backgrounds, borders and icons, with the `text` color on top; `stable`, `warning`, `critical` and `no_data` solid colors MUST NOT be used as text color on a light background.
- **FR-013**: An automated test MUST compute the contrast ratio of the token color pairs used by the shared components and base styles, and fail if any pair is below its threshold.
- **FR-014**: An automated test MUST scan the frontend styles and components and fail if a raw color value appears anywhere outside `tokens.css`.
- **FR-015**: Body text MUST be at least 16px, and every clickable or tappable control MUST have a target of at least 44×44px.
- **FR-016**: Every text added by this story MUST be defined in `src/i18n/translations.js` in Spanish and English (TS-05) and be used by key; the Spanish and English status labels are those in AC5.
- **FR-017**: Unit and component tests MUST cover each shared component (every status, the fallback, every valid and invalid triage level, card title and content, button variants, disabled state and focusability as a native button; Enter and Space activation is checked by hand in T031) and MUST run without a backend or network. All existing tests MUST keep passing.
- **FR-018**: Shared components MUST be generic and live in `components/`, each with its own style file and test. No new runtime or development dependency MAY be added.
- **FR-019**: `frontend/README.md` MUST document the folder structure, the token rule, each shared component with a short usage example, and how to add a token or a status. `docs/GLOSSARY.md` MUST gain the terms introduced here in the same pull request (D-40), `docs/PROJECT_STATUS.md` MUST be updated when the story is done, and `docs/BACKLOG.md` MUST show TS-12 as done with the spec link.

### Key Entities *(include if feature involves data)*

- **Design token**: a named variable for one design value (color, spacing, type size, radius, focus ring) defined once in `tokens.css` and referenced by name everywhere else.
- **Monitoring status**: one of `stable`, `warning`, `critical` or `no_data`, computed by the backend and only displayed by the frontend. It is a different concept from the patient's `status` (`active` / `discharged`), and from the triage level.
- **Triage level**: a whole number 1 to 5 (1 = most urgent, Triage I to V under Resolución 5596 de 2015) set by a clinician; the badge only displays it.
- **Shared component**: a reusable UI piece in `components/` (status badge, triage level badge, card, button) that the baseline stories use instead of writing their own.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 0 raw color values exist in the frontend source outside `tokens.css`, verified by an automated scan that runs with `npm test`.
- **SC-002**: 100% of the text and background color pairs used by the shared components and base styles reach at least 4.5:1 contrast, and 100% of meaningful non-text pairs (badge icon on each soft status color, focus ring) reach at least 3:1, verified by an automated test.
- **SC-003**: Each of the four monitoring statuses is distinguishable from the other three by icon shape and by label text alone, in a check done with colors removed (for example a grayscale or forced-colors view), recorded in the pull request.
- **SC-004**: 100% of interactive elements on the two existing pages and in the shared components measure at least 44×44px and show a visible focus indicator when reached with the Tab key, in a manual keyboard pass recorded in the pull request.
- **SC-005**: A teammate building a baseline story can show a status badge, a triage level badge, a card and a button on a page in under 5 minutes, following only `frontend/README.md`, without writing any new color, button style or badge.
- **SC-006**: 100% of frontend tests (new and existing) pass with no backend and no network, `npm run build` succeeds, and `package.json` gains no dependency.
- **SC-007**: Start page and login page behave exactly as before the story: sign in, sign out, language switch, disclaimer banner and `/health` result, in both languages.

## Assumptions

- The four status values (`stable`, `warning`, `critical`, `no_data`) and their Spanish/English labels come from the frontend-dev agent's design rules; the backend will return them in a later story (US-02 / US-04). Until then the badge only receives the value as input.
- Component styles use CSS files next to each component (CSS Modules, already supported by the current build tool), as the frontend-dev agent's conventions say; the exact file layout, component props and icon drawing (plain inline SVG, no icon library) are chosen in the plan.
- The word "monitoring status" is the preferred term for `stable` / `warning` / `critical` / `no_data`, because `status` is already used for a patient's `active` / `discharged` state in the glossary. Confirmed in Clarifications. The plan adds it to `docs/GLOSSARY.md` (no Spanish UI text is needed, because the term itself is not shown on screen; only the four status labels are).
- The triage level badge reads "Triage I" … "Triage V" in both languages (confirmed in Clarifications; the Colombian rule uses these words and Roman numerals). The glossary mismatch on display names (GLOSSARY §1.1) is resolved here and recorded in the glossary.
- The triage level badge is neutral (no status color) because a triage level is a clinician's classification and is not computed from NEWS2 (constitution v1.2.0, D-41).
- Contrast of the status colors was checked: `text` (`#1E293B`) on each soft color is above 12:1; `text` on the solid `critical` and `no_data` colors is only about 3:1, so labels always sit on the soft variants, and solid colors serve as borders and icon tints only. Solid `stable` and `warning` fail 3:1 on white and on their own soft color (2.24:1 and 1.93:1), so the icon is drawn in the `text` color (about 12:1 on every soft color; confirmed in Clarifications), and the icon shape and the label carry the meaning; the solid-color border is a reinforcement only (WCAG 1.4.1 and 1.4.11).
- The disclaimer banner uses the warning tokens (it is a notice, not a monitoring status); its exact look may change slightly from today's color.
- Existing error text on the login form needs a token that keeps 4.5:1 on the form background; the plan uses a soft box (`critical-soft` background, dark `text`, error icon; 12.19:1).
- No component gallery is built: the shared components are checked by tests and by the two existing pages (language switch, sign out and sign in use the button), which keeps the story small (Principle XII).
- The decision to use CSS tokens and shared components is already part of the frontend-dev agent rules; no new `docs/DECISIONS.md` entry is needed unless the plan makes a new choice.
- Dependencies TS-05 and TS-06 are merged in `main`: the language provider, translations module, `AppShell`, `RequireAuth` and the login flow exist and are reused unchanged in behavior.
