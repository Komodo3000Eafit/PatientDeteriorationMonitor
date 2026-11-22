# Header UI Contract: Header Navigation (TS-15)

The shared `AppShell` header is the only interface this story exposes. This contract is what the
header-related tests assert. It supersedes the pre-TS-15 header shape for the shared component;
dependent functional-story tests are updated to match it (intent preserved).

> **2026-11-22 scope change.** The brand (logo + title) is now always visible, on every screen
> including the signed-out login screen: a `react-router` `Link` to `/patients` when signed in, and
> plain, non-linked branding (a `<span>`, no link role, not focusable) when signed out. The Home
> control stays signed-in-only (unchanged). Two visual refinements also apply: the Home button is
> more compact (horizontal padding `var(--space-3)`, with a `min-width: var(--size-target)` 44px
> floor), and the brand's `HeartPulse` icon is tinted with `--color-primary` (title text stays
> `--color-text`). C1/C2 below reflect this.

## C1 — Signed-in header (any clinical screen, including /patients)

Given `user` is present, the header MUST contain, in this reading order:

1. **Brand link** — `role="link"`, accessible name equal to the `app.title` text for the current
   language, `href="/patients"`, containing one decorative `HeartPulse` svg (`aria-hidden="true"`,
   `focusable="false"`) and the visible `app.title` text.
2. **Home link** — `role="link"`, accessible name equal to the `nav.home` text for the current
   language, `href="/patients"`, containing one decorative `House` svg (`aria-hidden="true"`,
   `focusable="false"`) and the visible `nav.home` text. Styled to look like a button; it is NOT a
   `<button>`.
3. **Disclaimer** — a `role="note"` element showing `disclaimer.text`, always present, with no
   close/hide control.
4. **User block** — a `role="group"` labelled `auth.signedInAs`, showing `user.full_name` and the
   translated role.
5. **Sign out** — a `<button>` named `auth.logout`; activating it signs out and the app lands on
   `/login`.
6. **Language switch** — a `role="group"` labelled `language.label` with the ES and EN buttons,
   each with `aria-pressed` reflecting the active language.

Button count in the signed-in header remains **exactly 3** (`Cerrar sesión`/`Sign out`, `Español`,
`English`); the two new navigation controls are links and add no buttons.

## C2 — Signed-out header (login screen)

Given `user` is null, the header MUST:

- Contain the **brand as plain, non-linked branding** (2026-11-22): the `HeartPulse` icon + the
  `app.title` text in a static element (a `<span class="brand">`), NOT a link (no `role="link"`,
  no `href`), not focusable and not in the tab order as a control, so it performs no navigation
  (`/patients` is protected and unreachable when signed out).
- NOT contain the Home link, the user block, or the sign-out button.
- Still contain the disclaimer (`role="note"`) and the language switch (`role="group"`,
  `language.label`).

## C3 — Navigation

- Activating the brand link navigates to `/patients` via client-side routing (no full reload).
- Activating the Home link navigates to `/patients` via client-side routing (no full reload).
- On `/patients` both controls are still present and still target `/patients` (activating is a
  no-op to the user).

## C4 — Accessibility

- Brand link and Home link are reachable in keyboard tab order (native `<a>`).
- Each has a non-empty accessible name from its visible translated text; icons are `aria-hidden`
  and contribute no name.
- The two controls have distinct accessible names (`app.title` vs `nav.home`), so they are not
  announced as two identical unlabelled controls.

## C5 — Internationalization

- Brand link text = `app.title`; Home link text = `nav.home`. Both switch with the ES/EN control:
  - es: brand `Monitor de Deterioro del Paciente`, Home `Inicio`.
  - en: brand `Patient Deterioration Monitor`, Home `Home`.

## C6 — Styling guards

- No raw hex, CSS color function, named color, inline style, or non-token `font-size` is introduced
  (`styles/noRawColors.test.js` passes).
- Token pairs used meet WCAG AA (`styles/contrast.test.js` passes).
- The header stays `position: sticky` and `flex-wrap: wrap` (responsive, no clipping/overlap).

## C7 — Scope / non-functional

- Only `AppShell.jsx`, `AppShell.module.css`, `Icons.jsx`, `i18n/translations.js` and the three
  header-related test files change. The backend is unchanged. No dependency is added.
- The full frontend suite still passes; the passing-test count does not drop (baseline 628).
