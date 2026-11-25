// Chart parameter definitions (US-06, research R4, data-model.md "Chart parameter"). UI only:
// each entry maps a selectable parameter to its translation key and to the stored value it reads
// from a reading. The NEWS2 score reads the stored total and is never recomputed here
// (constitution Principle V); there are no thresholds, ranges or axis min/max.
// The parameter labels already carry their units (translations.js parameter.*).

// Exactly six parameters, in display order. No on_oxygen, no consciousness.
export const CHART_PARAMETERS = [
  { key: 'score', labelKey: 'recordReading.score', value: (r) => r.score.total },
  { key: 'respiratory_rate', labelKey: 'parameter.respiratory_rate', value: (r) => r.respiratory_rate },
  { key: 'spo2', labelKey: 'parameter.spo2', value: (r) => r.spo2 },
  { key: 'systolic_bp', labelKey: 'parameter.systolic_bp', value: (r) => r.systolic_bp },
  { key: 'heart_rate', labelKey: 'parameter.heart_rate', value: (r) => r.heart_rate },
  { key: 'temperature', labelKey: 'parameter.temperature', value: (r) => Number(r.temperature) },
]

export const DEFAULT_PARAMETER = 'score'

// Build the chart points for one parameter. The API returns readings newest first; the chart draws
// oldest → newest, so the readings are reversed once. The same array feeds the line and the hidden
// table. Returns [{ recordedAt: Date, value: number }].
export function toPoints(readings, parameterKey) {
  const parameter = CHART_PARAMETERS.find((p) => p.key === parameterKey)
  if (!parameter || !Array.isArray(readings)) return []
  return readings
    .slice()
    .reverse()
    .map((reading) => ({
      recordedAt: new Date(reading.recorded_at),
      value: parameter.value(reading),
    }))
}
