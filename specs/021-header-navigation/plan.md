# Implementation Plan: Header Navigation (TS-15)

**Branch**: `021-header-navigation` | **Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/021-header-navigation/spec.md`

## Summary

> **2026-11-22 scope change (team decision).** The brand (logo + title) is now always visible on
> every screen including the signed-out login screen: a `react-router` `Link` to `/patients` when
> signed in, and plain, non-linked branding (a static `<span>`, no link role, not focusable) when
> signed out, because `/patients` is a protected route a signed-out visitor cannot reach. The Home
> control stays signed-in-only (unchanged). Two visual refinements ship with it: a more compact
> Home button (horizontal padding reduced to `var(--space-3)`, keeping the `min-height` and adding a
> `min-width: var(--size-target)` 44px floor) and the brand's `HeartPulse` icon tinted with
> `--color-primary` (title text stays `--color-text`). Design decision 5 below is updated: only the
> Home control and the brand's *link* behavior are auth-gated; the brand element itself always
> renders.

Redesign the shared `AppShell` header so a signed-in clinician can return to the home screen
(`/patients`) from anywhere. When a user is present, the header gains a brand link (the `HeartPulse`
lucide icon + the `app.title` text) and a Home link (the `House` lucide icon + a new `nav.home`
label), both `react-router` `<Link to="/patients">`. Both render only when `user` is truthy (the
same condition as the existing user block), so they are absent on the login screen and always
present on signed-in screens including `/patients`. The disclaimer banner, user block, sign-out
button and ES/EN switch keep their current behavior. New element order: brand · Home · disclaimer ·
user block · sign out · ES/EN.

The change is confined to the frontend header: `frontend/src/components/AppShell.jsx`, its CSS
module `AppShell.module.css`, two new icon wrappers in `components/Icons.jsx`, the `nav.home` i18n
keys in `i18n/translations.js`, and the header-related tests. No backend change, no new dependency
(`react-router` from TS-13 and `lucide-react` from TS-14 are reused).

## Technical Context

**Language/Version**: JavaScript (ES modules), React 19, Vite; Node for the test runner.

**Primary Dependencies**: `react`, `react-router` (TS-13, D-45), `lucide-react` (TS-14, D-46). No
new dependency is added by this story.

**Storage**: N/A (presentational; reads auth state from `AuthContext` and language from
`LanguageContext`).

**Testing**: Vitest + @testing-library/react + jsdom; in-memory router via `src/testing/renderApp.jsx`;
backend and network stubbed. Guard tests: `styles/noRawColors.test.js`, `styles/contrast.test.js`.

**Target Platform**: Modern browsers; the app is served by FastAPI from one Azure App Service
(unchanged here).

**Project Type**: Web application (`backend/` + `frontend/`); this story touches `frontend/` only.

**Performance Goals**: N/A — static header; navigation is client-side (no page reload).

**Constraints**: Design tokens only (no raw hex, color functions, named colors, inline styles, or
non-token font-size — enforced by `noRawColors.test.js`); WCAG AA contrast (`contrast.test.js`);
all user-facing text via i18n (Spanish default + English); icons decorative; keyboard reachable
with accessible names; header stays sticky and responsive (`flex-wrap`).

**Scale/Scope**: One shared component, its CSS module, two icon wrappers, two i18n key pairs, and
the header-related test files. Baseline frontend suite: 628 tests across 32 files, all passing.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] I. Spec-driven and traceable: every task traces to an AC of TS-15; tests reference the AC they verify. Spec → plan → tasks → code → tests chain intact.
- [x] II. Small Scrum story: one technical story, header-only, implementable in one short sitting; one `specs/` folder, one branch, one PR.
- [x] III. Independence: TS-15 depends only on merged TS-05/06/12/13/14 (per `docs/BACKLOG.md`). It deliberately changes a shared technical component (`AppShell`), not a functional story's feature code. The functional stories' header assertions are **updated to match the new shared structure, not weakened** — allowed because `AppShell` is shared infrastructure owned by the technical-story layer, and the test intent (disclaimer non-closable, sign-out present, ES/EN group labelled) is preserved. No functional story's feature logic changes.
- [x] IV. Multi-agent: frontend-dev implements `AppShell`, CSS, icons and i18n; qa-tester writes/updates header tests; security-reviewer confirms no auth/route-protection change; work recorded in the PR agent log.
- [x] V. Clinical logic: N/A — no scoring, prediction, alerts or triage behavior; the story adds navigation only and changes no clinical logic.
- [x] VI. Data privacy: no data handled; no secrets; synthetic demo users only in tests.
- [x] VII. Tests: this is not a clinical critical path, but the story still adds/updates automated tests for every AC (visibility when signed in/out, navigation target, keyboard reachability, accessible names, ES/EN label) and keeps the guard tests green.
- [x] VIII. Security baseline: no change to authentication or route protection (`<RequireAuth>`). The brand and Home links render only when `user` is present, so no control points a signed-out visitor at a protected route. Input validation N/A (no inputs added).
- [x] IX. Deployable at low cost: frontend-only change served by the existing App Service; no new service.
- [x] X. Stack: React + `react-router`; within the fixed stack.
- [x] XI. Language: code, comments, spec, plan in English; the Home label added in Spanish (default) and English; `nav.home` follows the existing `nav.*` convention. No new domain glossary term is introduced ("Home"/"Inicio" is UI chrome, not a clinical term), so `docs/GLOSSARY.md` needs no entry.
- [x] XII. Simplicity: reuse `react-router` `Link` and `lucide-react`; style the Home link in the existing CSS module with existing tokens; add no abstraction, component library change, or new dependency. The `Button` component renders a hard `<button>` and ignores `className`/`style` (by design), so the Home link cannot reuse it and stay a link — styling the `Link` in `AppShell.module.css` with the same tokens is the simplest option that keeps `role=link`.

All principles satisfied. **Complexity Tracking is empty** (no violations).

## Project Structure

### Documentation (this feature)

```text
specs/021-header-navigation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (header element model)
├── quickstart.md        # Phase 1 output (how to validate)
├── contracts/
│   └── header.md        # Phase 1 output (header UI contract: elements, roles, names, order)
└── checklists/
    └── requirements.md  # From /speckit-specify
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── components/
│   │   ├── AppShell.jsx           # CHANGED: brand link + Home link, reordered layout
│   │   ├── AppShell.module.css    # CHANGED: layout/order, brand + Home link styling (tokens)
│   │   ├── Icons.jsx              # CHANGED: add HeartPulseIcon + HouseIcon wrappers (TS-14 pattern)
│   │   └── Button.jsx             # UNCHANGED (kept as-is; Home control is a Link, not a Button)
│   ├── i18n/
│   │   └── translations.js        # CHANGED: add 'nav.home' (es + en)
│   ├── App.routes.test.jsx        # UPDATED: header-structure assertions
│   ├── auth/auth.test.jsx         # UPDATED: header-structure assertions
│   └── i18n/language.test.jsx     # UPDATED: header-structure assertions
└── (backend/ unchanged)
```

**Structure Decision**: Web application; only `frontend/src/components/`, `frontend/src/i18n/` and
the three header-related test files are touched. The backend is untouched.

## Design decisions (locked)

1. **Both navigation controls are `react-router` `<Link to="/patients">`.** The brand (logo + title)
   is one link; the Home control is a second link styled to look like a button. Both keep
   `role=link`. Client-side navigation, no full reload. This matches the clarify decision and the
   existing `Link` usage across pages (`PatientTable`, `NotFoundPage`, `PatientDetailPage`).

2. **Home link styling.** `Button.jsx` renders a hard `<button>` and intentionally ignores
   `className`/`style`, so it cannot render the Home control as a link. The Home `Link` is styled in
   `AppShell.module.css` with a class that reuses the same design tokens as the secondary button
   look (`--size-target`, `--radius-md`, `--color-bg`, `--color-text`, `--color-border-strong`,
   `--space-*`, `--focus-ring`/`--focus-offset` on `:focus-visible`), so it visually matches a
   secondary button while staying a link. No inline styles (the raw-color guard flags `style=`).

3. **Icons.** Add `HeartPulseIcon` and `HouseIcon` to `components/Icons.jsx` as thin wrappers over
   lucide `HeartPulse` and `House`, following the existing TS-14 pattern (shared `iconProps`:
   `aria-hidden="true"`, `focusable="false"`, `size: '1.4em'`, `currentColor` by default). Keeping
   all icon wrappers in one file matches the existing convention and keeps call sites clean.

4. **Accessible names.** The brand link's accessible name comes from its visible `app.title` text
   (icon is `aria-hidden`). The Home link's accessible name comes from its visible `nav.home` text.
   Both are real `<a>` elements in the tab order, so keyboard reachability is automatic.

5. **Visibility condition.** The brand link and the Home link render inside the same
   `{user && ( ... )}` guard that already wraps the user block, so they appear only when
   authenticated and on every signed-in screen including `/patients`.

6. **Layout/order.** Header children, in order: brand link, Home link, disclaimer, user block,
   sign-out (inside the user block as today), ES/EN switch. The header stays `position: sticky`
   with `flex-wrap: wrap` so it still wraps on narrow viewports. A left group (brand + Home) and the
   existing right-aligned items are arranged with the existing flex tokens; no new responsive system.

## Complexity Tracking

> No Constitution Check violations. This section is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| — | — | — |
