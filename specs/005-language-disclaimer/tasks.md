---

description: "Task list for TS-05 language and disclaimer"
---

# Tasks: Language and Disclaimer

**Input**: Design documents from `specs/005-language-disclaimer/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/i18n.md](contracts/i18n.md), [quickstart.md](quickstart.md)

**Tests**: MANDATORY. The spec requires automated tests for AC2–AC7 (FR-011), and the disclaimer is the UI notice the constitution requires. AC1 is checked by a search (SC-003); AC9 by review; the pinned banner while scrolling by the manual browser check (jsdom has no layout).

**Organization**: This feature has one story (TS-05), so all story tasks carry the `[TS-05]` label.

## Format: `[ID] [P?] [Story] Description (agent)`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **(agent)**: Owner agent, at the end of the line
- All paths are relative to the repository root; frontend commands run from `frontend/`
- Edit files with Edit/Write, not PowerShell (non-ASCII Spanish text, CLAUDE.md)
- **No agent may print, read aloud or copy the contents of `backend/.env` or the value of `DATABASE_URL`.** This story doesn't need the backend except for the manual check.

---

## Phase 1: Setup

None. TS-04 (merged) provides `frontend/` with Vite, React, Vitest, jsdom and Testing Library. **No new dependency** (FR-013): `package.json` and `package-lock.json` must not change.

---

## Phase 2: Foundational

None.

---

## Phase 3: TS-05 Language and disclaimer 🎯 MVP

**Goal**: every visible text comes from `translations.js`; Spanish by default; an ES/EN switch changes all text at once without reload or a new `/health` call; the choice is remembered when storage works; `<html lang>` and the tab title follow it; a pinned disclaimer banner is on every page in the selected language.

**Independent Test**: `npm test` in `frontend/` passes with no backend and no network (new tests plus unchanged TS-04 tests); quickstart step 2 passes in a browser.

### Implementation

- [ ] T001 [P] [TS-05] Create `frontend/src/i18n/translations.js` (top comment: "All UI texts (TS-05). Spanish (es) is the complete reference; a key missing in English shows the Spanish text. Add every new text here in both languages; see frontend/README.md.") exactly as [contracts/i18n.md](contracts/i18n.md):
  - `export const DEFAULT_LANGUAGE = 'es'`;
  - `export const LANGUAGES = [{ code: 'es', short: 'ES', name: 'Español' }, { code: 'en', short: 'EN', name: 'English' }]`;
  - `export const translations = { es: {...}, en: {...} }` with exactly these ten keys and texts in both: `app.title` (`Monitor de Deterioro del Paciente` / `Patient Deterioration Monitor`), `disclaimer.text` (`Prototipo académico: no es un dispositivo médico certificado.` / `Academic prototype: not a certified medical device.`), `language.label` (`Idioma` / `Language`), `health.checking` (`Comprobando la conexión con el servidor…` / `Checking the connection to the server…`), `health.apiOk` (`API: funcionando` / `API: running`), `health.version` (`Versión: {version}` / `Version: {version}`), `health.databaseOk` (`Base de datos: disponible` / `Database: available`), `health.databaseUnavailable` (`Base de datos: no disponible` / `Database: not available`), `health.unreachable` (`No se puede conectar con el servidor.` / `Cannot connect to the server.`), `health.reloadHint` (`Recarga la página para volver a comprobar.` / `Reload the page to check again.`). Use the real `…` character (U+2026) as in TS-04;
  - `export function translate(lang, key, dict = translations)` → `dict[lang]?.[key] ?? dict.es[key] ?? key`;
  - `export function interpolate(text, values)` → if `values` is falsy return `text`; otherwise `text.replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match))`.

  (FR-001, FR-002, research R1, R2) (frontend-dev)
- [ ] T002 [TS-05] Create `frontend/src/i18n/LanguageContext.jsx`, depends on T001 (research R3): `const STORAGE_KEY = 'pdm.language'`; `function readStoredLanguage()` → inside `try`, `const value = window.localStorage.getItem(STORAGE_KEY)`; return it if it is exactly `'es'` or `'en'`; otherwise, or on any exception, return `DEFAULT_LANGUAGE`. `const LanguageContext = createContext(null)`. `export function LanguageProvider({ children })`: `const [lang, setLangState] = useState(readStoredLanguage)`; `const setLang = useCallback((next) => { if (next !== 'es' && next !== 'en') return; setLangState(next); try { window.localStorage.setItem(STORAGE_KEY, next) } catch { /* not remembered; works for this visit */ } }, [])`; `useEffect(() => { document.documentElement.lang = lang; document.title = translate(lang, 'app.title') }, [lang])`; `const t = useCallback((key, values) => interpolate(translate(lang, key), values), [lang])`; provide `useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])`. `export function useLanguage()` → reads the context; if `null`, `throw new Error('useLanguage must be used inside LanguageProvider')`. No visible text in this file (FR-003, FR-005–FR-007) (frontend-dev)
- [ ] T003 [TS-05] Create `frontend/src/components/AppShell.jsx`, depends on T001, T002 (research R4, [contracts/i18n.md](contracts/i18n.md) "Page frame"): `export default function AppShell({ children })` using `useLanguage()`; renders `<header className="app-header">` containing `<p className="disclaimer" role="note">{t('disclaimer.text')}</p>` and `<div className="language-switch" role="group" aria-label={t('language.label')}>` with one `<button type="button">` per entry of `LANGUAGES`: text `short`, `aria-label={name}`, `aria-pressed={lang === code}`, `onClick={() => setLang(code)}`; then `{children}`. No close/hide control, no other buttons, no visible text written directly (FR-004, FR-008, FR-009) (frontend-dev)
- [ ] T004 [TS-05] Create `frontend/src/StartPage.jsx` by moving the body of the current `frontend/src/App.jsx` (the `useState` / single `getHealth()` `useEffect` with the `cancelled` flag, and the `<main>` markup), depends on T002: same four states and the same markup structure (`<main>`, `<h1>`, `<section role="status">`, one `<p>` per text), with every text from `useLanguage().t`: `<h1>{t('app.title')}</h1>`; checking → `t('health.checking')`; ok → `t('health.apiOk')`, `t('health.version', { version: state.version })`, `t('health.databaseOk')`; databaseUnavailable → `t('health.apiOk')`, `t('health.version', { version: state.version })`, `t('health.databaseUnavailable')`, `t('health.reloadHint')`; unreachable → `t('health.unreachable')`, `t('health.reloadHint')`. Don't change the `/health` logic: `t` must **not** be in the effect's dependency list (the effect stays `[]`, so switching language never calls the backend again) (FR-005, FR-010) (frontend-dev)
- [ ] T005 [TS-05] Replace `frontend/src/App.jsx`, depends on T002–T004: top comment "App root (TS-05): language provider + shared page frame (disclaimer, ES/EN switch) around the current screen."; `import './App.css'`; `export default function App()` returning `<LanguageProvider><AppShell><StartPage /></AppShell></LanguageProvider>`. Keep the default export name `App` so `main.jsx` and TS-04's `App.test.jsx` need no change (research R3) (frontend-dev)
- [ ] T006 [P] [TS-05] Edit `frontend/src/App.css` (keep the existing `body` and `main` rules): add `.app-header { position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: center; justify-content: space-between; padding: 0.5rem 1rem; background: #fff4cc; border-bottom: 1px solid #d9b84a; }`, `.disclaimer { margin: 0; font-weight: 600; }`, `.language-switch { display: flex; gap: 0.25rem; }`, `.language-switch button { font: inherit; padding: 0.25rem 0.6rem; cursor: pointer; }`, `.language-switch button[aria-pressed="true"] { font-weight: 700; text-decoration: underline; }`. Use `sticky`, not `fixed`, so the header never covers the page content at the top (FR-008, clarification) (frontend-dev)
- [ ] T007 [P] [TS-05] Edit `frontend/README.md`: replace the "What the start page shows" table's texts note with a sentence that the page is in Spanish by default with an **ES / EN** switch at the top, next to the pinned disclaimer banner, and that texts per state are listed in `src/i18n/translations.js`; add a section `## How to add or change texts` after "API client": all visible texts live in `src/i18n/translations.js`, one entry per key in `es` (complete reference) and `en`; to add a text, add the same key to both, then in a component `const { t } = useLanguage()` (from `src/i18n/LanguageContext.jsx`) and `{t('area.name')}`; inserted values use `{name}` in the text and `t('area.name', { name })`; a key missing in English shows the Spanish text, and a test fails if English has a key Spanish doesn't; never write visible text directly in a component; new screens are rendered inside `AppShell` (in `App.jsx`) so they get the banner and switch; the choice is remembered in the browser under `localStorage` key `pdm.language` (`es`/`en`), Spanish when nothing valid is stored; to reset it, `localStorage.removeItem('pdm.language')` in the browser console (FR-012, AC9, SC-006) (frontend-dev)

### Tests and review

- [ ] T008 [P] [TS-05] Create `frontend/src/i18n/translations.test.js` (top comment citing TS-05 AC1, AC7, FR-001, FR-002 and [contracts/i18n.md](contracts/i18n.md)), depends on T001; test names cite the AC:
  - `AC7 translate returns the English text when present`, `AC7 translate falls back to Spanish when English lacks the key`, `edge case: translate returns the key when missing in both`, all with a test dictionary `{ es: { 'a.one': 'Uno', 'a.two': 'Dos' }, en: { 'a.one': 'One' } }`;
  - `translate uses the real translations by default`: `translate('en', 'health.apiOk') === 'API: running'`;
  - `interpolate replaces {name} and leaves unknown names`: `interpolate('Versión: {version}', { version: '0.1.0' }) === 'Versión: 0.1.0'`; `interpolate('x {y}', {}) === 'x {y}'`; `interpolate('x', undefined) === 'x'`;
  - `FR-002 every English key exists in Spanish`; `FR-001 every Spanish text is a non-empty string`; `TS-04 keys are all present`: the ten keys of [contracts/i18n.md](contracts/i18n.md) exist in both `es` and `en`;
  - `AC6 disclaimer texts are exactly as specified`: `translations.es['disclaimer.text'] === 'Prototipo académico: no es un dispositivo médico certificado.'` and `translations.en['disclaimer.text'] === 'Academic prototype: not a certified medical device.'`;
  - `LANGUAGES lists es and en` and `DEFAULT_LANGUAGE is es`.

  (qa-tester)
- [ ] T009 [P] [TS-05] Create `frontend/src/i18n/language.test.jsx` (top comment citing TS-05 AC2–AC7, FR-003–FR-009, FR-011), depends on T001–T006. Render `<App />` from `../App.jsx`; `fetch` stubbed with `vi.stubGlobal` (synthetic responses only; helper `jsonResponse` as in TS-04's `App.test.jsx`); `beforeEach(() => localStorage.clear())`; `afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.documentElement.lang = 'es' })`. Buttons found with `screen.getByRole('button', { name: 'English' })` / `{ name: 'Español' }`. Tests:
  - `AC2 Spanish by default`: ok `/health`; after `findByText('API: funcionando')`: Spanish banner text, `Monitor de Deterioro del Paciente`, `document.documentElement.lang === 'es'`, `document.title === 'Monitor de Deterioro del Paciente'`, ES button `aria-pressed="true"`, EN `"false"`;
  - `AC3 AC5 switch to English and back without reload or new backend call`: ok `/health`; wait for the Spanish result; click EN → `Academic prototype: not a certified medical device.`, `Patient Deterioration Monitor`, `API: running`, `Version: 0.1.0`, `Database: available` shown, Spanish texts gone, `lang === 'en'`, title English, EN `aria-pressed="true"`; click ES → Spanish again, `lang === 'es'`; `fetch` called exactly once in total;
  - `edge case: switch while checking`: `fetch` returns a promise resolved manually later; click EN while `Checking the connection to the server…` is shown; resolve with an ok body → `API: running`; `fetch` called once;
  - `AC4 remembered English starts in English`: `localStorage.setItem('pdm.language', 'en')` before render → English texts, `lang === 'en'`;
  - `AC4 switching saves the choice`: click EN → `localStorage.getItem('pdm.language') === 'en'`;
  - `AC4 unknown stored value falls back to Spanish`: stored `'fr'` → Spanish;
  - `AC4 blocked storage still works`: `vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })` and the same for `setItem`; render → Spanish, no error thrown; click EN → English shown;
  - `AC6 banner shown in every state and both languages`: parametrize over the four `/health` outcomes (ok, `database: 'unavailable'`, `fetch` rejects, status 500) → the Spanish banner is present; click EN → the English banner is present;
  - `AC6 banner cannot be dismissed`: `screen.getAllByRole('button')` has exactly two buttons, named `Español` and `English`;
  - `FR-004 switch is a labelled group`: `getByRole('group', { name: 'Idioma' })`; after EN, `getByRole('group', { name: 'Language' })`;
  - `developer error: useLanguage outside the provider throws`: render a tiny component calling `useLanguage()` without the provider inside `expect(() => render(...)).toThrow('useLanguage must be used inside LanguageProvider')` (silence `console.error` with `vi.spyOn(console, 'error').mockImplementation(() => {})`).

  (qa-tester)
- [ ] T010 [TS-05] Run the checks, depends on T001–T009: in `frontend/` run `npm test` (all pass, including TS-04's `App.test.jsx` and `api/client.test.js` **unchanged**, under 30 s, SC-005) and `npm run build` (no errors); keep both outputs for the PR (D-27). Confirm `git diff --stat main -- frontend/package.json frontend/package-lock.json frontend/src/App.test.jsx frontend/src/api` is empty (no new dependency, TS-04 tests untouched; FR-013, FR-011). Search `frontend/src` (excluding `i18n/translations.js` and `*.test.*`) with Grep for visible texts: the regexes `>[^<{}\s][^<{}]*<` in `.jsx` files and the Spanish/English words `Monitor|Comprobando|Checking|funcionando|running|Base de datos|Database|servidor|server|Prototipo|prototype|Recarga|Reload|Idioma|Language` → no matches (AC1, SC-003); if a match is not visible text (e.g. a comment), note why. Fix T001–T009 if a check fails (AC8) (qa-tester)
- [ ] T011 [TS-05] Review read-only `frontend/src/i18n/translations.js`, `frontend/src/i18n/LanguageContext.jsx`, `frontend/src/components/AppShell.jsx`, `frontend/src/StartPage.jsx`, `frontend/src/App.jsx`, the two new tests and `frontend/README.md`: texts rendered as React text only (no `dangerouslySetInnerHTML`, no HTML in translations); the stored value is used only after checking it is exactly `es` or `en`; every `localStorage` access is inside `try/catch`; nothing about the language is sent to the backend or any external service; no new dependency; the disclaimer has no close/hide control and doesn't depend on storage or the backend; `/health` is still called once per load. Report findings; don't change code (Principles VI, VIII) (security-reviewer)
- [ ] T012 [TS-05] Manual browser check per [quickstart.md](quickstart.md) step 2 (items 1–7), after T010: needs a human with a browser. If the agent can't open a browser, report the steps as **pending for the user** (with the exact commands), don't mark them done. If done: record one line per item (default Spanish in a private window, switch to English with one `/health` request, reload remembers English, back to Spanish, banner pinned while scrolling and not covering the title, no close control, backend off in both languages) (AC2–AC6, SC-001, SC-002) (orchestrator)

**Checkpoint**: TS-05 is complete. TS-06 (login page) and the functional stories render their screens inside `AppShell` and add their texts to `translations.js`.

---

## Phase 4: Polish

- [ ] T013 Edit `docs/PROJECT_STATUS.md`: set "Last updated" to the current date; in step 11's notes mark TS-05 ✅ and set "Next: TS-06 (authentication)"; set "Next step" accordingly; rewrite the "Where we left off" note: TS-05 is done (texts in `frontend/src/i18n/translations.js`, ES/EN switch remembered in `localStorage['pdm.language']`, pinned disclaimer banner in `AppShell`), the local `npm test` result, the manual browser check result (or that it is pending for the user, if T012 reported so), and that teammates need no new install. In `docs/BACKLOG.md`, link this feature in TS-05's Spec column; set Status ✅ only when the PR is merged. In `docs/DECISIONS.md`, add entry **D-34** after D-33 (date of the change, Status "Active"): decision — UI texts in **our own small module** `frontend/src/i18n/translations.js` (`{ es, en }`, flat dotted keys, Spanish complete, English falls back to Spanish via a pure `translate()`), language held in a **React Context** (`LanguageProvider` mounted in `App.jsx`, `useLanguage()` → `{ lang, setLang, t }`), remembered in `localStorage['pdm.language']` (`es`/`en` only, guarded with `try/catch`, Spanish otherwise), `<html lang>` and tab title follow the language; the disclaimer banner and ES/EN switch live in one pinned (`position: sticky`) frame `AppShell` around every screen; reason — two languages and ten texts don't need a library (D-23), no new dependency, every later screen gets the banner and switch for free, constitution Principle XI and the "not a certified medical device" notice; rejected — react-i18next / FormatJS, browser-language detection, a dismissible or non-pinned banner (orchestrator)

---

## Dependencies & Execution Order

- **T001** (translations): no dependencies.
- **T002**: depends on T001. **T003, T004**: depend on T001, T002 (can run in parallel: different files). **T005**: depends on T002–T004.
- **T006, T007**: depend only on the plan; can run in parallel with T001–T005.
- **T008**: depends on T001. **T009**: depends on T001–T006. They can run in parallel with each other.
- **T010**: depends on T001–T009. **T011**: depends on T010. **T012**: depends on T010 (human browser check).
- **T013**: last; depends on T011, T012.
- **Story dependencies**: TS-04 only (merged), per docs/BACKLOG.md.

## Parallel Example

```text
# Round 1 (frontend-dev):
Task: "Create frontend/src/i18n/translations.js (T001)"
Task: "Add header/disclaimer/switch styles to frontend/src/App.css (T006)"
Task: "Add 'How to add or change texts' to frontend/README.md (T007)"

# Round 2 (frontend-dev), after T002:
Task: "Create frontend/src/components/AppShell.jsx (T003)"
Task: "Create frontend/src/StartPage.jsx (T004)"

# Round 3 (qa-tester), after T005:
Task: "Create frontend/src/i18n/translations.test.js (T008)"
Task: "Create frontend/src/i18n/language.test.jsx (T009)"
```

## Implementation Strategy

TS-05 is the whole MVP: T001/T006/T007 → T002 → T003/T004 → T005 → T008/T009 → T010 → T011 → T012 → T013. After T013, commit (`TS-05: language switch and disclaimer banner`), push and open the PR. Until TS-09 adds CI, paste the local `npm test` output and the manual browser check result (quickstart step 2) into the PR description (DECISIONS D-27). The PR includes the agent activity log (`specs/005-language-disclaimer/agent-log.csv`, via `scripts/log-agent.ps1`).

## Notes

- The orchestrator assigns each task to its agent and logs `assigned` / `started` / `done` rows (see `docs/agents.md`).
- Testing runs after implementation, as the project template orders it (qa-tester, then security-reviewer). It doesn't use test-first order.
- Do not add anything not listed here (Principle XII): no i18n library, router, state library, browser-language detection, plural/date/number formatting, more languages, dismissible banner, backend change, or changes to TS-04's tests or `api/client.js`.
