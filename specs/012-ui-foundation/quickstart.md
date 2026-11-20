# Quickstart: validate the UI foundation (TS-12)

Run from the repository root. Expected results are for the finished story.

## 1. Automated checks

```text
cd frontend
npm ci
npm test
npm run build
```

Expected: every test passes (the existing TS-04, TS-05 and TS-06 tests, plus the new ones), `dist/` is built, and `git diff frontend/package.json frontend/package-lock.json` shows no change.

The new tests map to the spec like this:

| Test file | Covers |
|---|---|
| `styles/tokens.test.js` | AC1 |
| `styles/noRawColors.test.js` | AC2, FR-014 |
| `styles/contrast.test.js` | AC10, FR-013, AC3 (focus) and the static 44px rule |
| `utils/monitoringStatus.test.js` | AC9, AC6 (helper side) |
| `components/StatusBadge.test.jsx` | AC5, AC6, AC12 |
| `components/TriageLevelBadge.test.jsx` | AC7, AC12 |
| `components/Card.test.jsx`, `Button.test.jsx` | AC8 |
| existing `App.test.jsx`, `auth/auth.test.jsx` | AC4, SC-007 |

## 2. Prove the guards can fail

Do this once, locally, and do not commit it.

1. Add `color: #ff0000;` to `src/components/Card.module.css` and run `npm test`: `noRawColors.test.js` must fail and name the file and line. Revert.
2. Change `--color-text` in `tokens.css` to `#94A3B8` and run `npm test`: `contrast.test.js` must fail and name the pairs. Revert.
3. Change `--color-stable` to `#00FF00`: `tokens.test.js` must fail. Revert.

## 3. Structure

`ls frontend/src` shows `pages/`, `hooks/`, `utils/`, `styles/` next to `api/`, `auth/`, `i18n/`, `components/`, `testing/`. `StartPage.jsx` and `LoginPage.jsx` are no longer in `src/` itself; `git log --follow` on each shows the history from before the move. `App.css` no longer exists.

## 4. Manual pass in the browser (recorded in the PR)

1. Start the backend as in `backend/README.md`, then `npm run dev` and open `http://localhost:5173`.
2. **Signed out** (login page): the form, the ES/EN switch and the banner look consistent. Press Tab through the page: every element shows the blue focus ring.
3. Submit wrong credentials: the error appears as a pink box with an icon and dark text. Switch to EN: the message changes language.
4. **Signed in**: the start page, the sign-out button and the banner still work. Reload and switch language as before (SC-007).
5. **Target size** (SC-004): in the browser's inspector, select each button and each input on both pages; each is at least 44px high, and buttons at least 44px wide.
6. **Text zoom 200%**: nothing is cut off, the banner still stays pinned.
7. **Status badges and triage badge**: they are not shown on a page yet (no story uses them). Check them with a temporary line in `StartPage.jsx` that is not committed:
   ```jsx
   {['stable','warning','critical','no_data','x'].map((s) => <StatusBadge key={s} monitoringStatus={s} />)}
   <TriageLevelBadge level={1} /> <TriageLevelBadge level="3" />
   ```
   Expected: four different icons and labels, `x` looks like `no_data`, "Triage I" and "Sin nivel". Then turn on grayscale (browser dev tools, Rendering, "Emulate vision deficiencies: achromatopsia") and confirm the four statuses are still told apart by icon and label (SC-003). Remove the temporary line.
8. **Forced colors**: Rendering, "Emulate CSS media feature forced-colors: active": badges keep border, icon and label.

Record in the PR: the grayscale screenshot, the keyboard pass result and the size check.

## 5. Docs

`frontend/README.md` explains the structure, the token rule and each component with an example. `docs/GLOSSARY.md` has "monitoring status" and the triage level display. `docs/DECISIONS.md` has D-42. `docs/PROJECT_STATUS.md` and `docs/BACKLOG.md` show TS-12 as done.
