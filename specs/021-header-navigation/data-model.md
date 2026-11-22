# Phase 1 Data Model: Header Navigation (TS-15)

This story is presentational and persists no data. The "model" here is the header's element
inventory and the state that governs each element's visibility and text. No database entity, API
field, or migration is involved.

## State read by the header

| State | Source | Used for |
|-------|--------|----------|
| `user` | `useAuth()` (`AuthContext`) | Gate: brand link, Home link and user block render only when `user` is truthy. Supplies `user.full_name` and `user.role`. |
| `lang`, `t`, `setLang` | `useLanguage()` (`LanguageContext`) | Translate `app.title`, `nav.home`, disclaimer, role and language labels; switch language. |
| `navigate` | `useNavigate()` (`react-router`) | Sign-out redirect to `/login` (unchanged). Navigation to `/patients` uses `<Link>`, not `navigate`. |

## Header elements (in render order)

| # | Element | Condition | Type / role | Accessible name | Text / content | New? |
|---|---------|-----------|-------------|-----------------|----------------|------|
| 1 | Brand link | `user` present | `<Link to="/patients">` (role: link) | `app.title` text | `HeartPulseIcon` (decorative) + `app.title` | New |
| 2 | Home link | `user` present | `<Link to="/patients">` styled as button (role: link) | `nav.home` text | `HouseIcon` (decorative) + `nav.home` | New |
| 3 | Disclaimer | always | `<p role="note">` | n/a | `TriangleAlertIcon` + `disclaimer.text`; non-closable | Unchanged |
| 4 | User block | `user` present | `<div role="group">` labelled `auth.signedInAs` | group label | `user.full_name` + translated `role.<role>` | Unchanged |
| 5 | Sign out | `user` present | `<button>` (inside user block) | `auth.logout` | sign out → `/login` | Unchanged |
| 6 | Language switch | always | `<div role="group">` labelled `language.label` | group label | ES / EN buttons with `aria-pressed` | Unchanged |

Elements 1 and 2 render inside the same `{user && ( … )}` guard as elements 4–5.

## i18n keys

| Key | es (default) | en | Status |
|-----|--------------|----|--------|
| `app.title` | Monitor de Deterioro del Paciente | Patient Deterioration Monitor | Existing (reused as brand link text) |
| `nav.home` | Inicio | Home | **New** |
| `disclaimer.text`, `language.label`, `auth.signedInAs`, `auth.logout`, `role.*` | — | — | Existing (unchanged) |

## Icon wrappers (components/Icons.jsx)

| Export | lucide source | Props | Used by |
|--------|---------------|-------|---------|
| `HeartPulseIcon` | `HeartPulse` | `aria-hidden="true"`, `focusable="false"`, `size="1.4em"`, `currentColor` | Brand link |
| `HouseIcon` | `House` | `aria-hidden="true"`, `focusable="false"`, `size="1.4em"`, `currentColor` | Home link |

## Invariants

- Brand link and Home link both point at `/patients` (`href="/patients"`).
- When `user` is null (login screen), elements 1, 2, 4, 5 are absent; elements 3 and 6 remain.
- Icons are decorative only (`aria-hidden`); each navigation control's accessible name is its
  visible translated text.
- No raw colors, no inline styles, token-only CSS; ES/EN text comes only from `translations.js`.
