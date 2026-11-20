# Data Model: Icon Library (TS-14)

This story introduces no database entity, API field or stored data. The only "model" is the mapping
from each public icon export to its `lucide-react` source and the rendered-SVG contract each wrapper
guarantees.

## Icon wrapper mapping

| Export (public, unchanged) | Monitoring status | `lucide-react` source | Call sites (unchanged imports) |
|---|---|---|---|
| `CheckCircleIcon`   | `stable`   | `CheckCircle`  | `StatusBadge.jsx` |
| `TriangleAlertIcon` | `warning`  | `TriangleAlert`| `StatusBadge.jsx`, `AppShell.jsx` |
| `OctagonXIcon`      | `critical` | `OctagonX`     | `StatusBadge.jsx`, `pages/login/LoginPage.jsx` |
| `CircleDashIcon`    | `no_data`  | `CircleDashed` | `StatusBadge.jsx` |

- The exported name is the stable contract (FR-002, FR-003); the lucide source is an implementation
  detail of the wrapper.
- `StatusBadge` maps the four monitoring-status token names to these components via its `ICONS`
  object (unchanged): `stable`→`CheckCircleIcon`, `warning`→`TriangleAlertIcon`,
  `critical`→`OctagonXIcon`, `no-data`→`CircleDashIcon`.

## Rendered-SVG contract (per wrapper)

Each wrapper, called with no props (`<CheckCircleIcon />`), MUST render exactly one `<svg>` with:

| Attribute | Value | Why |
|---|---|---|
| `aria-hidden` | `"true"` | decorative; meaning comes from the adjacent label (D-43, AC3–AC5) |
| `focusable` | `"false"` | not reachable by keyboard focus (AC5, FR-004) |
| `width` / `height` | `1.25em` (via lucide `size="1.25em"`) | scales with text; matches the old TS-12 size |
| `stroke` | `currentColor` (lucide default) | inherits the dark `--color-text`; never a status color as text (D-43, AC5) |

- The four rendered markups MUST be mutually distinct (AC3/FR-005) — verified for the chosen lucide
  icons.
- lucide also emits `fill="none"`, `stroke-width="2"`, `viewBox="0 0 24 24"` and a `class="lucide …"`;
  these are harmless to the existing tests (which check attribute values and svg count, not the class).

## State and lifecycle

None. Wrappers are pure stateless presentational components; there is no state, transition, identity
or persistence.

## Validation rules

- No raw color may appear in `Icons.jsx` (only `currentColor`, which the `noRawColors` guard does not
  flag) — FR-006.
- No call-site import line changes — FR-003.
- Exactly one new runtime dependency (`lucide-react`), pinned — FR-001.
