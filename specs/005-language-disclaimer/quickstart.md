# Quickstart: Language and Disclaimer (TS-05)

Validation guide for the story. Windows PowerShell. Texts and behaviour: [contracts/i18n.md](contracts/i18n.md). Language state: [data-model.md](data-model.md).

Prerequisites: TS-04 set up (`frontend/` installed with `npm install`; backend as in `backend/README.md`). No new packages.

## 1. Automated tests (no backend, no network) — AC8, SC-005

```powershell
cd frontend
npm test
npm run build
```

Expected: all tests pass in under 30 s, including `src/i18n/translations.test.js`, `src/i18n/language.test.jsx` and the unchanged TS-04 tests (`src/App.test.jsx`, `src/api/client.test.js`); the build has no errors.

## 2. Manual browser check — AC2–AC6, SC-001, SC-002

Start the backend and the frontend as in TS-04 ([TS-04 quickstart](../004-react-app-skeleton/quickstart.md) step 3): terminal 1 `python -m uvicorn app.main:app --reload --port 8000` from `backend/` with the venv active; terminal 2 `npm run dev` from `frontend/`.

1. **Default Spanish**: open a **private/incognito window** (nothing remembered) at <http://localhost:5173>. Expected: banner `Prototipo académico: no es un dispositivo médico certificado.`, title and status in Spanish, tab title `Monitor de Deterioro del Paciente`, **ES** marked. In the developer tools (F12) → Console, `document.documentElement.lang` prints `'es'`.
2. **Switch to English**: click **EN**. Expected: immediately (no reload) banner `Academic prototype: not a certified medical device.`, `Patient Deterioration Monitor`, `API: running`, `Version: 0.1.0`, `Database: available` (or `not available`); tab title in English; `document.documentElement.lang` is `'en'`. In the **Network** tab there is still only **one** `/health` request.
3. **Remembered**: reload the page. Expected: it starts in English. (In a private window this lasts only while the window is open.)
4. **Back to Spanish**: click **ES**. Expected: everything back in Spanish, no reload.
5. **Pinned banner**: make the window short (or zoom to 300%) so the page scrolls, then scroll down. Expected: the banner and switch stay at the top of the screen; at the top of the page they don't cover the title.
6. **Not dismissible**: there is no close button or other control on the banner.
7. **Keyboard**: click in the page, press **Tab** until **EN** is focused and press **Enter**. Expected: the language changes to English (then Tab to **ES** + Enter changes it back).
8. **Backend off**: stop the backend (Ctrl+C), reload, switch languages. Expected: `No se puede conectar con el servidor.` / `Cannot connect to the server.` with the banner in each language.

Record steps 1–8 in the PR (one line each), plus the `npm test` output (D-27).

To forget the remembered choice in a normal window: F12 → Console → `localStorage.removeItem('pdm.language')`, then reload.
