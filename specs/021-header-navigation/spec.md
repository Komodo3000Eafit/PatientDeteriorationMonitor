# Feature Specification: Header Navigation

**Feature Branch**: `021-header-navigation`

**Created**: 2026-11-20

**Status**: Draft

**Input**: User description: "TS-15 — Header navigation (technical story). Redesign the shared AppShell header (frontend/src/components/AppShell.jsx) so clinicians can get back to the home screen (/patients) from any signed-in screen. When signed in, the header shows on the left the app logo (HeartPulse lucide icon) and the app title (app.title i18n key), together linking to /patients, plus a Home button (House lucide icon) that navigates to /patients. Both are shown only when authenticated and are always visible across signed-in screens (including /patients). Reorganize the header layout (logo+title · Home · disclaimer · user block · sign out · ES/EN) keeping the disclaimer, user block, sign-out and language switch working exactly as before. New i18n keys for Home (Spanish default + English); lucide icons decorative; tokens only; existing header tests updated. Navigation uses react-router (TS-13); no new dependency."

## User Story *(mandatory)*

**Story ID**: TS-15

**Type**: Technical

**Story**: As a clinician using any signed-in screen, I want a clearly branded header with a logo/title and a Home control that both return me to the patient list, so that I can get back to the home screen from anywhere in the app without editing the URL or using the browser back button.

**Depends on**: TS-05 (language and disclaimer), TS-06 (authentication), TS-12 (UI foundation), TS-13 (client routing), TS-14 (icon library). All merged.

## Clarifications

### Session 2026-11-20

- Q: How should the Home control navigate to `/patients` — a router `Link` styled as a button, or a `<button>` that calls navigate? → A: Router `Link` to `/patients`, styled to look like a button (role: link), mirroring the logo/title link.
- Q: What i18n key name should the new Home label use? → A: `nav.home`.

### Session 2026-11-22 — scope change (team decision)

- Change: the app logo + title (`HeartPulse` icon + `app.title`) MUST be visible on **every** screen, including the signed-out login screen, for consistent branding — not only when signed in (supersedes the earlier "logo/title hidden when signed out" from Session 2026-11-20).
- The brand still respects auth as a navigation control: **signed in**, the logo + title is a `react-router` `Link` to `/patients` (role: link); **signed out**, it is plain, non-linked branding (a static logo + title, not a link), because `/patients` is a protected route a signed-out visitor cannot reach — so there is no navigation from it when signed out.
- The separate Home control (`House` icon + `nav.home`) stays auth-gated: it appears **only when signed in** and is absent on the login screen (unchanged), because it is a navigation action to a protected route.
- Net effect: only the Home control is auth-gated now; the brand is always shown. Affected items updated: AC1, AC4, AC5, AC6, FR-001, FR-003, FR-004, FR-005, FR-011, Key Entities, SC-002, and the related edge cases.

### Acceptance Criteria

<!-- Each criterion must be testable. qa-tester writes at least one test per criterion. -->

1. **AC1 — Logo + title always visible; a link to /patients only when signed in**: **Given** any screen, **When** the header renders, **Then** it shows the app logo (the `HeartPulse` lucide icon) and the app title (the `app.title` text) on the left. **When** a user is authenticated, the logo and title together form a single link whose destination is `/patients`; **when** no user is authenticated (the login screen), the logo and title are shown as plain, non-linked branding (static text and icon, not a link).
2. **AC2 — Logo/title link navigates to /patients (signed in)**: **Given** an authenticated user on a signed-in screen other than `/patients` (for example a patient detail screen), **When** they activate the logo/title link, **Then** the app navigates to `/patients` without a full page reload.
3. **AC3 — Home control navigates to /patients**: **Given** an authenticated user on any signed-in screen, **When** they activate the Home control (a router `Link` to `/patients` styled as a button, labelled with the `nav.home` text and showing the `House` lucide icon), **Then** the app navigates to `/patients` without a full page reload.
4. **AC4 — When signed out: brand present as non-linked branding, Home control absent**: **Given** a signed-out visitor on the login screen, **When** the header renders, **Then** the logo + title IS present as plain, non-linked branding (not a link, so it performs no navigation), **and** the Home control does NOT appear (it is auth-gated, same condition as the existing user block), while the disclaimer banner and the ES/EN language switch still appear.
5. **AC5 — Brand (as a link) and Home visible on /patients when signed in**: **Given** an authenticated user on `/patients` itself, **When** the header renders, **Then** both the logo/title link and the Home control are visible (they are not hidden on the home screen).
6. **AC6 — Keyboard reachable with accessible names (when links)**: **Given** an authenticated user, **When** they move focus through the header with the keyboard, **Then** both the logo/title link and the Home control are reachable in tab order and each exposes an accessible name (the logo/title link via the app title text; the Home control via the Home label), so a screen-reader user can identify and activate each. **Given** a signed-out visitor, the logo + title is non-interactive branding and is not in the tab order as a control.
7. **AC7 — Disclaimer unchanged**: **Given** any screen (signed in or signed out), **When** the header renders, **Then** the pinned disclaimer banner is present with `role="note"`, shows the `disclaimer.text`, is always visible and has no close or hide control, exactly as before.
8. **AC8 — User block, sign out and ES/EN still work**: **Given** an authenticated user, **When** the header renders, **Then** the user block still shows the user's full name and translated role, the sign-out button still signs the user out and lands on `/login`, and the ES/EN language switch still switches language, all behaving as before TS-15; **and** their existing tests still pass.
9. **AC9 — Spanish default and English**: **Given** the default language, **When** the header renders, **Then** the Home control shows its Spanish label; **When** the user switches to English, **Then** the Home control shows its English label; the app title uses the already-translated `app.title` value in each language.
10. **AC10 — Icons decorative, tokens only, no raw colors**: **Given** the redesigned header, **When** it is read and its guard tests run, **Then** the `HeartPulse` and `House` icons come from `lucide-react`, are decorative (`aria-hidden="true"`, `focusable="false"`, em-sized, `currentColor`), the header uses design tokens only (no raw colors, no inline styles), and the raw-color guard and contrast guard tests keep passing.
11. **AC11 — Scope and no new dependency**: **Given** the finished story, **When** the diff is reviewed, **Then** the change is limited to `AppShell.jsx`, its CSS module, the i18n keys and the header-related tests; navigation uses the existing `react-router` from TS-13 with no new dependency added; and the backend is unchanged.
12. **AC12 — Nothing else breaks**: **Given** the finished story, **When** `npm test` and `npm run build` run in `frontend/`, **Then** all pass with no backend and no network, and every previously passing test still passes (the passing-test count does not drop).

### Out of Scope

- Any backend change.
- Any change to authentication, session handling or route protection (`<RequireAuth>` from TS-13); TS-15 only adds navigation controls that read the existing auth state.
- Adding routes, pages or navigation targets other than `/patients` (no breadcrumbs, no multi-item nav menu, no links to patient detail or other screens).
- Changing the disclaimer text, the user block content, the sign-out behavior or the ES/EN switch behavior; they must keep working exactly as before.
- Restyling the design tokens themselves, the status colors or any shared component other than the header frame.
- Adding a mobile hamburger menu or any responsive pattern beyond keeping the existing flex-wrap header readable.

### Edge Cases

- **On `/patients` the Home control is redundant but must stay visible**: activating the logo/title link or the Home control while already on `/patients` navigates to `/patients` again (a no-op to the user); the controls are not hidden there.
- **Signed out on the login screen**: the logo + title is shown as plain, non-linked branding (no navigation, since `/patients` is a protected route a signed-out visitor cannot reach), the Home control is absent (auth-gated), and the disclaimer and the language switch remain.
- **Long app title or many header items on a narrow viewport**: the header keeps wrapping (as it does today with `flex-wrap`) so no item is clipped or overlaps; the layout order reads logo+title · Home · disclaimer · user · sign out · ES/EN.
- **Language switched while signed in**: the app title and the `nav.home` label update to the selected language immediately, like the rest of the header text.
- **A screen-reader user tabbing the header**: the logo/title link and the Home control each have a distinct accessible name, so they are not announced as two unlabelled controls pointing at the same place.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The header MUST always show, on the left, the app logo (the `HeartPulse` icon from `lucide-react`) together with the app title (the existing `app.title` i18n text), on every screen including the signed-out login screen. When a user is authenticated, the logo and title together MUST form a single link whose destination is the `/patients` route; when no user is authenticated, the logo and title MUST be rendered as plain, non-linked branding (not a link, performing no navigation).
- **FR-002**: When a user is authenticated, the header MUST show a Home control that navigates to `/patients`. It MUST be a `react-router` `Link` to `/patients` styled to look like a button (role: link), showing the `House` icon from `lucide-react` and the translated `nav.home` label, mirroring the logo/title link.
- **FR-003**: The Home control MUST be shown only when there is an authenticated user (the same condition that governs the existing user block) and MUST NOT appear on the signed-out login screen. The logo + title, by contrast, MUST always be shown (see FR-001); only its link behavior is auth-gated.
- **FR-004**: When the user is authenticated, the logo/title link and the Home control MUST be visible on every signed-in screen, including `/patients` itself (they MUST NOT be hidden on the home screen).
- **FR-005**: Navigation MUST use the existing `react-router` client navigation from TS-13: when signed in, the logo/title and the Home control are both `Link`s to `/patients` (no full page reload); when signed out, the logo/title is non-linked branding and does not navigate. No new dependency is added.
- **FR-006**: The header MUST be laid out so it reads cleanly in the order logo+title · Home · disclaimer · user block · sign out · ES/EN and stays responsive (wrapping without clipping or overlap on narrow viewports), without breaking the existing sticky, token-based header styling.
- **FR-007**: The pinned disclaimer banner MUST remain present with `role="note"`, always visible and non-closable, showing the `disclaimer.text`, exactly as before.
- **FR-008**: The user block (full name and translated role), the sign-out button (which signs out and navigates to `/login`) and the ES/EN language switch MUST keep working exactly as before TS-15.
- **FR-009**: The project MUST add a new i18n key, `nav.home`, for the Home label in both languages (Spanish as the default reference and English), following the existing `translations.js` convention.
- **FR-010**: The `HeartPulse` and `House` icons MUST be decorative: `aria-hidden="true"`, `focusable="false"`, em-sized so they scale with surrounding text, and drawn with `currentColor` (never a status color used as text), consistent with D-46 and the TS-14 icon rules.
- **FR-011**: When signed in, the logo/title link and the Home control MUST be reachable by keyboard (present in the tab order) and MUST each expose an accessible name (the logo/title link named by the app title text; the Home control named by the `nav.home` label), so neither is an unlabelled control. When signed out, the logo + title is non-interactive branding and MUST NOT be exposed as a control in the tab order.
- **FR-012**: The header MUST be styled with design tokens only (no raw hex colors, no CSS color functions, no named colors, no inline styles); the raw-color guard test and the contrast guard test MUST keep passing.
- **FR-013**: All user-visible header text MUST come from the i18n layer (`app.title`, the new `nav.home` label, and the existing disclaimer, role, sign-out and language texts); no hard-coded user-facing string MUST be added.
- **FR-014**: The change MUST be scoped to `frontend/src/components/AppShell.jsx`, its CSS module, the i18n keys in `frontend/src/i18n/translations.js`, and the header-related tests; the backend MUST NOT change.
- **FR-015**: Every test that passed before MUST keep passing, with no backend and no network; `npm test` and `npm run build` MUST succeed in `frontend/`, and the passing-test count MUST NOT drop.

### Key Entities *(include if feature involves data)*

- **Header brand**: the logo (`HeartPulse` icon) plus the app title (`app.title`), always shown on every screen. When signed in it is rendered as one client-side link to `/patients`; when signed out it is plain, non-linked branding.
- **Home control**: a header `react-router` `Link` to `/patients` styled as a button (`House` icon plus the `nav.home` label), shown only when authenticated.
- **Home i18n label**: the new `nav.home` translation key (Spanish default + English) for the Home control's accessible name and visible text.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From any signed-in screen, a clinician can return to `/patients` using either the logo/title link or the Home control in a single activation (2 distinct controls, both reaching the home screen).
- **SC-002**: When signed out on the login screen, the logo + title is present as non-linked branding (1 of 1), 0 navigation links are exposed by the brand, the Home control does not appear, and the disclaimer and ES/EN switch still appear.
- **SC-003**: When signed in, both navigation controls are visible on 100% of signed-in screens, including `/patients` itself.
- **SC-004**: Both navigation controls are reachable by keyboard and each has a non-empty accessible name (2 of 2), verified by a header accessibility test.
- **SC-005**: The Home label and the app title display in the selected language, correct in both Spanish (default) and English (2 of 2 languages).
- **SC-006**: `npm test` and `npm run build` pass in `frontend/`; the raw-color and contrast guard tests pass; the disclaimer, user-block, sign-out and ES/EN tests still pass; the passing-test count does not drop; 0 new dependencies are added and the backend is unchanged.

## Assumptions

- The `lucide-react` icon source adopted in TS-14 (D-46) provides `HeartPulse` and `House` icons in the pinned version; the plan confirms the exact names available and wraps them with the same decorative, em-sized, `currentColor` rendering used by the existing status icons.
- The existing `react-router` from TS-13 is used for navigation: when signed in, both the logo/title and the Home control are `Link`s to `/patients` (the Home control is a `Link` styled as a button), so both are keyboard reachable with accessible names and neither adds a dependency; when signed out, the logo/title is rendered as plain, non-linked branding.
- The new Home i18n key is `nav.home`, following the existing dotted naming convention in `translations.js`, with Spanish as the complete reference and an English entry.
- "Always visible across signed-in screens" (for the Home control and the brand-as-link) is governed by the same authenticated-user condition as the existing user block; no per-route hiding logic is added. The brand itself is always rendered regardless of auth; only whether it is a link or plain branding depends on the auth state.
- The redesigned layout keeps the current sticky, token-based header styling and the existing `flex-wrap` responsive behavior; no new responsive framework or breakpoint system is introduced (constitution Principle XII, keep it simple).
- The header tests currently live with the shell/routing/auth/language tests (for example `App.routes.test.jsx`, `auth.test.jsx`, `language.test.jsx`); the plan decides whether to extend those or add a dedicated header test, as long as every acceptance criterion has at least one test and no previously passing test is lost.
