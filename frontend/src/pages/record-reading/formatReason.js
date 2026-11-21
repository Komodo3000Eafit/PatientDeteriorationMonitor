// Display helpers for one stored explanation entry (US-03). Presentation only: they turn the
// matched range or category returned by the backend into text and never compute points.
// Numbers use the decimal separator of the UI language (change request 2026-11-20).
import { formatDecimal } from '../../utils/formatNumber.js'

// The entry's matched range as text: "21–24", "38,1–39,0", "≤ 8", "≥ 25", "Sí" / "No" or "C, V, P, U".
export function formatReason(entry, t, lang) {
  const { parameter, low, high, category } = entry
  const hasLow = low !== null && low !== undefined
  const hasHigh = high !== null && high !== undefined
  if (hasLow && hasHigh) return `${formatDecimal(low, lang)}–${formatDecimal(high, lang)}`
  if (hasHigh) return `≤ ${formatDecimal(high, lang)}`
  if (hasLow) return `≥ ${formatDecimal(low, lang)}`
  if (Array.isArray(category) && category.length > 0) {
    if (parameter === 'on_oxygen') return category.map((item) => t('yesNo.' + item)).join(', ')
    return category.join(', ')
  }
  return ''
}

// The entry's value as text: "Sí" / "No" for on oxygen, "A — Alerta" for consciousness, "36,8".
export function formatValue(entry, t, lang) {
  const { parameter, value } = entry
  if (parameter === 'on_oxygen') return t(value ? 'yesNo.true' : 'yesNo.false')
  if (parameter === 'consciousness') return `${value} — ${t('consciousness.' + value)}`
  return formatDecimal(value, lang)
}
