// Shared page frame (TS-05): pinned disclaimer banner and ES/EN switch around every screen.
// The banner has no close or hide control. When signed in (TS-06), the header also shows the
// user's name, translated role and a sign-out button; signing out ends on /login (TS-13).
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { LANGUAGES } from '../i18n/translations.js'
import styles from './AppShell.module.css'
import Button from './Button.jsx'
import { HeartPulseIcon, HouseIcon, TriangleAlertIcon } from './Icons.jsx'

export default function AppShell({ children }) {
  const { lang, setLang, t } = useLanguage()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    signOut()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <header className={styles.header}>
        {/* Scope change 2026-11-22: the brand (logo + title) is always visible for consistent
            branding. Signed in it is a Link to /patients; signed out it is plain, non-linked
            branding, because /patients is protected and a signed-out visitor cannot reach it. */}
        {user ? (
          <Link to="/patients" className={styles.brand}>
            <HeartPulseIcon />
            {t('app.title')}
          </Link>
        ) : (
          <span className={styles.brand}>
            <HeartPulseIcon />
            {t('app.title')}
          </span>
        )}
        {/* The Home control stays auth-gated: it is a navigation action to a protected route. */}
        {user && (
          <Link to="/patients" className={styles.homeLink}>
            <HouseIcon />
            {t('nav.home')}
          </Link>
        )}
        <p className={styles.disclaimer} role="note">
          <TriangleAlertIcon />
          <span>{t('disclaimer.text')}</span>
        </p>
        {user && (
          <div className={styles.userBlock} role="group" aria-label={t('auth.signedInAs')}>
            <span className={styles.userName}>{user.full_name}</span>
            <span>{t('role.' + user.role)}</span>
            <Button variant="secondary" onClick={handleLogout}>
              {t('auth.logout')}
            </Button>
          </div>
        )}
        <div className={styles.languageSwitch} role="group" aria-label={t('language.label')}>
          {LANGUAGES.map(({ code, short, name }) => (
            <Button
              key={code}
              variant="secondary"
              aria-label={name}
              aria-pressed={lang === code}
              onClick={() => setLang(code)}
            >
              {short}
            </Button>
          ))}
        </div>
      </header>
      {children}
    </>
  )
}
