# Implementation Plan: Icon Library

**Branch**: `014-icon-library` | **Date**: 2026-11-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/014-icon-library/spec.md`

## Summary

Adopt `lucide-react` as the single icon source and replace the four hand-drawn inline SVG status icons in `frontend/src/components/Icons.jsx`. Each of the four existing exports (`CheckCircleIcon`, `TriangleAlertIcon`, `OctagonXIcon`, `CircleDashIcon`) becomes a thin wrapper around a lucide icon (`CheckCircle`, `TriangleAlert`, `OctagonX`, `CircleDashed`) that fixes the rendering the app relies on: a single `<svg>` that is `aria-hidden="true"` and `focusable="false"`, sized `1.25em`, drawn in `currentColor`. The export names and every call-site import stay unchanged, so `StatusBadge`, `AppShell` and `LoginPage` are untouched and their tests keep passing. Frontend plus docs and the two `frontend-dev` agent files only; the backend does not change.

## Technical Context

**Language/Version**: JavaScript (ES modules), React 19.3, Vite 8 (D-33); Node.js 26 locally and in CI

**Primary Dependencies**: existing React + react-dom; **new**: `lucide-react` 1.77.0 (single runtime dependency; peer range includes React 19, research R1)

**Storage**: N/A (no data, no storage change)

**Testing**: Vitest + jsdom + React Testing Library, `fetch` mocked (D-33). Baseline suite passes (spec states 221); this story adds no required new test file but keeps every existing assertion green (research R4)

**Target Platform**: modern browsers; local dev server (Vite) now, one Azure App Service (D-39) in deployment — unchanged by this story

**Project Type**: web application (`backend/` + `frontend/`); this story touches `frontend/`, `docs/` and the two `frontend-dev` agent files only

**Performance Goals**: no runtime performance target; icons render as before. Bundle growth kept minimal by importing only the four named icons from `lucide-react` (tree-shaken by Vite, research R3)

**Constraints**: exactly one new runtime dependency, pinned; no raw color added anywhere in `src/` (TS-12 `noRawColors` scan stays green); contrast test stays green; `npm run build`, `npm test` and `npm audit --audit-level=high` pass; backend unchanged

**Scale/Scope**: 1 production file rewritten (`Icons.jsx`), `package.json` + lockfile, 2 agent files, 3 docs files. No call site changes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] I. Spec-driven and traceable: every change maps to AC1–AC10 of the spec (see Project Structure); tasks will reference TS-14 and its ACs
- [x] II. Small Scrum story: one technical story (TS-14), a single-file icon-source swap plus docs; implementable in minutes
- [x] III. Independence: depends only on TS-12 (merged), as in `docs/BACKLOG.md`; changes no functional story code; keeps the four export names so nothing that mounts these icons is edited
- [x] IV. Multi-agent: frontend-dev rewrites `Icons.jsx`, adds the dependency and updates the agent files; qa-tester runs `npm test`/build/audit and confirms the StatusBadge and LoginPage assertions; security-reviewer reviews the new dependency; orchestrator logs in `agent-log.csv` and updates docs
- [x] V. Clinical logic: none touched; icons are decorative, status is still computed by the backend and shown with color + icon + label (D-43 unchanged except the icon source)
- [x] VI. Data privacy: no data, no secrets; `lucide-react` is a public MIT-licensed package
- [x] VII. Tests: no clinical critical path changes; the security-relevant accessibility guarantees (decorative `aria-hidden` icons) and the raw-color guard are kept green by the existing tests (research R4)
- [x] VIII. Security baseline: one new dependency, checked by CI's `npm audit --audit-level=high` (D-38); no input handling, auth or CORS change
- [x] IX. Deployable at low cost: no new service; `lucide-react` ships inside the existing frontend bundle on the same App Service (D-39)
- [x] X. Stack: React frontend; `lucide-react` is a React icon library, no backend or database change
- [x] XI. Language: English code and docs; no UI text added (icons are decorative, labels unchanged), so no new glossary term is needed; D-40 still honored (no new concept introduced)
- [x] XII. Simplicity: replaces hand-drawn SVGs with a named-icon library; the single added dependency is justified in Complexity Tracking; wrappers are the minimum needed to keep the existing rendered contract

**Post-design re-check (after Phase 1)**: still all pass. The only added complexity is the one `lucide-react` dependency, justified in Complexity Tracking per Principle XII. No new abstraction, service or configuration is introduced.

## Project Structure

### Documentation (this feature)

```text
specs/014-icon-library/
├── spec.md
├── plan.md              # This file
├── research.md          # R1–R5 decisions (version, names, render contract, test impact, audit)
├── data-model.md        # The four wrapper → lucide mappings and the rendered-svg contract
├── quickstart.md        # Automated and manual validation
├── contracts/
│   └── icons.md         # The Icons.jsx public contract (names, props, rendered svg)
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
frontend/
├── package.json         # + "lucide-react": "1.77.0" (exact pin, AC1, FR-001)
├── package-lock.json    # lockfile updated by npm install
└── src/
    └── components/
        └── Icons.jsx     # REWRITTEN: four wrappers re-exported from lucide-react (AC2, AC5, FR-002, FR-004)

# unchanged, listed to show no call site changes (FR-003):
#   src/components/StatusBadge.jsx      (imports the four names — unchanged)
#   src/components/AppShell.jsx         (imports TriangleAlertIcon — unchanged)
#   src/pages/login/LoginPage.jsx       (imports OctagonXIcon — unchanged)
#   src/components/StatusBadge.test.jsx (exactly one aria-hidden svg, four distinct icons — passes)
#   src/pages/login/*.test.jsx          (exactly one aria-hidden svg in the alert — passes)
#   src/styles/noRawColors.test.js      (no raw color in Icons.jsx — passes)

.kiro/agents/frontend-dev.md    # icons from lucide-react; do not hand-draw SVGs (AC8, FR-010)
.claude/agents/frontend-dev.md  # kept in sync, same rule content (AC8, FR-010)

docs/
├── DECISIONS.md        # D-46 adopts lucide-react, amends D-43 (AC9, FR-011)
├── BACKLOG.md          # TS-14 ✅ + spec link (AC10, FR-012)
└── PROJECT_STATUS.md   # TS-14 done (AC10, FR-012)
```

**Structure Decision**: web application layout (`backend/` + `frontend/`); only `frontend/`, the two `frontend-dev` agent files and `docs/` change. The single production file touched is `frontend/src/components/Icons.jsx`; no new file or folder is created in `src/`.

### Key design points

1. **Dependency** (R1): add `"lucide-react": "1.77.0"` to `frontend/package.json` as an exact pin (no caret), run `npm install` to update the lockfile. lucide-react 1.77.0 declares React `^19.0.0` in its peer range and `npm audit --audit-level=high` is clean for it (R1, R5).
2. **Name mapping** (R2): `CheckCircleIcon`→`CheckCircle`, `TriangleAlertIcon`→`TriangleAlert`, `OctagonXIcon`→`OctagonX`, `CircleDashIcon`→`CircleDashed`. All four names exist in 1.77.0 (verified). Only the wrapper references the lucide name; the exported name is unchanged.
3. **Rendered contract** (R3): lucide renders a single `<svg stroke="currentColor">` and, with no `aria-label`, already sets `aria-hidden="true"`; but it defaults to `width/height="24"` (pixels) and does **not** set `focusable`. So each wrapper passes `size="1.25em"` (lucide maps `size` to both width and height, preserving the old `1.25em` visual size), `aria-hidden="true"` (set explicitly, not relied on as a default) and `focusable="false"`. Result: one `<svg aria-hidden="true" focusable="false" width="1.25em" height="1.25em" stroke="currentColor" …>`. The four icons produce four distinct markups (verified), so the StatusBadge "four distinct icons" assertion holds.
4. **Call sites unchanged** (R4): `Icons.jsx` keeps exporting the four names with no props required at the call site (`<CheckCircleIcon />` etc.), so `StatusBadge.jsx`, `AppShell.jsx` and `LoginPage.jsx` and their imports do not change. The StatusBadge test (one `aria-hidden` svg, four distinct icons, unchanged labels, `no_data` fallback) and the LoginPage alert test (one `aria-hidden` svg) keep passing because the rendered svg still matches what they assert.
5. **Raw-color guard** (R4): `noRawColors.test.js` scans `src/` files, not `node_modules`; the rewritten `Icons.jsx` holds no hex/color-function/named-color and uses `currentColor` only, so the scan stays green.
6. **D-46** (DECISIONS): adds `lucide-react` 1.77.0 as the single icon source, states the reason and rejected alternatives, and supersedes the "no icon library" part of D-43; D-43 is annotated "superseded in part by D-46", following the D-45 → D-33/D-35 pattern; the rest of D-43 (one token file, CSS Modules, status color as border/tint with a dark label, the two guard tests) stays in force.
7. **Agent files**: both `frontend-dev.md` files gain the rule "icons come from `lucide-react`; do not hand-draw SVG icons", keep the accessibility rules (every status shows color + icon + label; contrast WCAG AA), and stay identical in rule content (AGENTS.md).

### Agents

| Agent | Work |
|---|---|
| orchestrator | Runs `/speckit-implement`, assigns tasks, keeps `agent-log.csv`, updates `DECISIONS.md`/`BACKLOG.md`/`PROJECT_STATUS.md` |
| frontend-dev | Adds the pinned dependency, rewrites `Icons.jsx` as lucide wrappers, updates both `frontend-dev.md` agent files |
| qa-tester | Runs `npm test`, `npm run build`, `npm audit --audit-level=high`; confirms the StatusBadge/LoginPage assertions and the raw-color + contrast guards stay green; count does not drop |
| security-reviewer | Reviews the new dependency (license, advisories), confirms icons stay decorative (`aria-hidden`) and no raw color is added |

## Complexity Tracking

| Added complexity | Why Needed | Simpler Alternative Rejected Because |
|------------------|------------|-------------------------------------|
| New runtime dependency `lucide-react` 1.77.0 (icon library) | TS-14 adopts one consistent, named icon source so the baseline functional stories (US-02, US-04, US-05) add icons by name instead of hand-drawing SVGs; it replaces the four hand-drawn icons from TS-12 and amends the "no icon library" part of D-43 | Keeping hand-drawn inline SVGs (the current D-43 approach) does not scale to the icons US-02/US-04/US-05 will need and makes each new icon a bespoke, untested SVG; a different icon library is not simpler and is not the team's choice. The dependency is a single tree-shaken package, checked by CI's `npm audit` (D-38), so the cost is one pinned line in `package.json` |
