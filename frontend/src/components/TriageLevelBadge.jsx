// Displays a level; never computes or changes it.
import { useLanguage } from '../i18n/LanguageContext.jsx'
import styles from './TriageLevelBadge.module.css'

export default function TriageLevelBadge({ level }) {
  const { t } = useLanguage()
  const isValid = Number.isInteger(level) && level >= 1 && level <= 5
  const labelKey = isValid ? `triageLevel.${level}` : 'triageLevel.none'

  return <span className={styles.badge}>{t(labelKey)}</span>
}
