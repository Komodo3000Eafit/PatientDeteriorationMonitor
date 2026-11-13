# Research: Language and Disclaimer (TS-05)

The tech choices came with the `/speckit-plan` input. This file records them, the reasons, and the details that needed deciding: where the language state lives so TS-04's tests keep passing, inserted values (the API version), and the language names on the switch.

## R1. No i18n library

- **Decision**: a small module `frontend/src/i18n/translations.js` with `export const translations = { es: {...}, en: {...} }` and flat dotted keys (`health.checking`, `disclaimer.text`). Spanish is the complete set; English may lack keys. No new dependency (FR-013).
- **Rationale**: two languages and about ten texts. A library (react-i18next, FormatJS) would add dependencies, setup and concepts (namespaces, plurals, loaders) the project doesn't need (D-23). Flat keys are easy to search and to compare between the two collections in a test.
- **Alternatives considered**: react-i18next (2 dependencies, async init); one JSON file per language (no comments allowed; a JS module is just as easy to import in Vite and tests).

## R2. Lookup and fallback

- **Decision**: in `translations.js`, a pure `export function translate(lang, key, dict = translations)` returning `dict[lang]?.[key] ?? dict.es[key] ?? key`. English falls back to Spanish (FR-002). If a key is missing in both collections (a developer mistake) it returns the key, so the app never crashes; the key tests (R6) stop that from being merged.
- **Inserted values**: `export function interpolate(text, values)` replaces `{name}` with `values.name` (unknown names are left as they are). The hook's `t(key, values)` = `interpolate(translate(lang, key), values)`. Only `health.version` (`Versión: {version}`) uses it today. The version itself is shown unchanged (spec edge case).
- **Rationale**: pure functions can be tested with a small test dictionary, without React (user input).

## R3. Language state: React Context in `App.jsx`

- **Decision**: `frontend/src/i18n/LanguageContext.jsx` exports `LanguageProvider` and `useLanguage()` → `{ lang, setLang, t }`.
  - Initial value: `readStoredLanguage()` → `localStorage.getItem('pdm.language')` if it is exactly `'es'` or `'en'`, otherwise `'es'`; any exception → `'es'` (FR-003, FR-006).
  - `setLang(next)`: ignores anything other than `'es'`/`'en'`; updates state; `localStorage.setItem('pdm.language', next)` inside `try/catch` (a failure just means it isn't remembered).
  - `useEffect(() => { document.documentElement.lang = lang; document.title = translate(lang, 'app.title') }, [lang])` (FR-007).
  - `useLanguage()` outside the provider throws `Error('useLanguage must be used inside LanguageProvider')` (a clear developer error).
- **Where the provider is mounted**: **inside `App.jsx`** (`<LanguageProvider><AppShell><StartPage /></AppShell></LanguageProvider>`), not in `main.jsx`. TS-04's `App.test.jsx` renders `<App />`, so all seven tests keep working **unchanged** (FR-011), and every later screen rendered by `App` gets the provider.
- **No refetch on switch**: the `/health` state lives in `StartPage`. Changing the context re-renders `StartPage` but doesn't remount it, so its `useEffect(..., [])` doesn't run again (FR-005, FR-010).
- **Alternatives considered**: a module-level variable plus a custom event (more code, harder to test); passing `lang` as props (every later screen would have to thread it).

## R4. Shared page frame and the switch

- **Decision**: `frontend/src/components/AppShell.jsx` renders a `<header className="app-header">` (pinned) containing the disclaimer `<p className="disclaimer" role="note">` and the switch, then `{children}`.
  - Pinned with plain CSS: `.app-header { position: sticky; top: 0; z-index: 1; background: ...; }`. `sticky` (not `fixed`) keeps the header in the normal flow, so it never covers the content at the top of the page (spec edge case); content scrolls under it (FR-008, clarification).
  - Switch: a `<div role="group" aria-label={t('language.label')}>` with two `<button type="button">`s, text `ES` / `EN`, `aria-label` `Español` / `English`, `aria-pressed` `true` on the current one (FR-004). Native buttons are keyboard-usable.
  - No close/hide control; the banner doesn't depend on storage or the backend (FR-008).
- **Language names**: `ES`/`EN` and `Español`/`English` are the same in every language (each language named in itself, common practice), so they live in `translations.js` as `export const LANGUAGES = [{ code: 'es', short: 'ES', name: 'Español' }, { code: 'en', short: 'EN', name: 'English' }]`, not in a component (FR-001).
- **Start page**: the TS-04 page body moves from `App.jsx` to `frontend/src/StartPage.jsx` unchanged except that each text comes from `t(...)`.

## R5. `index.html`

- **Decision**: keep `<html lang="es">` and the Spanish `<title>` in `index.html` as the static value shown before the JavaScript runs; the provider's effect sets both from the selected language right after the first render. No visible text in components (FR-001) — `index.html` is not a component, and its two values match the default language.

## R6. Tests

- **Decision** (Vitest + jsdom + Testing Library, `fetch` stubbed, no network, FR-011):
  - `src/i18n/translations.test.js`: `translate` returns the English text, falls back to Spanish for a key missing in English, returns the key when missing in both (test dictionary); `interpolate`; **every English key exists in Spanish**; every Spanish value is a non-empty string; Spanish disclaimer and English disclaimer equal the exact spec texts.
  - `src/i18n/language.test.jsx` (renders `<App />`, `fetch` stubbed with an ok `/health`): Spanish default (texts, banner, `document.documentElement.lang === 'es'`, `document.title`); switch to EN and back (all texts, lang, title, `aria-pressed`); no new `fetch` call after switching (`toHaveBeenCalledTimes(1)`); switch while checking (pending `fetch`) then resolve → English result; remembered `en` in `localStorage` → starts in English; invalid stored value (`fr`) → Spanish; `localStorage.getItem`/`setItem` throwing (`vi.spyOn(Storage.prototype, ...)`) → Spanish, switching still works, no error; banner present in all four `/health` states in both languages; no button other than ES and EN (not dismissible); `useLanguage` outside the provider throws.
  - `afterEach`: `localStorage.clear()`, `vi.restoreAllMocks()`, `vi.unstubAllGlobals()`, reset `document.documentElement.lang = 'es'`.
  - TS-04's `App.test.jsx` and `api/client.test.js`: **no changes** (R3).
- **Alternatives considered**: a separate test per component (more files; the behaviour that matters is the whole page).
