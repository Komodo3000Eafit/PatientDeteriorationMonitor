// Patient list placeholder (TS-13) until US-02 replaces it; keeps the TS-04 /health check, once per load.
// All texts come from src/i18n/translations.js; switching language never calls /health again.
import { useEffect, useState } from 'react'
import { getHealth } from '../../api/client.js'
import Card from '../../components/Card.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

export default function PatientListPage() {
  const { t } = useLanguage()
  const [state, setState] = useState({ kind: 'checking' })

  // Runs once per load: t is deliberately not a dependency.
  useEffect(() => {
    let cancelled = false
    getHealth().then(
      (health) => {
        if (!cancelled) {
          setState({
            kind: health.database === 'ok' ? 'ok' : 'databaseUnavailable',
            version: health.version,
          })
        }
      },
      () => {
        // Never show the error itself; the page uses its own fixed text.
        if (!cancelled) setState({ kind: 'unreachable' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main>
      <h1>{t('app.title')}</h1>
      <Card title={t('patients.title')}>
        <p>{t('patients.placeholder')}</p>
      </Card>
      <section role="status">
        {state.kind === 'checking' && <p>{t('health.checking')}</p>}
        {state.kind === 'ok' && (
          <>
            <p>{t('health.apiOk')}</p>
            <p>{t('health.version', { version: state.version })}</p>
            <p>{t('health.databaseOk')}</p>
          </>
        )}
        {state.kind === 'databaseUnavailable' && (
          <>
            <p>{t('health.apiOk')}</p>
            <p>{t('health.version', { version: state.version })}</p>
            <p>{t('health.databaseUnavailable')}</p>
            <p>{t('health.reloadHint')}</p>
          </>
        )}
        {state.kind === 'unreachable' && (
          <>
            <p>{t('health.unreachable')}</p>
            <p>{t('health.reloadHint')}</p>
          </>
        )}
      </section>
    </main>
  )
}
