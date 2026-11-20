# Quickstart & Validation: Icon Library (TS-14)

How to validate TS-14 end to end. All checks run in `frontend/` with no backend and no network.

## Prerequisites

- Node.js 26 and npm (per D-33 / CI).
- Branch `014-icon-library` checked out.

## Setup

```bash
cd frontend
# lucide-react 1.77.0 is added to package.json (exact pin); install updates the lockfile
npm install
```

Expected: `lucide-react@1.77.0` appears in `package.json` `dependencies` and in
`package-lock.json`, and it is the only new runtime dependency (FR-001, AC1).

## Automated validation

```bash
cd frontend
npm test                         # Vitest: all existing tests pass; count does not drop
npm run build                    # Vite production build succeeds
npm audit --audit-level=high     # no high/critical advisory
```

Expected outcomes:

- **`npm test`** — every previously passing test still passes, in particular:
  - `components/StatusBadge.test.jsx`: each status renders exactly one `aria-hidden="true"` svg; the
    four statuses use four distinct icons; Spanish/English labels unchanged; `no_data` fallback works
    (AC3).
  - `pages/login/*.test.jsx`: the error alert contains exactly one `aria-hidden="true"` svg; text
    unchanged (AC4).
  - `styles/noRawColors.test.js`: no raw color under `src/` — `Icons.jsx` uses only `currentColor`
    (AC6).
  - `styles/contrast.test.js`: still green (AC7).
- **`npm run build`** — completes with no error (AC7, FR-008).
- **`npm audit --audit-level=high`** — reports no high or critical vulnerability (FR-008). If one
  appears, resolve it the D-38 way (upgrade in the compatible line or an `overrides` entry with a
  reason and a DECISIONS note).

## Manual spot check (optional)

```bash
cd frontend
npm run dev
```

- Sign in and open the patient list; the status badges show the four icons (check, triangle, octagon,
  dashed circle), each the same dark text color as its label, scaled with the text.
- On the login page, trigger the error alert; its icon is the octagon-x, decorative and dark.
- Confirm nothing looks mis-sized compared to before (icons stay at `1.25em`).

## Code & contract verification

- `frontend/src/components/Icons.jsx` imports the four icons from `lucide-react` and re-exports
  `CheckCircleIcon`, `TriangleAlertIcon`, `OctagonXIcon`, `CircleDashIcon`; the hand-drawn SVGs are
  gone (AC2, FR-002). See [contracts/icons.md](contracts/icons.md).
- `git diff` shows no change to the import lines of `StatusBadge.jsx`, `AppShell.jsx` and
  `pages/login/LoginPage.jsx` (FR-003).

## Docs & agents verification

- `.kiro/agents/frontend-dev.md` and `.claude/agents/frontend-dev.md` both state icons come from
  `lucide-react` and that hand-drawn SVGs are not added, keep the accessibility rules, and are in
  sync (AC8, FR-010):

  ```bash
  diff <(sed -n '/lucide/Ip' .kiro/agents/frontend-dev.md) \
       <(sed -n '/lucide/Ip' .claude/agents/frontend-dev.md)   # no differences in the icon rule
  ```

- `docs/DECISIONS.md` has D-46 adopting `lucide-react` 1.77.0 and amending the "no icon library" part
  of D-43; D-43 is annotated "superseded in part by D-46" (AC9, FR-011).
- `docs/BACKLOG.md` and `docs/PROJECT_STATUS.md` show TS-14 as done (AC10, FR-012).

## Backend

- No backend file changes (FR-009); backend tests are unaffected.
