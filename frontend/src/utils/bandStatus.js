// Presentation helper (US-03 change request): maps a stored risk band to a badge style; no clinical logic.
// The band always comes from the backend; this only picks the tone, icon name and label key.
// Contract: specs/017-vital-signs-scoring/contracts/ui.md "Risk band badge".

export const RISK_BANDS = ['low', 'low-medium', 'medium', 'high']

const BAND_STYLES = {
  low: { tone: 'stable', icon: 'CheckCircle', labelKey: 'riskBand.low' },
  'low-medium': { tone: 'warning', icon: 'TriangleAlert', labelKey: 'riskBand.low-medium' },
  medium: { tone: 'band-medium', icon: 'CircleAlert', labelKey: 'riskBand.medium' },
  high: { tone: 'critical', icon: 'OctagonX', labelKey: 'riskBand.high' },
}

const UNKNOWN_BAND_STYLE = { tone: 'no-data', icon: 'CircleDashed', labelKey: 'riskBand.unknown' }

// { tone, icon, labelKey } for a stored band; anything else gives the "unknown" style.
export function bandStatus(band) {
  return Object.hasOwn(BAND_STYLES, band) ? BAND_STYLES[band] : UNKNOWN_BAND_STYLE
}
