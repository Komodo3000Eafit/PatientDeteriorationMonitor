// Score badge (US-02 change request 2026-11-21): one pill with the latest NEWS2 total and its stored
// risk band, e.g. "19 · Alta". Displays backend values only; bandStatus picks tone, icon and label,
// it never computes a band (Principle V). The pill is role="img" with a full accessible name.
// Contract: specs/016-patient-list/contracts/ui.md "Score badge (ScoreBadge)".
import { CheckCircle, CircleAlert, CircleDashed, OctagonX, TriangleAlert } from 'lucide-react'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { bandStatus } from '../../utils/bandStatus.js'
import styles from './ScoreBadge.module.css'

const ICONS = { CheckCircle, TriangleAlert, CircleAlert, OctagonX, CircleDashed }

export default function ScoreBadge({ total, band }) {
  const { t } = useLanguage()
  const { tone, icon, labelKey } = bandStatus(band)
  const Icon = ICONS[icon]
  const label = t(labelKey)

  return (
    <span
      role="img"
      aria-label={t('patientList.scoreLabel', { score: total, band: label })}
      className={`${styles.badge} ${styles[tone]}`}
    >
      <Icon aria-hidden="true" focusable="false" size="1.25em" />
      <span>{`${total} · ${label}`}</span>
    </span>
  )
}
