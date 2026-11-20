# Data Model: UI Foundation (TS-12)

This story adds no database table, API field, stored record or browser storage. The "data" are the values the shared components receive and the design tokens. Nothing here is persisted.

## Design token

| Field | Rule |
|---|---|
| Name | `--kebab-case`, grouped by prefix: `--color-`, `--space-`, `--font-`, `--radius-`, `--focus-`, `--size-` |
| Value | one CSS value, written only in `styles/tokens.css` |
| Use | referenced as `var(--name)` in every other stylesheet; never copied |
| Full list | [contracts/tokens.md](contracts/tokens.md) |

## Monitoring status

| Field | Rule |
|---|---|
| Name in data | `monitoring_status` (the backend will return it in a later story; this story only receives it as a prop) |
| Allowed values | `stable`, `warning`, `critical`, `no_data` (lowercase, exact) |
| Any other input | treated as `no_data` (missing, empty, other case, spaces, unknown value, non-string) |
| Not the same as | the patient's `status` (`active` / `discharged`) and the triage level |
| Who computes it | the backend. The frontend never derives it from a score, a threshold or a triage level (Principle V) |

| Value | Token name | Color token | Soft token | Icon | Label key |
|---|---|---|---|---|---|
| `stable` | `stable` | `--color-stable` | `--color-stable-soft` | `CheckCircleIcon` | `monitoringStatus.stable` |
| `warning` | `warning` | `--color-warning` | `--color-warning-soft` | `TriangleAlertIcon` | `monitoringStatus.warning` |
| `critical` | `critical` | `--color-critical` | `--color-critical-soft` | `OctagonXIcon` | `monitoringStatus.critical` |
| `no_data` | `no-data` | `--color-no-data` | `--color-no-data-soft` | `CircleDashIcon` | `monitoringStatus.no_data` |

State: a status has no lifecycle in the frontend; each render shows the value it is given. A missing value is never shown as `stable`.

## Triage level (display only)

| Field | Rule |
|---|---|
| Name in data | `triage_level` (existing backend field) |
| Valid | a whole number 1 to 5 (`Number.isInteger` and in range); 1 = most urgent |
| Invalid | any other value, including numeric strings and decimals: shows "No level" |
| Text | `triageLevel.1` to `triageLevel.5` = "Triage I" to "Triage V" (both languages); `triageLevel.none` otherwise |
| Changes | never. The badge displays; a clinician changes the level elsewhere (glossary §1.1) |

## Shared component

A component in `components/` with `export default`, its own `.module.css` and `.test.jsx`, props as in [contracts/components.md](contracts/components.md), texts only by key. No state, no effects, no storage, no network.
