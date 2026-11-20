# Contract: design tokens (TS-12)

`frontend/src/styles/tokens.css` defines every token on `:root`. It is the only file with color values. Everything else uses `var(--token)`.

## Colors

| Token | Value | Used for |
|---|---|---|
| `--color-stable` | `#10B981` | Monitoring status `stable`: border (never text) |
| `--color-stable-soft` | `#D1FAE5` | `stable` badge background |
| `--color-warning` | `#F59E0B` | `warning`: border; also the disclaimer chip border |
| `--color-warning-soft` | `#FEF3C7` | `warning` badge background; disclaimer chip background |
| `--color-critical` | `#E11D48` | `critical`: border; login error border |
| `--color-critical-soft` | `#FFE4E6` | `critical` badge background; login error box background |
| `--color-no-data` | `#64748B` | `no_data`: border |
| `--color-no-data-soft` | `#F1F5F9` | `no_data` badge background |
| `--color-bg` | `#FFFFFF` | Page and card background; label on primary button |
| `--color-bg-subtle` | `#F8FAFC` | Subtle surface (disabled button, triage level badge) |
| `--color-primary` | `#2563EB` | Primary button background, focus ring, selected-state border |
| `--color-primary-soft` | `#EFF6FF` | Selected toggle background, hover on secondary button |
| `--color-text` | `#1E293B` | All body text, labels and badge icons |
| `--color-primary-hover` | `#1D4ED8` | Primary button on hover (added by this story) |
| `--color-border` | `#CBD5E1` | Decorative lines: card and header edges (added) |
| `--color-border-strong` | `#64748B` | Form-control and secondary-button boundary (added) |

Rules: a solid status color (`stable`, `warning`, `critical`, `no-data`) is never the `color` of text; labels and icons use `--color-text` on the soft variant.

## Other tokens

| Token | Value |
|---|---|
| `--space-1` … `--space-6` | `0.25rem`, `0.5rem`, `0.75rem`, `1rem`, `1.5rem`, `2rem` |
| `--font-family` | `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` (same stack as today) |
| `--font-size-base` | `1rem` (16px; the smallest size) |
| `--font-size-lg` / `-xl` / `-2xl` | `1.125rem` / `1.375rem` / `1.75rem` |
| `--line-height` | `1.5` |
| `--radius-sm` / `-md` / `-pill` | `0.25rem` / `0.5rem` / `999px` |
| `--focus-ring` | `3px solid var(--color-primary)` |
| `--focus-offset` | `2px` |
| `--size-target` | `2.75rem` (44px at the default root size) |

## Contrast pairs checked by `contrast.test.js`

Ratios as of 2026-11-19 (WCAG 2.1 relative luminance). The test recomputes them from `tokens.css`.

**Text, at least 4.5:1**

| Foreground on background | Ratio | Where used |
|---|---|---|
| `text` on `bg` | 14.63 | body, card |
| `text` on `bg-subtle` | 13.98 | triage level badge, disabled button |
| `text` on `primary-soft` | 13.44 | selected toggle, secondary button hover |
| `text` on `stable-soft` | 12.90 | status badge label |
| `text` on `warning-soft` | 13.14 | status badge label, disclaimer chip |
| `text` on `critical-soft` | 12.19 | status badge label, login error |
| `text` on `no-data-soft` | 13.35 | status badge label |
| `bg` on `primary` | 5.17 | primary button label |
| `bg` on `primary-hover` | 6.70 | primary button label on hover |
| `border-strong` on `bg-subtle` | 4.55 | disabled button label |

**Meaningful non-text, at least 3:1**

| Element | Ratio | Where used |
|---|---|---|
| Badge icon: `text` on each of the four soft colors | 12.19 to 13.35 | status badge icon |
| `border-strong` on `bg` | 4.76 | input and secondary button boundary |
| `primary` on `bg` | 5.17 | focus ring |
| `primary` on `bg-subtle` | 4.94 | focus ring in the header |
| `primary` on `primary-soft` | 4.75 | selected toggle border |

Not tested on purpose: status solid-color borders (they reinforce the icon and label, which carry the meaning) and `--color-border` (decorative).

## How to add a token

1. Add it to `tokens.css` (a new color gets a documented pair in `contrast.test.js` if text or a control uses it).
2. Add a row to this contract and mention it in the PR.
3. Use it as `var(--name)`. Never copy its value into another file.
