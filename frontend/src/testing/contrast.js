// WCAG 2.1 relative-luminance contrast ratio helper (not shipped). No library.
// See specs/012-ui-foundation/contracts/helpers-and-guards.md.

function channelLuminance(value) {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(hex) {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((d) => d + d).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
}

// Contrast ratio of two hex colors (3- or 6-digit, '#' optional).
// contrastRatio('#000000', '#FFFFFF') === 21 (pure black/white gives 21 exactly).
export function contrastRatio(hexA, hexB) {
  const la = relativeLuminance(hexA)
  const lb = relativeLuminance(hexB)
  const [lmax, lmin] = la >= lb ? [la, lb] : [lb, la]
  return (lmax + 0.05) / (lmin + 0.05)
}
