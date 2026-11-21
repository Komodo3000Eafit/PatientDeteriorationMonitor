// Presentation helper (US-03 change request): shows a number with the decimal separator of the
// UI language ("36,8" in Spanish, "36.8" in English). Whole numbers and other text are unchanged.

const DECIMAL_PATTERN = /^-?\d+\.\d+$/

export function formatDecimal(value, lang) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (lang === 'es' && DECIMAL_PATTERN.test(text)) return text.replace('.', ',')
  return text
}
