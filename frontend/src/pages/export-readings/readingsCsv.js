// Builds the vital signs CSV from stored readings (US-10). Pure: no scoring, no sorting, no network.
import { isPatientCode } from '../../utils/patientCode.js'

// Fixed English header, in this order (spec AC2).
export const CSV_COLUMNS = [
  'recorded_at',
  'respiratory_rate',
  'spo2',
  'on_oxygen',
  'systolic_bp',
  'heart_rate',
  'consciousness',
  'temperature',
  'news2_total',
  'risk_band',
]

// One CSV field: neutralize formula triggers first (CSV-injection guard), then quote per RFC 4180.
export function csvField(value) {
  let text = String(value)
  if (/^[=+\-@\t\r]/.test(text)) {
    text = "'" + text
  }
  if (/[",\r\n]/.test(text)) {
    return '"' + text.replaceAll('"', '""') + '"'
  }
  return text
}

// One CSV record ending with CRLF.
function csvRecord(fields) {
  return fields.map(csvField).join(',') + '\r\n'
}

// Header record plus one record per reading, in the given order. Values are written as received;
// the score is the stored one (score.total, score.band), never recomputed. No BOM.
export function buildReadingsCsv(readings) {
  let text = csvRecord(CSV_COLUMNS)
  for (const r of readings) {
    text += csvRecord([
      r.recorded_at,
      r.respiratory_rate,
      r.spo2,
      r.on_oxygen,
      r.systolic_bp,
      r.heart_rate,
      r.consciousness,
      r.temperature,
      r.score.total,
      r.score.band,
    ])
  }
  return text
}

// `<code>-vital-signs-<YYYY-MM-DD>.csv` from the local date, or null for an invalid patient code.
export function exportFileName(identifier, date = new Date()) {
  if (!isPatientCode(identifier)) return null
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${identifier}-vital-signs-${yyyy}-${mm}-${dd}.csv`
}
