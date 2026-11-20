// Presentation helpers (TS-12): no clinical logic; the backend computes the monitoring status

export const MONITORING_STATUSES = ['stable', 'warning', 'critical', 'no_data']

// Returns the status itself when it is exactly one of the four values, otherwise 'no_data'.
export function normalizeMonitoringStatus(value) {
  return MONITORING_STATUSES.includes(value) ? value : 'no_data'
}

// → { name: 'stable' | 'warning' | 'critical' | 'no-data',
//     color: '--color-stable' …,  soft: '--color-stable-soft' … }
export function statusToToken(monitoringStatus) {
  const normalized = normalizeMonitoringStatus(monitoringStatus)
  const name = normalized.replace('_', '-')
  return {
    name,
    color: `--color-${name}`,
    soft: `--color-${name}-soft`,
  }
}

// → 'monitoringStatus.stable' | '.warning' | '.critical' | '.no_data'
export function statusToLabelKey(monitoringStatus) {
  return `monitoringStatus.${normalizeMonitoringStatus(monitoringStatus)}`
}
