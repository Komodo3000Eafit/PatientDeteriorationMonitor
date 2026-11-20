# Research: Icon Library (TS-14)

All unknowns from the Technical Context are resolved below. Findings were verified against an
isolated install of `lucide-react@1.77.0` with React 19.3 (server-rendered markup inspected), not
assumed.

## R1 — Which `lucide-react` version, and is it compatible with React 19?

- **Decision**: pin `lucide-react` to the exact version **`1.77.0`** (no caret) in
  `frontend/package.json`.
- **Rationale**: `1.77.0` is the current `latest` on the npm registry. Its `peerDependencies`
  declare `react: "^16.5.1 || ^17.0.0 || ^18.0.0 || ^19.0.0"`, which includes the project's React
  19.3 (D-33). An exact pin matches how TS-13 pinned `react-router` (D-45) and keeps the build
  reproducible; a newly published version cannot change behavior under the team's feet.
- **Alternatives considered**:
  - A caret range (`^1.77.0`): rejected — the project pins exact versions for reproducibility and
    to keep `npm audit` results stable (D-38 pattern).
  - An older `0.x` line: rejected — `latest` already supports React 19 and is clean on audit; no
    reason to pick an older line.

## R2 — Which lucide export names map to our four icons?

- **Decision**: map our existing export names to these lucide icons:

  | Our export (unchanged) | lucide-react icon | Status | Previous hand-drawn shape |
  |---|---|---|---|
  | `CheckCircleIcon`   | `CheckCircle`  | stable   | check mark in a circle |
  | `TriangleAlertIcon` | `TriangleAlert`| warning  | triangle with exclamation |
  | `OctagonXIcon`      | `OctagonX`     | critical | octagon with an "x" |
  | `CircleDashIcon`    | `CircleDashed` | no_data  | circle with a dash |

- **Rationale**: all four lucide names exist in `1.77.0` (verified by importing them) and match the
  intended meaning of each status one-to-one, with shapes close to the hand-drawn originals. Only
  the wrapper references the lucide name; the **exported name never changes**, so no call site
  breaks (FR-002, FR-003).
- **Alternatives considered**: `CircleCheck`/`CheckCircle2`/`CircleCheckBig` for stable and
  `AlertTriangle`/`OctagonAlert` for warning/critical all exist too; rejected because the chosen
  names are the plainest match and keep the mapping obvious. If a future lucide version renamed one
  of these, only the wrapper line would change (the spec's stated rule).

## R3 — How does lucide render, and what must the wrapper set?

- **Decision**: each wrapper renders its lucide icon with **`aria-hidden="true"`,
  `focusable="false"` and `size="1.25em"`** set explicitly; color is left to lucide's default
  `stroke="currentColor"`.
- **Rationale** (from inspecting the rendered markup):
  - lucide outputs a **single `<svg>`** with `fill="none" stroke="currentColor" stroke-width="2"`
    and a `class="lucide lucide-…"`. `currentColor` is exactly what D-43 requires (the icon inherits
    the dark `--color-text` of its context), so no color prop is needed.
  - With no `aria-label`, lucide **already** adds `aria-hidden="true"`; the wrapper sets it anyway so
    the decorative guarantee does not depend on a library default.
  - lucide does **not** set `focusable`; the wrapper must pass `focusable="false"` explicitly
    (FR-004, AC5).
  - lucide defaults to `width/height="24"` (pixels). Passing `size="1.25em"` makes lucide emit
    `width="1.25em" height="1.25em"`, preserving the TS-12 icons' `1.25em` size and keeping the icon
    scaling with its surrounding text. (The old hand-drawn icons sized themselves; there is no CSS
    rule sizing the svg, so the size must come from the element, confirmed in `StatusBadge.module.css`
    and `styles/global.css`.)
  - Rendering all four wrappers produces **four distinct `<svg>` markups** (verified), so the
    StatusBadge "four distinct icons" assertion holds.
- **Alternatives considered**:
  - Relying on lucide's default `aria-hidden` without setting it: rejected — the accessibility
    guarantee should be explicit in our code, not a silent library default that a future version
    could change.
  - Sizing with CSS instead of the `size` prop: rejected — there is no existing svg-sizing CSS rule
    and D-43 keeps colors/sizing in tokens/components, not new global svg rules; passing `size` is
    the smallest change and mirrors the old inline `1.25em`.
  - Passing `color` explicitly: unnecessary — `currentColor` is lucide's default and is what we want.

## R4 — Will the existing tests and guards keep passing?

- **Decision**: no test file needs to change; the rewritten `Icons.jsx` keeps every existing
  assertion green.
- **Rationale**:
  - **StatusBadge test**: asserts exactly one `svg` per badge with `aria-hidden="true"`, four
    distinct icon markups, unchanged Spanish/English labels and the `no_data` fallback. The wrappers
    render one `aria-hidden="true"` svg each, four are distinct, and labels come from the unchanged
    `translations.js`/`statusToLabelKey`, so all pass.
  - **LoginPage alert test**: asserts the alert contains exactly one `svg` with
    `aria-hidden="true"` and unchanged text. `OctagonXIcon` renders one such svg; the alert text is
    unchanged.
  - **`noRawColors.test.js`**: scans `.js/.jsx/.css` under `src/` (excluding `tokens.css`, tests and
    `testing/`), not `node_modules`. The rewritten `Icons.jsx` contains no hex, color function or
    named color (only `currentColor`, which the guard does not flag), so the scan stays green.
  - **`contrast.test.js`**: unchanged — colors/tokens are not touched; the icon still draws in
    `--color-text` on the soft badge background.
  - lucide adds a `class` attribute to the svg; the tests use `querySelector('svg')` and attribute
    checks, so the extra class is harmless and asserted by none of them.
- **Alternatives considered**: adding new wrapper unit tests — optional, not required; the spec asks
  that the passing count not drop, which rewriting `Icons.jsx` satisfies. Tasks may add a small
  `Icons.test.jsx` (one svg, `aria-hidden`, `focusable`, `currentColor`, em size) as belt-and-braces;
  it only raises the count.

## R5 — Does `npm audit --audit-level=high` pass for this dependency?

- **Decision**: proceed with `lucide-react@1.77.0`; the frontend audit is expected to stay green.
- **Rationale**: `lucide-react` is a pure SVG-component package (MIT) with a minimal dependency
  footprint; CI runs `npm audit --audit-level=high` (D-38) on the final lockfile. The install step in
  `/speckit-implement` re-runs the audit; if a high/critical advisory exists at that moment, it is
  handled the D-38 way (upgrade within the compatible line or an `overrides` entry with a reason and a
  DECISIONS note). At merge time the audit must pass (FR-008).
- **Alternatives considered**: none needed; this is the standard dependency-vetting path for the
  project.

## Summary of decisions

- Add exactly one pinned runtime dependency: `lucide-react@1.77.0` (R1).
- Wrap `CheckCircle`, `TriangleAlert`, `OctagonX`, `CircleDashed` under the existing four export
  names (R2).
- Each wrapper sets `aria-hidden="true"`, `focusable="false"`, `size="1.25em"`; color stays
  `currentColor` (R3).
- No call site and no test file must change; all guards stay green (R4).
- Frontend audit stays within D-38's rules (R5).
