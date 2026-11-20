# Feature Specification: Icon Library

**Feature Branch**: `014-icon-library`

**Created**: 2026-11-19

**Status**: Draft

**Input**: User description: "TS-14 Icon library. Depends on TS-12 (merged). Adopt lucide-react as the single icon source and replace the four hand-drawn inline SVG status icons from TS-12, so the project has a consistent, easy-to-use icon source for the baseline functional stories (US-02, US-04, US-05). Add lucide-react as the ONLY new frontend runtime dependency, pinned; no other dependency. Replace frontend/src/components/Icons.jsx: re-export the four status icons from lucide-react equivalents (CheckCircle, TriangleAlert, OctagonX, CircleDashed or the closest lucide names) but keep the SAME export names already used (CheckCircleIcon, TriangleAlertIcon, OctagonXIcon, CircleDashIcon), so StatusBadge and LoginPage imports do not change. Icons stay aria-hidden with focusable=\"false\", sized in em units, and colored with currentColor (the dark --color-text); never a status color as text. The raw-color guard test (noRawColors.test.js) must keep passing (lucide icons inherit currentColor, no raw colors in our source). All existing tests must keep passing (the suite was 221; StatusBadge/LoginPage tests assert exactly one aria-hidden svg and exact text, so the replacement must preserve that). npm run build must succeed. Update the frontend-dev agent rules in BOTH .kiro/agents/frontend-dev.md and .claude/agents/frontend-dev.md (kept in sync per AGENTS.md): icons come from lucide-react; do not hand-draw SVG icons. Keep the existing accessibility rules (every status shows color + icon + label; contrast WCAG AA). This story AMENDS decision D-43 (which said \"no icon library\"): a new decision (next free number, likely D-46) in docs/DECISIONS.md records that lucide-react is adopted, with the reason, superseding the \"no icon library\" part of D-43. Follow the same pattern TS-13 used when it added react-router. Mark TS-14 done in docs/PROJECT_STATUS.md and docs/BACKLOG.md when the story is finished."

## User Story *(mandatory)*

**Story ID**: TS-14

**Type**: Technical

**Story**: As a team member building a functional story (US-02, US-04, US-05), I want one consistent icon source already wired in, so that I can add an icon by name from a well-known library instead of hand-drawing an SVG, while the existing status badge and login page keep working exactly as before.

**Depends on**: TS-12 (UI foundation). Merged.

### Acceptance Criteria

<!-- Each criterion must be testable. qa-tester writes at least one test per criterion. -->

1. **AC1 — Single new dependency, pinned**: **Given** `frontend/package.json`, **When** the story is finished, **Then** exactly one new runtime dependency, `lucide-react`, has been added with a pinned version, and no other dependency (runtime or dev) has been added, removed or changed.
2. **AC2 — Same export names from Icons.jsx**: **Given** `frontend/src/components/Icons.jsx`, **When** it is read, **Then** it exports the four names already used by the rest of the app, `CheckCircleIcon`, `TriangleAlertIcon`, `OctagonXIcon` and `CircleDashIcon`, each backed by its closest `lucide-react` icon; **and** no file that imports these names (`StatusBadge.jsx`, `AppShell.jsx`, `pages/login/LoginPage.jsx`) changes its import line.
3. **AC3 — Status badge unchanged to the user and the test**: **Given** a `StatusBadge` for any monitoring status (`stable`, `warning`, `critical`, `no_data`, and an unknown value), **When** it is rendered, **Then** it still shows exactly one decorative `svg` that is `aria-hidden="true"`, the four statuses still use four visually distinct icons, and the Spanish and English labels are unchanged.
4. **AC4 — Login page error icon unchanged to the user and the test**: **Given** the login page showing its error alert, **When** it is rendered, **Then** the alert still contains exactly one `svg` that is `aria-hidden="true"`, and the alert text is unchanged.
5. **AC5 — Decorative and inheriting color**: **Given** any of the four icons from `Icons.jsx`, **When** it is rendered, **Then** the `svg` is `aria-hidden="true"` and `focusable="false"`, its size is expressed in `em` units (so it scales with the surrounding text), and it draws with `currentColor` (the dark `--color-text` in context), never a status color used as text.
6. **AC6 — Raw-color guard still passes**: **Given** the raw-color scan `styles/noRawColors.test.js` from TS-12, **When** it runs, **Then** it passes: no raw color is introduced anywhere in `src/` (the `lucide-react` icons inherit `currentColor`, and our source adds no hex, color function or named color).
7. **AC7 — Nothing else breaks**: **Given** the finished story, **When** `npm test`, `npm run build` and `npm audit --audit-level=high` run in `frontend/`, **Then** all pass with no backend and no network; every previously passing test still passes (the suite count does not drop); the contrast test from TS-12 still passes; and the backend is unchanged.
8. **AC8 — Agent rules updated and in sync**: **Given** `.kiro/agents/frontend-dev.md` and `.claude/agents/frontend-dev.md`, **When** the story is finished, **Then** both say icons come from `lucide-react` and hand-drawn SVG icons are not to be added, both keep the existing accessibility rules (every status shows color + icon + label; contrast meets WCAG AA), and the two files are identical in the rules they state (kept in sync per AGENTS.md).
9. **AC9 — Decision recorded, amending D-43**: **Given** `docs/DECISIONS.md`, **When** the story is finished, **Then** a new decision entry (the next free number, D-46) records that `lucide-react` is adopted as the single icon source, with its version and reason, and states that it supersedes the "no icon library" part of D-43; D-43's status is updated to note it is superseded in part by D-46, following the pattern D-45 used for D-33/D-35; no earlier decision text is deleted.
10. **AC10 — Backlog and status updated**: **Given** `docs/BACKLOG.md` and `docs/PROJECT_STATUS.md`, **When** the story is finished, **Then** both show TS-14 as done.

### Out of Scope

- Any backend change.
- Changing the status colors, the soft/solid token model, the contrast rules or the "color + icon + label" rule from TS-12 and D-43 (this story only changes where the four icons' shapes come from).
- Replacing icons in functional stories (US-02, US-04, US-05) or adding new icons beyond the four that already exist; those stories add their own icons later from `lucide-react`.
- Making the icons configurable through props (size, color, stroke) beyond what the existing call sites need; the four wrappers keep the no-props call style unless a wrapper must set `aria-hidden`/`focusable`/size itself.
- Any visual redesign of the status badge, the login alert or the disclaimer banner.

### Edge Cases

- **A lucide name does not match our name exactly** (for example the "no data" icon): the wrapper maps our existing export name to the closest `lucide-react` icon; the export name does not change, so no call site breaks.
- **lucide renders attributes differently from the hand-drawn SVG** (default size, `aria-hidden`, `focusable`, extra classes): the wrapper sets the attributes the tests and accessibility rules require (`aria-hidden="true"`, `focusable="false"`, `em` size, `currentColor`), so the rendered `svg` still satisfies AC3–AC5 regardless of lucide's defaults.
- **The four icons must stay visually distinct** (StatusBadge test compares the four `svg` markups): the chosen lucide icons must produce four different markups.
- **A new advisory on `lucide-react`** could make `npm audit --audit-level=high` fail later; handled the same way as any dependency (D-38): an upgrade or an `overrides` entry with a reason and a DECISIONS note. At merge time the audit must pass.
- **The raw-color scan reads `.js`/`.jsx` under `src/`**: importing from `lucide-react` (a node_modules package, not scanned) and re-exporting adds no color token to our source, so the scan stays green.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The frontend MUST add exactly one new runtime dependency, `lucide-react`, pinned to an exact version in `frontend/package.json`; no other dependency (runtime or dev) MAY be added, removed or changed by this story.
- **FR-002**: `frontend/src/components/Icons.jsx` MUST re-export the four existing names `CheckCircleIcon`, `TriangleAlertIcon`, `OctagonXIcon` and `CircleDashIcon`, each backed by the closest `lucide-react` icon (for example `CheckCircle`, `TriangleAlert`, `OctagonX`, `CircleDashed` or the nearest available names). The hand-drawn inline SVG definitions MUST be removed.
- **FR-003**: The import lines in every file that uses these icons (`StatusBadge.jsx`, `AppShell.jsx`, `pages/login/LoginPage.jsx`) MUST stay unchanged, so no call site is edited by this story.
- **FR-004**: Each of the four icons MUST render as a single `svg` that is `aria-hidden="true"` and `focusable="false"`, sized in `em` units, and colored with `currentColor` so it inherits the dark `--color-text` of its context; a status color MUST NOT be used as the icon's text/fill color.
- **FR-005**: The four icons MUST stay visually distinct from one another (four different rendered `svg` markups), so the existing "distinct icons" assertion keeps passing.
- **FR-006**: The raw-color scan `styles/noRawColors.test.js` MUST keep passing: this story MUST add no hex color, CSS color function or named color anywhere under `src/`.
- **FR-007**: Every test that passed before MUST keep passing, with no backend and no network; in particular the StatusBadge tests (exactly one `aria-hidden` svg per badge, four distinct icons, unchanged Spanish/English labels, `no_data` fallback) and the login-page error-alert test (exactly one `aria-hidden` svg, unchanged text). The total number of passing tests MUST NOT drop.
- **FR-008**: `npm run build`, `npm test` and `npm audit --audit-level=high` MUST succeed in `frontend/` at merge time.
- **FR-009**: The backend MUST NOT change.
- **FR-010**: `.kiro/agents/frontend-dev.md` and `.claude/agents/frontend-dev.md` MUST be updated so both state that icons come from `lucide-react` and that hand-drawn SVG icons are not added, while keeping the existing accessibility rules (every status shows color + icon + label; contrast meets WCAG AA). The two files MUST stay in sync (identical rule content, per AGENTS.md).
- **FR-011**: `docs/DECISIONS.md` MUST gain a new entry, D-46, recording the adoption of `lucide-react` (name, exact version, reason, alternatives rejected) and stating it supersedes the "no icon library" part of D-43; D-43 MUST be annotated as superseded in part by D-46, following the D-45 → D-33/D-35 pattern; no earlier entry text is deleted.
- **FR-012**: `docs/BACKLOG.md` and `docs/PROJECT_STATUS.md` MUST show TS-14 as done when the story is finished.

### Key Entities *(include if feature involves data)*

- **Status icon wrapper**: one of the four exports in `Icons.jsx` (`CheckCircleIcon`, `TriangleAlertIcon`, `OctagonXIcon`, `CircleDashIcon`); maps a stable export name to a `lucide-react` icon and fixes the decorative, em-sized, `currentColor` rendering.
- **Icon source**: `lucide-react`, the single library every icon in the frontend now comes from.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Exactly 1 runtime dependency (`lucide-react`) is added and it is pinned; 0 other dependencies change (verifiable from the `package.json` and lockfile diff).
- **SC-002**: `Icons.jsx` exports the same 4 names as before, all backed by `lucide-react`; 0 files that import them change their import line.
- **SC-003**: 100% of the icons rendered from `Icons.jsx` are `aria-hidden="true"`, `focusable="false"`, em-sized and `currentColor`; 0 use a status color as text.
- **SC-004**: `npm test`, `npm run build` and `npm audit --audit-level=high` all pass; the raw-color and contrast guard tests pass; the passing-test count does not drop (baseline 221).
- **SC-005**: Both `frontend-dev.md` agent files state the lucide-react icon rule and are in sync; 1 new decision (D-46) amends D-43; TS-14 is marked done in `docs/BACKLOG.md` and `docs/PROJECT_STATUS.md`.

## Assumptions

- `lucide-react` is the current line compatible with React 19 (the project uses React 19.3); the plan picks the exact pinned version and confirms `npm audit --audit-level=high` passes, the same way TS-13 picked and recorded `react-router` (D-45).
- The closest lucide names for the four statuses are expected to be `CheckCircle` (stable), `TriangleAlert` (warning), `OctagonX` (critical) and `CircleDashed` (no_data); the plan confirms the exact names available in the pinned version and maps them to the existing export names. If a name differs, only the wrapper changes, never the export name.
- lucide-react icons accept props and render a single `<svg>`; the wrappers set `aria-hidden="true"`, `focusable="false"`, an `em` size and rely on `currentColor` (lucide's default `stroke`), so the rendered markup satisfies the existing StatusBadge and LoginPage assertions. The plan verifies how lucide applies these props (for example whether `focusable="false"` must be passed explicitly) before finalizing the wrappers.
- The four call sites keep the no-props call style (`<CheckCircleIcon />` etc.); the fixed rendering lives in the wrapper, so call sites and their imports are untouched.
- The raw-color scan ignores `node_modules`, so importing icon shapes from `lucide-react` introduces no raw color into the scanned source; our `Icons.jsx` holds no color value.
- This story changes only the source of the four icon shapes and the agent rules and docs; it supersedes the "no icon library" part of D-43 and leaves the rest of D-43 (one token file, CSS Modules, status color as border/tint only, dark label, the two guard tests) in force, as the D-46 entry will state.
- The baseline test count is 221 as stated in the story; the real requirement is that no previously passing test fails and the count does not drop, since adding tests for the wrappers would raise it.
