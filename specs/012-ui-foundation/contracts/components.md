# Contract: shared components (TS-12)

All live in `frontend/src/components/`. Components use `export default` (as `AppShell` does); `Icons.jsx` uses named exports. Each component has its CSS Module and its test. Texts come only from `translations.js` through `useLanguage()`. Nothing here calls the backend, reads storage or computes a clinical result.

## Button (`Button.jsx`)

```jsx
<Button variant="primary" onClick={save}>{t('area.save')}</Button>
<Button variant="secondary" type="submit" disabled={isLoading}>…</Button>
```

| Prop | Type | Default | Rule |
|---|---|---|---|
| `variant` | `'primary'` \| `'secondary'` | `'primary'` | Any other value falls back to `primary`. |
| `type` | `'button'` \| `'submit'` \| `'reset'` | `'button'` | Never submits a form unless asked. |
| `disabled` | boolean | `false` | Native `disabled`: not focusable, no click. |
| `children` | node | none | The label (already translated by the caller). |
| other props | | | Passed to the `<button>`: `onClick`, `aria-pressed`, `aria-label`, `id`, `data-*`. `className` and `style` are ignored. |

Look: `primary` is `primary` background with `bg` text and `primary-hover` on hover. `secondary` is `bg` background, `text` color, 1px `border-strong` border, `primary-soft` on hover. `[aria-pressed="true"]` shows the selected look (`primary-soft` background, `primary` border, bold). Disabled: `bg-subtle` background, `no-data` label, `border` border. Always: `min-height` and `min-width` `var(--size-target)`, radius `--radius-md`, `outline: var(--focus-ring)` with `--focus-offset` on `:focus-visible`.

## Card (`Card.jsx`)

```jsx
<Card title={t('area.title')} headingLevel={2}>
  <p>…</p>
</Card>
```

| Prop | Type | Default | Rule |
|---|---|---|---|
| `title` | string | none | Already translated. When present, rendered as a heading; when absent, no heading. |
| `headingLevel` | `2` \| `3` \| `4` | `2` | Any other value falls back to `2`. The page owns `h1`. |
| `children` | node | none | The content. |

Renders a `<div>` (not a landmark) with `bg` background, 1px `border` border, `--radius-md` and `--space-4` padding.

## StatusBadge (`StatusBadge.jsx`)

```jsx
<StatusBadge monitoringStatus={patient.monitoring_status} />
```

| Prop | Type | Rule |
|---|---|---|
| `monitoringStatus` | any | Expected: `'stable'`, `'warning'`, `'critical'` or `'no_data'`. Anything else (missing, empty, other case, other value) is shown as `no_data`. |

Output: `<span>` with a soft background, a 2px solid border in the solid status color, an `aria-hidden` SVG icon (from `Icons.jsx`) and the label `t(statusToLabelKey(monitoringStatus))` as plain text, all in `--color-text`. It has no role and no live region. The caller adds the time of the last reading next to a `no_data` badge when a story needs it (out of scope here).

| Status | Icon | Spanish / English label |
|---|---|---|
| `stable` | `CheckCircleIcon` | Estable / Stable |
| `warning` | `TriangleAlertIcon` | Vigilar / Watch |
| `critical` | `OctagonXIcon` | Crítico / Critical |
| `no_data` | `CircleDashIcon` | Sin datos / No data |

## TriageLevelBadge (`TriageLevelBadge.jsx`)

```jsx
<TriageLevelBadge level={patient.triage_level} />
```

| Prop | Type | Rule |
|---|---|---|
| `level` | any | A whole number 1 to 5 shows `triageLevel.<n>` ("Triage I" to "Triage V"). Anything else, including `"3"`, `2.5`, `0`, `6`, `null` and `undefined`, shows `triageLevel.none` ("Sin nivel" / "No level"). |

Output: `<span>` with `bg-subtle` background, 1px `border-strong` border, `--color-text`, bold, `--radius-pill`. No icon, no status color. It does not compare or change levels; the range check only avoids showing a wrong label.

## Icons (`Icons.jsx`)

Named exports: `CheckCircleIcon`, `TriangleAlertIcon`, `OctagonXIcon`, `CircleDashIcon`. Each renders `<svg viewBox="0 0 24 24" width="1.25em" height="1.25em" aria-hidden="true" focusable="false">` with `fill="none"`, `stroke="currentColor"`, `strokeWidth="2"`. No props are needed. `OctagonXIcon` is also used by the login error box.

## AppShell and LoginPage changes (not new components)

- `AppShell.jsx`: the sign-out button becomes `<Button variant="secondary" onClick={signOut}>`; each language option becomes `<Button variant="secondary" aria-label={name} aria-pressed={lang === code} onClick={…}>`. Header classes move to `AppShell.module.css`. Structure, roles and labels stay the same, so the TS-05 and TS-06 tests keep passing. The header gets taller because buttons are 44px.
- `pages/login/LoginPage.jsx`: the submit button becomes `<Button type="submit" disabled={submitting}>`. The error becomes `<p role="alert" className={styles.error}><OctagonXIcon /><span>{t(shownKey)}</span></p>`. The form keeps its labels, `maxLength`, `required` and `autoComplete`.
- `pages/start/StartPage.jsx`: only its import paths change; its markup and behavior do not.
