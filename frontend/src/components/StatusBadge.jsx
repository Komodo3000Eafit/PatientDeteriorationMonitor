// Status badge (TS-12): displays the backend-computed monitoring status with color, icon and
// label. It never computes the status; foreground text and icon stay var(--color-text).
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { statusToLabelKey, statusToToken } from '../utils/monitoringStatus.js'
import { CheckCircleIcon, CircleDashIcon, OctagonXIcon, TriangleAlertIcon } from './Icons.jsx'
import styles from './StatusBadge.module.css'

const ICONS = {
  stable: CheckCircleIcon,
  warning: TriangleAlertIcon,
  critical: OctagonXIcon,
  'no-data': CircleDashIcon,
}

export default function StatusBadge({ monitoringStatus }) {
  const { t } = useLanguage()
  const { name } = statusToToken(monitoringStatus)
  const Icon = ICONS[name]
  const label = t(statusToLabelKey(monitoringStatus))

  return (
    <span className={`${styles.badge} ${styles[name]}`}>
      <Icon />
      <span>{label}</span>
    </span>
  )
}
