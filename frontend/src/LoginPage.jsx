// Login page (TS-06), shown inside AppShell while signed out. All texts from src/i18n/translations.js.
// The message is kept as a key, so switching language translates a message already shown.
import { useEffect, useRef, useState } from 'react'
import { ApiError } from './api/client.js'
import { useAuth } from './auth/AuthContext.jsx'
import { useLanguage } from './i18n/LanguageContext.jsx'

export default function LoginPage() {
  const { signIn, sessionExpired } = useAuth()
  const { t } = useLanguage()
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
    <main>
      <h1>{t('app.title')}</h1>
      <h2>{t('login.title')}</h2>
      <form className="login-form" onSubmit={onSubmit} noValidate={false}>
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
        {shownKey && <p role="alert">{t(shownKey)}</p>}
        <button type="submit" disabled={submitting}>
          {t(submitting ? 'login.submitting' : 'login.submit')}
        </button>
      </form>
    </main>
  )
}
