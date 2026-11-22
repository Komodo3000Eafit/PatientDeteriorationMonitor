---
description: "Task list for TS-15 Header navigation"
---

# Tasks: Header Navigation (TS-15)

> **2026-11-22 scope change (team decision).** The brand (logo + title) is now always visible: a
> `Link` to `/patients` when signed in, and plain, non-linked branding (a static `<span>`, no link
> role, not focusable) when signed out. The Home control stays signed-in-only (unchanged). Two
> visual refinements ship with it: a more compact Home button (horizontal padding `var(--space-3)`,
> plus `min-width: var(--size-target)`) and the brand's `HeartPulse` icon tinted with
> `--color-primary` (title text stays `--color-text`). Tasks T003/T004 and the T005–T007 header
> assertions are adjusted accordingly; AC4's "brand absent when signed out" became "brand present as
> non-linked branding".

**Input**: Design documents from `/specs/021-header-navigation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/header.md, quickstart.md

**Tests**: TS-15 is not a clinical critical path, but the plan requires at least one automated test
per acceptance criterion and the guards must stay green (Principle VII). Test tasks are included and
owned by `qa-tester`.

## Format: `[ID] [P?] [Story] Description (agent)`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: TS-15 (one story per feature)
- **(agent)**: owner agent — frontend-dev, qa-tester, security-reviewer
- Exact file paths are given in each task.

## Path Conventions

Web app layout. All changed files are under `frontend/src/`; the backend is untouched.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: add the reusable pieces the header will consume, without touching the header yet.

- [X] T001 [P] [TS-15] Add the `nav.home` i18n key to both language blocks in `frontend/src/i18n/translations.js`: `es` → `'nav.home': 'Inicio'` (next to the existing `'nav.backToPatients'`), `en` → `'nav.home': 'Home'` (next to its English counterpart). Spanish is the complete reference; do not change any other key. (frontend-dev)
- [X] T002 [P] [TS-15] Add two decorative icon wrappers to `frontend/src/components/Icons.jsx` following the existing TS-14 pattern (reuse the shared `iconProps`: `aria-hidden="true"`, `focusable="false"`, `size: '1.4em'`, `currentColor`): `export function HeartPulseIcon()` over lucide `HeartPulse`, and `export function HouseIcon()` over lucide `House`. Add `HeartPulse` and `House` to the existing `import { … } from 'lucide-react'`. Add no new dependency. (frontend-dev)

**Checkpoint**: `nav.home` resolves in both languages and the two icon wrappers are importable.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: none beyond Phase 1. Setup provides everything the header needs; there is no database,
API, or auth change. Proceed to the story phase.

*(No foundational tasks — this story is frontend-only and adds no shared infrastructure beyond the
i18n key and icon wrappers in Phase 1.)*

---

## Phase 3: User Story TS-15 - Header navigation (Priority: P1) 🎯 MVP

**Goal**: when signed in, the shared header shows a brand link (`HeartPulse` + `app.title`) and a
Home link (`House` + `nav.home`), both `react-router` `<Link to="/patients">`, in the order brand ·
Home · disclaimer · user block · sign out · ES/EN; both are absent when signed out; the disclaimer,
user block, sign-out and ES/EN switch keep working.

**Independent Test**: run `npm test` and `npm run build` in `frontend/`; sign-in/out visibility,
navigation target, keyboard reachability, accessible names and ES/EN labels are all asserted, and
the raw-color/contrast guards stay green (see `quickstart.md` AC→test map).

### Implementation for User Story TS-15

- [X] T003 [TS-15] In `frontend/src/components/AppShell.jsx`, import `Link` from `react-router` and the new `HeartPulseIcon` and `HouseIcon` from `./Icons.jsx`. Inside the existing `{user && ( … )}` region (same condition as the user block), add, before the disclaimer in reading order: (1) a brand `<Link to="/patients">` containing `<HeartPulseIcon />` and `{t('app.title')}`; (2) a Home `<Link to="/patients">` containing `<HouseIcon />` and `{t('nav.home')}`, styled as a button via the CSS-module class from T004. Keep the icon decorative (no text alternative on the icon); each link's accessible name is its visible text. Do not add `aria-label`, inline styles, or a new dependency. Keep `useNavigate`/`handleLogout` and the sign-out, user block, disclaimer and ES/EN switch exactly as they are. (frontend-dev)
- [X] T004 [TS-15] In `frontend/src/components/AppShell.module.css`, add classes for the brand link and the Home link and adjust the header layout so it reads brand · Home · disclaimer · user block · sign out · ES/EN, keeping `position: sticky` and `flex-wrap: wrap`. Group the brand + Home on the left; keep the existing right-aligned items. Style the Home link to look like the secondary button using existing tokens only (`--size-target`, `--radius-md`, `--space-2`/`--space-4`, `--color-bg`, `--color-text`, `--color-border-strong`, hover `--color-primary-soft`/`--color-primary`, and `outline: var(--focus-ring); outline-offset: var(--focus-offset)` on `:focus-visible`); style the brand link as an inline-flex row with a token gap and inherited color. No raw hex, color function, named color, inline style, or non-token `font-size`. (frontend-dev)

**Checkpoint**: header renders correctly signed in and signed out; both links target `/patients`.

### Tests for User Story TS-15 ⚠

> Write/adjust these after T003–T004 so they assert the real structure; every acceptance criterion
> gets at least one test. Update dependent header assertions to match the new shared structure
> without weakening their intent (Principle III).

- [X] T005 [TS-15] In `frontend/src/App.routes.test.jsx`, add header-navigation tests: signed in, the brand link and the Home link each expose `role="link"` with `href="/patients"`; activating the brand link from a patient-detail route navigates to `/patients` (AC2); activating the Home link navigates to `/patients` (AC3). Use `renderApp` and the existing sign-in helpers; keep the existing route assertions intact. (qa-tester)
- [X] T006 [TS-15] In `frontend/src/auth/auth.test.jsx`, add: signed in on `/patients`, the brand link (named by `app.title`) and the Home link (named by `nav.home`) are present and keyboard-reachable as links with non-empty accessible names (AC1, AC5, AC6); signed out on the login screen, both links are absent while the disclaimer and ES/EN switch remain (AC4); the sign-out button still signs out and lands on `/login` and the `Sesión iniciada` group is unchanged (AC8). Keep every existing assertion's intent. (qa-tester)
- [X] T007 [TS-15] In `frontend/src/i18n/language.test.jsx`, add: signed in, the brand link shows the `app.title` text and the Home link shows the `nav.home` text in Spanish (`Inicio`) by default and in English (`Home`) after switching (AC9); confirm the disclaimer stays `role="note"` and non-closable and that the signed-in header still has exactly 3 buttons (the two new controls are links, not buttons) so the existing `AC6 banner cannot be dismissed` count assertion stays valid (AC7). Adjust that assertion's comment to note the links if needed, without changing the count. (qa-tester)
- [X] T008 [TS-15] Run `npm test` and `npm run build` in `frontend/`; confirm the raw-color guard (`src/styles/noRawColors.test.js`) and the contrast guard (`src/styles/contrast.test.js`) pass (AC10), the build succeeds, and the passing-test count does not drop below the baseline of 628 (AC12). (qa-tester)

### Review

- [X] T009 [TS-15] `security-reviewer` (read-only): confirm the story changes no authentication or route protection (`<RequireAuth>` untouched), that the brand and Home links render only when `user` is present so no control points a signed-out visitor at a protected route, that no secret or inline style is introduced, and that the change is scoped to `AppShell.jsx`, `AppShell.module.css`, `Icons.jsx`, `i18n/translations.js` and the three header test files with `frontend/package.json` unchanged (AC11). Report findings; do not change code. (security-reviewer)

**Checkpoint**: TS-15 fully functional, all acceptance criteria covered, guards green.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: project-record updates required by the constitution and AGENTS.md.

- [X] T010 [P] [TS-15] Mark TS-15 done in `docs/BACKLOG.md` (set its Status to ✅ and fill the Spec column with `021-header-navigation`) and update `docs/PROJECT_STATUS.md` to record TS-15 as completed, in the same PR. (frontend-dev)
- [X] T011 [P] [TS-15] Run the `quickstart.md` manual validation steps and confirm the signed-in/signed-out header behavior, navigation, keyboard focus, ES/EN switch and responsive wrapping match the spec. (qa-tester)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies; T001 and T002 can run in parallel.
- **Foundational (Phase 2)**: none.
- **Story (Phase 3)**: T003–T004 depend on Phase 1 (they import `nav.home`, `HeartPulseIcon`, `HouseIcon`). T005–T008 depend on T003–T004. T009 depends on the implementation being in place.
- **Polish (Phase 4)**: after the story passes (T008 green, T009 clear).

### Within the story

- Implementation T003 (AppShell markup) and T004 (CSS) are closely coupled but touch different files; do T004's class names together with T003's usage. Treat them as a pair.
- Tests T005, T006, T007 touch three different files and can run in parallel once T003–T004 land.
- T008 (full suite + guards) runs after T005–T007.

### Parallel Opportunities

- T001 and T002 (different files) in parallel.
- T005, T006, T007 (different test files) in parallel after implementation.
- T010 and T011 in parallel during polish.

---

## Parallel Example: Setup

```bash
# Launch the two setup tasks together (different files):
Task: "Add nav.home to frontend/src/i18n/translations.js" (frontend-dev)
Task: "Add HeartPulseIcon + HouseIcon to frontend/src/components/Icons.jsx" (frontend-dev)
```

## Parallel Example: Story tests

```bash
# After T003-T004, launch the three test-file updates together:
Task: "Navigation tests in frontend/src/App.routes.test.jsx" (qa-tester)
Task: "Visibility/accessible-name tests in frontend/src/auth/auth.test.jsx" (qa-tester)
Task: "ES/EN + disclaimer tests in frontend/src/i18n/language.test.jsx" (qa-tester)
```

---

## Implementation Strategy

### MVP (the whole story)

1. Phase 1: add `nav.home` and the two icon wrappers.
2. Phase 3 implementation: update `AppShell.jsx` and `AppShell.module.css`.
3. Phase 3 tests: cover every acceptance criterion; run the full suite and the guards.
4. Phase 3 review: security-reviewer confirms no auth/scope regression.
5. Phase 4: update backlog/status and run the manual quickstart.

### Notes

- [P] tasks are in different files with no incomplete dependency.
- The Home control MUST stay a `<Link>` (role: link); it is styled as a button, never rendered as one.
- Do not route the Home control through `Button.jsx` — it renders a hard `<button>` and ignores `className`/`style` by design.
- No backend change, no new dependency; keep `frontend/package.json` and the lockfile unchanged.
- Commit after each task or logical pair (T003+T004 together).
