// Display helpers for one stored explanation entry (US-03). Presentation only: they turn the
// matched range or category returned by the backend into text and never compute points.

// The entry's matched range as text: "21–24", "≤ 8", "≥ 25", "Sí" / "No" or "C, V, P, U".
export function formatReason(entry, t) {
  const { parameter, low, high, category } = entry
  const hasLow = low !== null && low !== undefined
  const hasHigh = high !== null && high !== undefined
  if (hasLow && hasHigh) return `${low}–${high}`
  if (hasHigh) return `≤ ${high}`
  if (hasLow) return `≥ ${low}`
  if (Array.isArray(category) && category.length > 0) {
    if (parameter === 'on_oxygen') return category.map((item) => t('yesNo.' + item)).join(', ')
    return category.join(', ')
  }
  return ''
}

// The entry's value as text: "Sí" / "No" for on oxygen, "A — Alerta" for consciousness.
export function formatValue(entry, t) {
  const { parameter, value } = entry
  if (parameter === 'on_oxygen') return t(value ? 'yesNo.true' : 'yesNo.false')
  if (parameter === 'consciousness') return `${value} — ${t('consciousness.' + value)}`
  return String(value)
}
