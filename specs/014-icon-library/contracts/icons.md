# Contract: `frontend/src/components/Icons.jsx` (TS-14)

`Icons.jsx` is the single icon module for the frontend. After TS-14 it re-exports `lucide-react`
icons under the names the app already uses; the hand-drawn inline SVGs are removed.

## Public exports (stable — do not change)

```js
export function CheckCircleIcon(): JSX.Element   // stable   → lucide CheckCircle
export function TriangleAlertIcon(): JSX.Element // warning  → lucide TriangleAlert
export function OctagonXIcon(): JSX.Element      // critical → lucide OctagonX
export function CircleDashIcon(): JSX.Element    // no_data  → lucide CircleDashed
```

- These four names and their call signature (no required props) are the contract. `StatusBadge.jsx`,
  `AppShell.jsx` and `pages/login/LoginPage.jsx` import them and MUST NOT need any edit (FR-003).
- Callers invoke them with no props: `<CheckCircleIcon />`, `<TriangleAlertIcon />`,
  `<OctagonXIcon />`, `<CircleDashIcon />`.

## Rendering guarantee

Each exported component renders exactly one `<svg>` that is:

- `aria-hidden="true"` (set explicitly by the wrapper)
- `focusable="false"` (set explicitly by the wrapper)
- sized `1.25em` in both dimensions (via lucide's `size="1.25em"`)
- drawn with `currentColor` (lucide default `stroke`), so it inherits the dark `--color-text`; a
  status color is never used as the icon's text/stroke color

The four components render four visually distinct `<svg>` markups.

## Reference implementation shape (illustrative, not final code)

```jsx
// Status icons (TS-14): re-exported from lucide-react (D-46), the single icon source.
// Decorative only: aria-hidden + focusable="false"; em-sized; currentColor (the dark --color-text).
import { CheckCircle, CircleDashed, OctagonX, TriangleAlert } from 'lucide-react'

const iconProps = { 'aria-hidden': 'true', focusable: 'false', size: '1.25em' }

export const CheckCircleIcon = () => <CheckCircle {...iconProps} />
export const TriangleAlertIcon = () => <TriangleAlert {...iconProps} />
export const OctagonXIcon = () => <OctagonX {...iconProps} />
export const CircleDashIcon = () => <CircleDashed {...iconProps} />
```

> The exact export style (named `const` vs `function`) is a tasks/implementation detail; the
> contract is the four names, the no-prop call signature and the rendering guarantee above.

## What the contract forbids

- Changing or removing any of the four export names.
- Requiring props at the call site (so call sites and their imports stay unchanged).
- Introducing a raw color (hex, color function or named color) anywhere in the file.
- Adding any other runtime dependency.
