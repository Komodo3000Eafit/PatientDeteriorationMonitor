// Login page at /login (TS-06, TS-13), shown inside AppShell. When signed in it redirects to the
// remembered page (only safe internal paths, see returnPath) or /patients. All texts from
// src/i18n/translations.js. The message is kept as a key, so switching language translates a
// message already shown.
import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import { ApiError } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { returnPath } from '../../auth/returnPath.js'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import styles from './LoginPage.module.css'
import Button from '../../components/Button.jsx'
import Card from '../../components/Card.jsx'
import { OctagonXIcon } from '../../components/Icons.jsx'

export default function LoginPage() {
  const { user, signIn, sessionExpired } = useAuth()
  const { t } = useLanguage()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorKey, setErrorKey] = useState(null)

  // On success the page unmounts; no state updates after that.
  const mounted = useRef(true)
  // Synchronous guard so a second submit never sends a second request.
  const inFlight = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // All hooks above run on every render; only now may the page leave.
  if (user) return <Navigate to={returnPath(location.state)} replace />

  const shownKey = errorKey ?? (sessionExpired ? 'login.sessionExpired' : null)

  async function onSubmit(event) {
    event.preventDefault()
    if (submitting || inFlight.current) return
    inFlight.current = true
    setSubmitting(true)
    setErrorKey(null)
    try {
      await signIn(username, password)
    } catch (err) {
      // Never show the error itself; only fixed texts.
      if (mounted.current) {
        if (err instanceof ApiError && err.status === 401) {
          setErrorKey('login.invalidCredentials')
          setPassword('')
        } else {
          setErrorKey('login.unreachable')
        }
      }
    } finally {
      inFlight.current = false
      if (mounted.current) setSubmitting(false)
    }
  }

  return (
    <main className={styles.page}>
      <h1>{t('app.title')}</h1>
      <Card>
        <h2>{t('login.title')}</h2>
        <form className={styles.form} onSubmit={onSubmit} noValidate={false}>
          <label htmlFor="login-username">{t('login.username')}</label>
          <input
            id="login-username"
            name="username"
            autoComplete="username"
            maxLength={50}
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <label htmlFor="login-password">{t('login.password')}</label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {shownKey && (
            <p role="alert" className={styles.error}>
              <OctagonXIcon />
              <span>{t(shownKey)}</span>
            </p>
          )}
          <Button type="submit" disabled={submitting}>
            {t(submitting ? 'login.submitting' : 'login.submit')}
          </Button>
        </form>
      </Card>
    </main>
  )
}
