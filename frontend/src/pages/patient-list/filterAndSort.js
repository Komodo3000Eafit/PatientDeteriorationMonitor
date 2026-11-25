// Pure client-side filter and sort for the patient list (US-09).
// Compares only stored values (triage_level, identifier, latest_score.total,
// latest_score.recorded_at); it never reads the risk band or any NEWS2 threshold.
// Rows without a reading (latest_score === null) always go last, in API order,
// when sorting by score or latest reading.

export const SORT_DEFAULT_DIRECTION = {
  triage: 'asc',
  score: 'desc',
  code: 'asc',
  latest: 'desc',
}

const SORT_KEYS = {
  triage: (patient) => patient.triage_level,
  code: (patient) => patient.identifier,
  score: (patient) => patient.latest_score.total,
  latest: (patient) => Date.parse(patient.latest_score.recorded_at),
}

const NEEDS_READING = { score: true, latest: true }

function compareValues(a, b) {
  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b)
  }
  return a - b
}

function sortRows(rows, column, direction) {
  const getKey = SORT_KEYS[column]
  const sign = direction === 'desc' ? -1 : 1
  // Copy first: Array.prototype.sort is stable but sorts in place.
  return [...rows].sort((a, b) => sign * compareValues(getKey(a), getKey(b)))
}

export function filterAndSort(patients, filter, sort) {
  const filtered =
    filter.triageLevel === null
      ? [...patients]
      : patients.filter((patient) => patient.triage_level === filter.triageLevel)

  if (sort.column === null || !SORT_KEYS[sort.column]) {
    return filtered
  }

  if (!NEEDS_READING[sort.column]) {
    return sortRows(filtered, sort.column, sort.direction)
  }

  const withReading = filtered.filter((patient) => patient.latest_score != null)
  const withoutReading = filtered.filter((patient) => patient.latest_score == null)
  return [...sortRows(withReading, sort.column, sort.direction), ...withoutReading]
}
