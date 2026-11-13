# Implementation Plan: Language and Disclaimer

**Branch**: `005-language-disclaimer` | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-language-disclaimer/spec.md`

## Summary

TS-05 moves every visible text of the TS-04 start page into one small module, `frontend/src/i18n/translations.js` (`{ es, en }` with flat dotted keys; Spanish complete), with a pure `translate()` that falls back to Spanish and a tiny `interpolate()` for the version number. A React Context (`LanguageProvider` + `useLanguage()` → `{ lang, setLang, t }`) holds the selected language, reads and saves it in `localStorage['pdm.language']` inside `try/catch` (default and fallback `es`), and keeps `<html lang>` and the tab title in step. A shared page frame, `AppShell`, shows the pinned disclaimer banner (`position: sticky`) and the ES/EN switch around every screen. `App.jsx` becomes `<LanguageProvider><AppShell><StartPage /></AppShell></LanguageProvider>`; the TS-04 page body moves to `StartPage.jsx` with `t(...)` texts, so switching language re-renders without a new `/health` call. No new dependency and no backend change. TS-04's tests keep passing unchanged; new tests cover the translations and the language behaviour.

## Technical Context

**Language/Version**: JavaScript (ES modules) on Node.js 26 LTS (unchanged from TS-04)

**Primary Dependencies**: react 19.3.1, react-dom 19.3.1, vite 8.3.8 (existing); **no new dependency**, no i18n library (research R1)

**Storage**: browser `localStorage`, key `pdm.language`, value `es` | `en` (research R3); no database changes

**Testing**: Vitest 5.1.0 + jsdom 31.0.1 + @testing-library/react 16.3.3 (existing); `fetch` stubbed; `localStorage` cleared per test; `vi.spyOn(Storage.prototype, ...)` for blocked storage (research R6)

**Target Platform**: modern desktop browsers; developer machines on Windows

**Project Type**: web application (frontend only in this story)

**Performance Goals**: language switch updates all text in the same render, no reload or network request (FR-005); tests under 30 s (SC-005)

**Constraints**: no visible text in components (FR-001); Spanish default, no browser-language detection (FR-003); storage failures never break the page (FR-006); TS-04 `/health` behaviour unchanged (FR-010); one `/health` call per load (D-30)

**Scale/Scope**: 2 languages, 10 keys; 1 translations module, 1 context module, 1 frame component, 1 page component; 2 new test files; README section

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Check each principle of `.specify/memory/constitution.md`. Any unchecked item must be justified in Complexity Tracking.

- [x] I. Spec-driven and traceable: every file maps to an FR/AC (traceability table below); tests name the AC they verify
- [x] II. Small Scrum story: one story; four small frontend files and two test files
- [x] III. Independence: depends only on TS-04, as in docs/BACKLOG.md; changes only technical-story code (`frontend/src/App.jsx`, `App.css`)
- [x] IV. Multi-agent: **frontend-dev** writes the translations module, context, `AppShell`, `StartPage`, `App.jsx`, CSS and the README section; **qa-tester** writes `translations.test.js` and `language.test.jsx` and runs all tests; **security-reviewer** reviews storage use, rendering of texts and that nothing is sent anywhere; **orchestrator** updates PROJECT_STATUS, BACKLOG, DECISIONS (D-34) and keeps `agent-log.csv`; backend-dev and devops are not needed. The manual browser check (quickstart step 2) is done by the developer. Owners in tasks.md
- [x] V. Clinical logic: no scoring or alerts in this story
- [x] VI. Data privacy: only `es`/`en` is stored in the browser; no personal data; nothing sent to the backend or any service
- [ ] VII. Tests: translations, fallback, language state and the banner have automated tests. **Exception**: CI and the dependency check don't exist until TS-09 (Complexity Tracking, D-27)
- [x] VIII. Security baseline: texts are rendered as plain React text (no `dangerouslySetInnerHTML`); the stored value is checked against `es`/`en` before use; no secrets. The constitution's "the UI MUST state this is not a certified medical device" is delivered by the banner
- [x] IX. Deployable at low cost: static frontend only; no extra backend calls
- [x] X. Stack: React
- [x] XI. Language: code and docs in English; UI in Spanish by default with an English switch. **The TS-04 exception is resolved** by this story
- [x] XII. Simplicity: no i18n library, one flat translations object, one context, plain CSS `sticky`; no plurals, date/number formatting or browser-language detection

**Post-design re-check (after Phase 1)**: all items still pass; only the Principle VII exception remains. Mounting the provider inside `App.jsx` (research R3) keeps TS-04's tests unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/005-language-disclaimer/
├── spec.md
├── plan.md                  # This file
├── research.md              # Phase 0
├── data-model.md            # Phase 1: text collections, selected language, banner
├── quickstart.md            # Phase 1: tests + manual browser check
├── contracts/
│   └── i18n.md              # Phase 1: module exports, keys and texts (es/en), page frame
├── checklists/
│   └── requirements.md
└── tasks.md                 # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
frontend/
├── index.html                       # unchanged: lang="es" and Spanish <title> as the pre-JS default (research R5)
├── README.md                        # CHANGED: "How to add or change texts" section; start-page section mentions ES/EN and the banner
└── src/
    ├── App.jsx                      # CHANGED: <LanguageProvider><AppShell><StartPage /></AppShell></LanguageProvider>
    ├── App.css                      # CHANGED: .app-header (sticky), .disclaimer, .language-switch, [aria-pressed="true"] style
    ├── StartPage.jsx                # NEW: TS-04 page body moved from App.jsx; every text via t(...)
    ├── App.test.jsx                 # unchanged (TS-04)
    ├── api/                         # unchanged (TS-04)
    ├── components/
    │   └── AppShell.jsx             # NEW: pinned header with disclaimer + ES/EN switch, then children
    └── i18n/
        ├── translations.js          # NEW: translations {es, en}, LANGUAGES, DEFAULT_LANGUAGE, translate, interpolate
        ├── translations.test.js     # NEW: fallback, interpolate, key sets, exact disclaimer texts
        ├── LanguageContext.jsx      # NEW: LanguageProvider, useLanguage
        └── language.test.jsx        # NEW: AC2–AC7 through <App /> with fetch stubbed

docs/PROJECT_STATUS.md               # CHANGED: TS-05 done
docs/BACKLOG.md                      # CHANGED: TS-05 spec link and status
docs/DECISIONS.md                    # CHANGED: D-34 (own translations module, Context, localStorage key, sticky banner)
```

**Structure Decision**: frontend only, inside TS-04's layout. `i18n/` holds everything about languages so later screens import from one place; `components/` starts with the shared frame; screens (today `StartPage`) sit in `src/` until there are enough to need a folder (D-23).

### Design notes

- **translations.js**: plain objects exactly as [contracts/i18n.md](contracts/i18n.md); `translate` and `interpolate` are pure (research R2).
- **LanguageContext.jsx**: `createContext(null)`; `useState(readStoredLanguage)` (lazy initial value); `setLang` wraps `setState` + guarded `localStorage.setItem`; one `useEffect` for `lang`/`title`; `t` built with `useCallback` on `lang` (research R3).
- **AppShell.jsx**: buttons rendered from `LANGUAGES`; `onClick={() => setLang(code)}`; `aria-pressed={lang === code}` (research R4).
- **StartPage.jsx**: same state machine as TS-04 (`checking` / `ok` / `databaseUnavailable` / `unreachable`), same single `getHealth()` call; `t('health.version', { version })`.
- **CSS**: `.app-header { position: sticky; top: 0; z-index: 1; background: #fff8e1; border-bottom: 1px solid #e0c97f; display: flex; gap: 1rem; align-items: center; justify-content: space-between; padding: 0.5rem 1rem; }` (or similar plain values); `.language-switch button[aria-pressed="true"] { font-weight: bold; text-decoration: underline; }`.

### Traceability

| Requirement / AC | Delivered by |
|---|---|
| FR-001, AC1, SC-003 | `translations.js`; `StartPage.jsx`, `AppShell.jsx` use `t(...)` / `LANGUAGES`; grep check in tasks |
| FR-002, AC7 | `translate()` fallback; `translations.test.js` (test dictionary, English ⊆ Spanish keys) |
| FR-003, AC2 | `readStoredLanguage()` default `es`; `language.test.jsx` default test |
| FR-004 | `AppShell` buttons with `aria-label`, `aria-pressed`, group label; `language.test.jsx` |
| FR-005, AC3, SC-001 | Context re-render, `StartPage` not remounted; `language.test.jsx` switch + `fetch` called once + switch while checking |
| FR-006, AC4, SC-004 | guarded `localStorage` read/write; `language.test.jsx` remembered / invalid / throwing storage |
| FR-007, AC5 | provider effect; `language.test.jsx` lang and title |
| FR-008, FR-009, AC6, SC-002 | `AppShell` banner, sticky CSS, mounted in `App.jsx`; `language.test.jsx` banner in all states and both languages, no other buttons; quickstart 2.5–2.6 |
| FR-010 | `StartPage.jsx` keeps TS-04 logic; TS-04 `App.test.jsx` unchanged and passing |
| FR-011, AC8, SC-005 | `translations.test.js`, `language.test.jsx`, TS-04 tests; quickstart 1 |
| FR-012, AC9, SC-006 | `frontend/README.md` section; `docs/PROJECT_STATUS.md` |
| FR-013 | no new dependency in `package.json`; nothing sent anywhere (security review) |
| Edge cases (blocked storage, unknown value, switch while checking, same language, key missing in both, inserted value, long page) | research R2–R4; `language.test.jsx`; quickstart 2.5 |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle VII and Workflow step 5 require tests and a dependency check to run in CI before merge, but CI doesn't exist until TS-09 | TS-01 to TS-08 must be merged before the CI pipeline story | Same as TS-01 to TS-04: until TS-09 is merged, the PR includes the local `npm test` output and the manual browser check; the dependency check is done by TS-09 (DECISIONS D-27) |
