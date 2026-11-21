// Open re-triage suggestions banner (US-04 CR1), mounted at the top of the patient list page
// inside <RequireAuth>. On mount it fetches GET /api/suggestions (all open suggestions across
// patients, newest first) and lists each one with the patient code, a severity badge and the
// suggested triage level, linking to the patient's detail page. No accept/dismiss here.
// The frontend never computes a band, score, severity or suggested level — it shows what the API
// returns (constitution Principle V). Contract: specs/020-retriage-suggestion-alerts/contracts/
// retriage-api.md ("GET /api/suggestions") and contracts/ui.md.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, OctagonXIcon, TriangleAlertIcon } from 'lucide-react'
import { ApiError, apiGet } from '../../api/client.js'
import TriageLevelBadge from '../../components/TriageLevelBadge.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import styles from './OpenSuggestionsBanner.module.css'

// Severity drives the chip style only (never the only cue): the solid color is the border and the
// icon tint, the label stays var(--color-text). high -> critical tokens + OctagonX (red);
// medium -> warning tokens + TriangleAlert (yellow). The backend decides the severity.
const SEVERITY = {
  high: { tone: 'high', Icon: OctagonXIcon },
  medium: { tone: 'medium', Icon: TriangleAlertIcon },
}

function SeverityBadge({ severity }) {
  const { t } = useLanguage()
  const config = SEVERITY[severity]
  if (!config) return null
  const { tone, Icon } = config

  return (
    <span className={`${styles.severity} ${styles[tone]}`}>
      <Icon className={styles.icon} aria-hidden="true" focusable="false" size="1.25em" />
      <span className={styles.label}>{t('retriage.severity.' + severity)}</span>
    </span>
  )
}

// The banner re-fetches on a timer so new or handled suggestions appear without a manual reload.
const POLL_INTERVAL_MS = 60000

export default function OpenSuggestionsBanner() {
  const { t } = useLanguage()
  const [suggestions, setSuggestions] = useState([])
  const [errorKey, setErrorKey] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  // After a 401 the component unmounts; no state updates after that.
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true

    // One fetch. ``initial`` true for the first load (shows the loading/error state); a background
    // poll never blanks the banner and a failed poll keeps the last good list on screen.
    const load = (initial) =>
      apiGet('/api/suggestions').then(
        (data) => {
          if (!mounted.current) return
          setSuggestions(data?.suggestions ?? [])
          setErrorKey(null)
          if (initial) setIsLoading(false)
        },
        (err) => {
          if (!mounted.current) return
          // A 401 is handled by the client's session-expiry handling; stop here.
          if (err instanceof ApiError && err.status === 401) return
          // Only the first load surfaces the error; a failed poll keeps the current list.
          if (initial) {
            setErrorKey('retriage.listError')
            setIsLoading(false)
          }
        },
      )

    load(true)
    const timer = setInterval(() => load(false), POLL_INTERVAL_MS)

    return () => {
      mounted.current = false
      clearInterval(timer)
    }
  }, [])

  // While loading show nothing.
  if (isLoading) return null

  if (errorKey) {
    return (
      <section className={styles.banner} aria-labelledby="open-suggestions-title">
        <h2 id="open-suggestions-title" className={styles.title}>
          {t('retriage.listTitle')}
        </h2>
        <p role="alert" className={styles.message}>
          {t(errorKey)}
        </p>
      </section>
    )
  }

  if (suggestions.length === 0) {
    return (
      <section className={styles.banner} aria-labelledby="open-suggestions-title">
        <h2 id="open-suggestions-title" className={styles.title}>
          {t('retriage.listTitle')}
        </h2>
        <p className={styles.message}>{t('retriage.listEmpty')}</p>
      </section>
    )
  }

  return (
    <section className={styles.banner} aria-labelledby="open-suggestions-title">
      <h2 id="open-suggestions-title" className={styles.title}>
        {t('retriage.listTitle')}
      </h2>
      <ul className={styles.list}>
        {suggestions.map((item) => (
          <li key={item.id} className={styles.row}>
            <Link className={styles.patient} to={'/patients/' + item.patient_code}>
              {t('retriage.patient', { code: item.patient_code })}
            </Link>
            <SeverityBadge severity={item.severity} />
            <span
              className={styles.transition}
              aria-label={t('retriage.transition', {
                from: item.current_level,
                to: item.suggested_level,
              })}
            >
              <TriageLevelBadge level={item.current_level} />
              <ArrowRight
                className={styles.arrow}
                aria-hidden="true"
                focusable="false"
                size="1.25em"
              />
              <TriageLevelBadge level={item.suggested_level} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
