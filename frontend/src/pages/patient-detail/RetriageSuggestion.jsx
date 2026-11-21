// Re-triage suggestion component (US-04), mounted on the patient detail area inside <RequireAuth>.
// Shows the newest open re-triage suggestion for a patient, read-only for a nurse and with
// Accept/Dismiss for a doctor. Everything shown comes from the backend: the frontend never computes
// a band, score, severity or suggested level (constitution Principle V).
// Contract: specs/020-retriage-suggestion-alerts/contracts/ui.md. Follows RecordReadingPage.jsx's
// patterns: a `mounted` ref, a synchronous double-submit guard, and state kept as translation keys
// so switching language keeps what is shown and re-renders it in the new language.
import { useEffect, useRef, useState } from 'react'
import { ApiError, apiGet, apiPost } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import Button from '../../components/Button.jsx'
import Card from '../../components/Card.jsx'
import TriageLevelBadge from '../../components/TriageLevelBadge.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import RiskBandBadge from '../record-reading/RiskBandBadge.jsx'
import styles from './RetriageSuggestion.module.css'

// The raising risk band shown by the badge is derived from the alert severity only (never computed
// another way): severity 'medium' -> band 'medium', 'high' -> band 'high'.
const SEVERITY_TO_BAND = { medium: 'medium', high: 'high' }

export default function RetriageSuggestion({ identifier }) {
  const { user } = useAuth()
  const { t } = useLanguage()
  const [suggestion, setSuggestion] = useState(null)
  const [loadErrorKey, setLoadErrorKey] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  // Result of an accept/dismiss action, kept as a key so a language switch re-renders it.
  const [actionResult, setActionResult] = useState(null)
  const [actionErrorKey, setActionErrorKey] = useState(null)
  const [isActing, setIsActing] = useState(false)

  // After a 401 the component unmounts; no state updates after that.
  const mounted = useRef(true)
  // Synchronous guard so a second click never sends a second request.
  const inFlight = useRef(false)

  useEffect(() => {
    mounted.current = true
    setIsLoading(true)
    setLoadErrorKey(null)
    apiGet('/api/patients/' + identifier + '/suggestions').then(
      (data) => {
        if (!mounted.current) return
        const open = (data?.suggestions ?? []).find((item) => item.status === 'open') ?? null
        setSuggestion(open)
        setIsLoading(false)
      },
      (err) => {
        if (!mounted.current) return
        // A 401 is handled by the client's session-expiry handling; show nothing here.
        if (err instanceof ApiError && err.status === 401) return
        setLoadErrorKey('retriage.loadError')
        setIsLoading(false)
      },
    )
    return () => {
      mounted.current = false
    }
  }, [identifier])

  // While loading show nothing (AC15 shows the "none" message only after the load resolves).
  if (isLoading) return null
  if (loadErrorKey) {
    return (
      <Card title={t('retriage.title')}>
        <p className={styles.message}>{t(loadErrorKey)}</p>
      </Card>
    )
  }
  if (!suggestion) {
    return (
      <Card title={t('retriage.title')}>
        <p className={styles.message}>{t('retriage.none')}</p>
      </Card>
    )
  }

  const isDoctor = user?.role === 'doctor'
  const band = SEVERITY_TO_BAND[suggestion.severity]

  async function act(action) {
    if (isActing || inFlight.current) return
    inFlight.current = true
    setIsActing(true)
    setActionErrorKey(null)
    try {
      const updated = await apiPost(
        '/api/patients/' + identifier + '/suggestions/' + suggestion.id + '/' + action,
        {},
      )
      if (!mounted.current) return
      if (action === 'accept') {
        setActionResult({ key: 'retriage.accepted', level: updated.current_level })
      } else {
        setActionResult({ key: 'retriage.dismissed', level: null })
      }
    } catch (err) {
      if (!mounted.current) return
      // A 401 is handled by the client's session-expiry handling; keep the suggestion otherwise.
      if (err instanceof ApiError && err.status === 401) return
      setActionErrorKey('retriage.actionError')
    } finally {
      inFlight.current = false
      if (mounted.current) setIsActing(false)
    }
  }

  return (
    <Card title={t('retriage.title')}>
      <div className={styles.content}>
        <RiskBandBadge band={band} />
        <p className={styles.severity}>{t('retriage.severity.' + suggestion.severity)}</p>
        <div className={styles.levels}>
          <div className={styles.level}>
            <span className={styles.levelLabel}>{t('retriage.currentLevel')}</span>
            <TriageLevelBadge level={suggestion.current_level} />
          </div>
          <div className={styles.level}>
            <span className={styles.levelLabel}>{t('retriage.suggestedLevel')}</span>
            <TriageLevelBadge level={suggestion.suggested_level} />
          </div>
        </div>
        <p className={styles.reason}>{suggestion.reason}</p>

        {isDoctor && (
          <div className={styles.actions}>
            <Button onClick={() => act('accept')} disabled={isActing}>
              {t('retriage.accept')}
            </Button>
            <Button variant="secondary" onClick={() => act('dismiss')} disabled={isActing}>
              {t('retriage.dismiss')}
            </Button>
          </div>
        )}

        {actionResult && (
          <p role="status" className={styles.result}>
            <span>{t(actionResult.key)}</span>
            {actionResult.level != null && <TriageLevelBadge level={actionResult.level} />}
          </p>
        )}
        {actionErrorKey && (
          <p role="alert" className={styles.message}>
            {t(actionErrorKey)}
          </p>
        )}
      </div>
    </Card>
  )
}
