// Risk band badge (US-03 change request): shows the stored risk band returned by the backend with
// color, a decorative icon and a text label. It never computes a band; bandStatus picks the style.
// Contract: specs/017-vital-signs-scoring/contracts/ui.md "Risk band badge".
import { CheckCircle, CircleAlert, CircleDashed, OctagonX, TriangleAlert } from 'lucide-react'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { bandStatus } from '../../utils/bandStatus.js'
import styles from './RiskBandBadge.module.css'

const ICONS = { CheckCircle, TriangleAlert, CircleAlert, OctagonX, CircleDashed }

export default function RiskBandBadge({ band }) {
  const { t } = useLanguage()
  const { tone, icon, labelKey } = bandStatus(band)
  const Icon = ICONS[icon]

  return (
    <span className={`${styles.badge} ${styles[tone]}`}>
      <Icon aria-hidden="true" focusable="false" size="1.25em" />
      <span>{t(labelKey)}</span>
    </span>
  )
}
