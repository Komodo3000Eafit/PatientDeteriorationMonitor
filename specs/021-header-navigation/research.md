# Phase 0 Research: Header Navigation (TS-15)

The spec had no open `NEEDS CLARIFICATION` markers (the two clarify questions were resolved). The
items below record the implementation choices verified against the current codebase so Phase 1 and
`/speckit-tasks` have no unknowns.

## R1 — Navigation mechanism for the brand and Home controls

- **Decision**: Both are `react-router` `<Link to="/patients">`. The brand is `HeartPulseIcon` +
  `app.title` inside one `Link`; the Home control is `HouseIcon` + `nav.home` inside a second
  `Link` styled to look like a button.
- **Rationale**: Locked in `/speckit-clarify`. `Link` keeps `role=link`, is keyboard reachable and
  announced as a link with its text as the accessible name, needs no click handler, and matches the
  existing `Link` usage (`PatientTable.jsx`, `NotFoundPage.jsx`, `PatientDetailPage.jsx`,
  `RegisterPatientPage.jsx` all do `<Link to="/patients">{t('nav.backToPatients')}</Link>`).
- **Alternatives considered**: `<button onClick={() => navigate('/patients')}>` (rejected: changes
  the role to button, needs a handler, and diverges from the clarify decision and the brand link).

## R2 — Why the Home link is not built from the shared `Button` component

- **Decision**: Style the Home `Link` with a class in `AppShell.module.css` using the same tokens
  the secondary `Button` uses; do not route it through `Button.jsx`.
- **Rationale**: `Button.jsx` renders a hard `<button>` and **intentionally ignores** `className`
  and `style` (`className: _ignoredClassName, style: _ignoredStyle`). It cannot emit an `<a>`/`Link`.
  Forcing the Home control through it would make it a `<button>`, contradicting the clarify decision
  (must stay a link). Reusing the same tokens in the module gives the identical look without the
  wrong element.
- **Alternatives considered**: (a) Generalize `Button` to render `as={Link}` — rejected as
  over-engineering a shared component for one caller (Principle XII) and out of this story's scope.
  (b) Inline styles on the `Link` — rejected: `noRawColors.test.js` flags any `style=` attribute.

## R3 — Icon source and decorative attributes

- **Decision**: Add `HeartPulseIcon` and `HouseIcon` to `components/Icons.jsx`, each a thin wrapper
  over lucide `HeartPulse` / `House` using the file's existing `iconProps`
  (`{ 'aria-hidden': 'true', focusable: 'false', size: '1.4em' }`), inheriting `currentColor`.
- **Rationale**: Confirmed both names exist in the installed `lucide-react`
  (`HeartPulse: true, House: true`). Following the TS-14 pattern (D-46) keeps one icon source, the
  decorative contract, em sizing and `currentColor`, and passes `noRawColors.test.js` (JSX color
  attributes are only `fill="none"` / `stroke="currentColor"`, both allowed).
- **Alternatives considered**: Import lucide icons directly in `AppShell.jsx` — acceptable per the
  spec, but the wrapper file is the established convention and keeps the decorative props in one
  place.

## R4 — Accessible names and keyboard reachability

- **Decision**: The icon in each control is `aria-hidden`; the control's accessible name is its
  visible text (`app.title` for the brand, `nav.home` for Home). No `aria-label` is added, so the
  visible text and the accessible name stay in sync across ES/EN.
- **Rationale**: Real `<a>` elements are in the tab order by default, satisfying AC6/FR-011. Using
  visible text as the name avoids a duplicate hard-coded string and keeps i18n as the single source
  (FR-013). Tests can query `getByRole('link', { name: <app.title> })` and
  `getByRole('link', { name: <nav.home> })`.

## R5 — Visibility condition (signed in vs. signed out)

- **Decision**: Render the brand link and the Home link inside the same `{user && ( … )}` block that
  already guards the user block.
- **Rationale**: Matches FR-003/FR-004 and the clarify note: "always visible across signed-in
  screens" is governed by the same authenticated-user condition, with no per-route hiding. On
  `/login` the user is null, so both are absent (AC4); on `/patients` the user is present, so both
  show (AC5).

## R6 — Impact on existing header tests (counts and structure)

- **Finding**: `i18n/language.test.jsx` → `AC6 banner cannot be dismissed` asserts the signed-in
  header has **exactly 3 buttons** (`Cerrar sesión`, `Español`, `English`). Because the Home control
  is a `Link` (role: link), it adds **zero** buttons, so this count stays correct and the assertion
  does not need to change for the button count. (`getAllByRole('button')` also excludes the hidden
  test-only `go-back` button.)
- **Finding**: `auth/auth.test.jsx` asserts the sign-out button, the `Sesión iniciada` group and
  (signed out) the absence of `Cerrar sesión`. These stay valid; the signed-out assertions may gain
  an explicit check that the brand/Home links are absent (new coverage, not a weakening).
- **Finding**: `App.routes.test.jsx` drives navigation and checks the current path; it is the
  natural home for asserting the brand and Home links carry `href="/patients"` and navigate there.
- **Decision**: Update these three files to reflect the new shared structure and add the missing
  coverage; keep every existing assertion's intent. New/strengthened header assertions for the
  acceptance criteria go where they fit best (navigation in `App.routes.test.jsx`; signed-in/out
  visibility and accessible names in `auth.test.jsx`; ES/EN label in `language.test.jsx`).
- **Rationale**: Principle III allows a technical story to change shared infrastructure and update
  dependent tests to match, preserving intent. Baseline is 628 passing tests across 32 files; the
  count must not drop.

## R7 — Token-only styling and guards

- **Decision**: All new CSS uses existing tokens only; no raw hex, color function, named color,
  inline style, or non-token `font-size`. The Home link's look reuses `--size-target`,
  `--radius-md`, `--space-2`/`--space-4`, `--color-bg`, `--color-text`, `--color-border-strong`,
  `--color-primary-soft`/`--color-primary` (hover) and the focus tokens, mirroring the secondary
  button style already in `Button.module.css`.
- **Rationale**: `noRawColors.test.js` scans every `.css`/`.jsx` under `src/`; reusing tokens keeps
  it green. `contrast.test.js` already covers the token pairs used, so the AA contrast guard stays
  green. Verified against the current baseline (both guards pass today).

## R8 — i18n key

- **Decision**: Add `nav.home` to both language blocks in `i18n/translations.js`
  (es: `Inicio`, en: `Home`), following the existing `nav.backToPatients` convention; Spanish is the
  complete reference.
- **Rationale**: Matches FR-009 and the clarify decision; `nav.*` is the existing namespace for
  navigation labels.
