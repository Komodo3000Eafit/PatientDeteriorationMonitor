---

description: "Task list for TS-14 icon library"
---

# Tasks: Icon Library

**Input**: Design documents from `specs/014-icon-library/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/icons.md](contracts/icons.md), [quickstart.md](quickstart.md)

**Tests**: No new test is required. This story changes no clinical critical path; the existing tests are the acceptance check (spec FR-007: StatusBadge "exactly one aria-hidden svg" and "four distinct icons", LoginPage alert, `noRawColors`, `contrast` must all keep passing and the count must not drop). One optional belt-and-braces unit test for the wrappers is listed as T006 and only raises the count. Per the project template, tests are run/added by qa-tester after the implementation.

**Organization**: This feature has one story (TS-14), so all story tasks carry the `[TS-14]` label.

## Format: `[ID] [P?] [Story] Description (agent)`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks).
- **(agent)**: Owner agent at the end of the line: frontend-dev, qa-tester, security-reviewer or orchestrator.
- All paths are relative to the repository root. Frontend commands run from `frontend/`.
- Edit files with the file tools, not PowerShell (non-ASCII text; AGENTS.md). Keep files UTF-8.
- **Only these paths change**: `frontend/src/components/Icons.jsx`, `frontend/package.json`, `frontend/package-lock.json` (only for `lucide-react`), `.kiro/agents/frontend-dev.md`, `.claude/agents/frontend-dev.md`, `docs/DECISIONS.md`, `docs/BACKLOG.md`, `docs/PROJECT_STATUS.md` and this story's `agent-log.csv`. Do not touch `backend/`, `.github/`, `.specify/` or any other `frontend/src/**` file (FR-009, FR-003).
- Agents log each step with `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/log-agent.ps1 -Agent <agent> -Task <Txxx> -Action <action> -Details "<text>"` (`pwsh` on macOS).
- Rules for every frontend task: import icons only from `lucide-react`; no raw color, no inline `style`, only `currentColor` for the icon; never commit a failing `npm test`; do not change any call-site import line (`StatusBadge.jsx`, `AppShell.jsx`, `pages/login/LoginPage.jsx`).

---

## Phase 1: Setup

- [X] T001 [TS-14] Baseline before any change: in `frontend/` run `npm ci`, `npm test` and `npm run build`. Record the passing test count (spec states 221) and that the build succeeds; note the numbers for the PR description. Do not edit files (AC7) (qa-tester)
- [X] T002 [TS-14] Add the dependency: in `frontend/` run `npm install lucide-react@1.77.0 --save-exact`. Check that `frontend/package.json` `dependencies` lists exactly `react`, `react-dom`, `react-router` and the new `lucide-react` pinned to `1.77.0` (no caret), and that `package-lock.json` changed. Run `npm audit --audit-level=high`: it must pass; if `1.77.0` is flagged, resolve it the D-38 way (nearest clean version in the React-19-compatible line, or an `overrides` entry with a reason) and tell the orchestrator so D-46 records the final version (research R1, R5). Run `npm test` and `npm run build`: both still pass with the dependency installed but not yet used. Depends on T001 (AC1, FR-001) (frontend-dev)

---

## Phase 2: Foundational

None. TS-12 (`Icons.jsx`, `StatusBadge`, tokens, the `noRawColors` and `contrast` guards) and the TS-05/TS-06 call sites (`AppShell`, `LoginPage`) are merged and reused unchanged.

---

## Phase 3: TS-14 Icon library 🎯 MVP

**Goal**: `lucide-react` is the single icon source; the four hand-drawn status icons are replaced by lucide wrappers under the same export names, so `StatusBadge`, `AppShell` and `LoginPage` and every existing test keep working unchanged.

**Independent Test**: `npm test`, `npm run build` and `npm audit --audit-level=high` pass in `frontend/`; the StatusBadge tests (one `aria-hidden` svg per badge, four distinct icons, unchanged labels, `no_data` fallback), the LoginPage alert test (one `aria-hidden` svg), `noRawColors.test.js` and `contrast.test.js` all pass; the passing count does not drop; `git diff` shows no change to any call-site import line.

### Implementation

- [X] T003 [TS-14] Rewrite `frontend/src/components/Icons.jsx` as lucide wrappers (plan "Key design points" 2–5, [contracts/icons.md](contracts/icons.md), research R2–R3): import `{ CheckCircle, CircleDashed, OctagonX, TriangleAlert }` from `lucide-react`; define one shared props object `{ 'aria-hidden': 'true', focusable: 'false', size: '1.25em' }`; re-export the four existing names, each rendering its lucide icon with those props: `CheckCircleIcon`→`CheckCircle`, `TriangleAlertIcon`→`TriangleAlert`, `OctagonXIcon`→`OctagonX`, `CircleDashIcon`→`CircleDashed`. Remove the hand-drawn `svgProps` and all four inline-SVG bodies. Keep the four export names and their no-prop call signature exactly (FR-002, FR-003). Use only `currentColor` (lucide default `stroke`); add no raw color (FR-006). Header comment: "Status icons (TS-14): re-exported from lucide-react (D-46), the single icon source. Decorative only — aria-hidden + focusable=\"false\"; em-sized (1.25em); currentColor (the dark --color-text), never a status color as text." Depends on T002 (AC2, AC5, FR-002, FR-004) (frontend-dev)
- [X] T004 [TS-14] Confirm no call site changed: `git diff frontend/src/components/StatusBadge.jsx frontend/src/components/AppShell.jsx frontend/src/pages/login/LoginPage.jsx` must be empty (their `Icons.jsx` import lines and usage are unchanged). If anything shows a diff, revert that file — the wrapper in T003 must keep the exports compatible. Depends on T003 (FR-003) (frontend-dev)

### Agent rules (frontend-dev)

- [X] T005 [P] [TS-14] Update both `frontend-dev` agent files, kept in sync (AGENTS.md): in `.kiro/agents/frontend-dev.md` and `.claude/agents/frontend-dev.md`, add/replace the icon rule to state that **icons come from `lucide-react` (the single icon source, D-46); do not hand-draw SVG icons**. Keep the existing accessibility rules intact (every status shows color + icon + label; contrast meets WCAG AA; icons stay decorative/`aria-hidden`). Make the same edit, word for word, in both files so their rule content stays identical. After editing, confirm the two files state the same rule (e.g. `diff` the icon-rule lines). Depends on T002 (AC8, FR-010) (frontend-dev)

### Tests (qa-tester)

- [X] T006 [P] [TS-14] (Optional, belt-and-braces) Create `frontend/src/components/Icons.test.jsx`: for each of `CheckCircleIcon`, `TriangleAlertIcon`, `OctagonXIcon`, `CircleDashIcon`, render it and assert it produces exactly one `svg` that is `aria-hidden="true"`, has `focusable="false"`, has `width` and `height` equal to `1.25em`, and uses `stroke="currentColor"`; assert the four rendered `svg` markups are distinct. Header comment cites TS-14 AC5, FR-004/FR-005. Synthetic only, no backend, no network. Depends on T003 (AC5, FR-004, FR-005) (qa-tester)
- [X] T007 [TS-14] Run the full validation from [quickstart.md](quickstart.md) in `frontend/`: `npm test` (every previously passing test still passes and the count does not drop; in particular `components/StatusBadge.test.jsx`, `pages/login/*.test.jsx`, `styles/noRawColors.test.js`, `styles/contrast.test.js`), `npm run build`, `npm audit --audit-level=high`, and `git diff --stat backend/ .github/` (empty). Also `grep -rn "viewBox\|<svg" frontend/src/components/Icons.jsx` returns nothing (no hand-drawn SVG remains) and `grep -rn "from 'lucide-react'" frontend/src/components/Icons.jsx` returns one line. Report the counts next to the T001 baseline. If a check fails, fix it in the owning task (T003/T005). Depends on T003, T004, T005, T006 (AC3, AC4, AC6, AC7, FR-007, FR-008) (qa-tester)

### Review (security-reviewer)

- [X] T008 [TS-14] Review the story (read-only, change no code). Check: `lucide-react` is the only new dependency, pinned exactly in `package.json` and present in the lock file, and `npm audit --audit-level=high` passes; the package license is acceptable (MIT) and no unexpected transitive dependency was added; the four icons stay decorative (`aria-hidden="true"`, `focusable="false"`) and use `currentColor` only, never a status color as text; `Icons.jsx` holds no raw color; no call-site import changed; the backend is unchanged. Return the findings as a report; the orchestrator logs them (constitution VIII) (security-reviewer)

---

## Phase 4: Polish

- [X] T009 [P] Edit `docs/DECISIONS.md`: add **D-46** after D-45 (today's date, Status "Active"): adopt **`lucide-react` 1.77.0** (or the version T002 installed) as the **single icon source** for the frontend; `Icons.jsx` re-exports the four status icons (`CheckCircle`, `TriangleAlert`, `OctagonX`, `CircleDashed`) under the existing names (`CheckCircleIcon`, `TriangleAlertIcon`, `OctagonXIcon`, `CircleDashIcon`); icons stay `aria-hidden`, `focusable="false"`, em-sized and `currentColor` (never a status color as text). **Supersedes the "no icon library" part of D-43**; the rest of D-43 stays (one token file, CSS Modules, status color as border/tint with a dark label, the `noRawColors` and `contrast` guards). Reasons and rejected options from [research.md](research.md) R1–R2 (keep hand-drawn SVGs — does not scale to US-02/US-04/US-05 and leaves each icon a bespoke untested SVG; a different icon library — not the team's choice). Follow the D-45 → D-33/D-35 pattern. Then add "Superseded in part by D-46 (icon library)" to the Status cell of **D-43**; delete no earlier text (AC9, FR-011) (orchestrator)
- [X] T010 [P] Edit `docs/PROJECT_STATUS.md` and `docs/BACKLOG.md`: mark TS-14 done and link `specs/014-icon-library/spec.md` in the backlog's Spec column; update "Last updated", "Current step" (add TS-14 ✅) and "Next step" (as the team decides, e.g. US-01); add a "Notes for later stories" bullet: US-02, US-04 and US-05 add new icons by importing them from `lucide-react` (not by hand-drawing SVGs) (AC10, FR-012) (orchestrator)
- [X] T011 Check `specs/014-icon-library/agent-log.csv`: every task has `assigned`, `started` and `done` rows from its agent; log each T008 finding with `-Action finding` on the security-reviewer's behalf (that agent has no shell). Prepare the PR record: link to `specs/014-icon-library/`, which agent did what, the T001 and T007 test counts, the `lucide-react` version and audit result, and the security-reviewer's findings with how each was resolved (constitution workflow step 6). Depends on T007, T008, T009, T010 (orchestrator)

---

## Dependencies & Execution Order

- **Setup**: T001 before any edit; T002 depends on T001.
- **Implementation**: T003 depends on T002; T004 depends on T003. T005 depends on T002 only and runs in parallel with T003/T004.
- **Tests**: T006 depends on T003 (optional, can run in parallel with T004/T005). T007 depends on T003, T004, T005, T006.
- **Review**: T008 depends on T007 (reviews the finished, green state).
- **Polish**: T009 and T010 can run after T007 (in parallel); T011 runs last.
- **Story dependencies**: TS-12 (merged), per `docs/BACKLOG.md`. No functional story code is touched.

## Parallel Example

```text
# Round 1: T001 (qa-tester baseline) → T002 (frontend-dev dependency)
# Round 2 (frontend-dev):  T003 and T005 in parallel → T004
# Round 3 (qa-tester):     T006 (after T003) → T007
# Round 4:                 T008 (security-reviewer) → T009 + T010 → T011 (orchestrator)
```

## Implementation Strategy

TS-14 is the whole MVP, built so each step stays green:

1. Baseline and dependency (T001–T002): tests and build still pass with `lucide-react` installed and unused.
2. Rewrite `Icons.jsx` as lucide wrappers and confirm no call site changed (T003–T004); update the agent files (T005).
3. Optional wrapper test and full validation (T006–T007): all existing tests, build and audit pass; count does not drop.
4. Security review (T008), decision/status/PR record (T009–T011).

After T011, commit (`TS-14: Icon library`), push and open the PR. CI (TS-09) runs the tests, build and dependency check; the PR includes the agent activity log.

## Notes

- The orchestrator assigns each task to its agent and logs `assigned` / `started` / `done` rows (see `docs/agents.md`).
- Testing runs after implementation, as the project template orders it (qa-tester, then security-reviewer).
- Do not add anything not listed here (Principle XII): no icon-size or color props beyond what the call sites need, no new icons beyond the four, no change to the status colors or the token model, no backend change, no new dependency other than `lucide-react`.
