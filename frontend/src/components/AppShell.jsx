// Shared page frame (TS-05): pinned disclaimer banner and ES/EN switch around every screen.
// The banner has no close or hide control. When signed in (TS-06), the header also shows the
// user's name, translated role and a sign-out button.
import { useAuth } from '../auth/AuthContext.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { LANGUAGES } from '../i18n/translations.js'

export default function AppShell({ children }) {
  const { lang, setLang, t } = useLanguage()
  const { user, signOut } = useAuth()

  return (
    <>
      <header className="app-header">
        <p className="disclaimer" role="note">
          {t('disclaimer.text')}
        </p>
        {user && (
          <div className="user-block" role="group" aria-label={t('auth.signedInAs')}>
            <span className="user-name">{user.full_name}</span>
            <span className="user-role">{t('role.' + user.role)}</span>
            <button type="button" onClick={signOut}>
              {t('auth.logout')}
            </button>
          </div>
        )}
        <div className="language-switch" role="group" aria-label={t('language.label')}>
          {LANGUAGES.map(({ code, short, name }) => (
            <button
              key={code}
              type="button"
              aria-label={name}
              aria-pressed={lang === code}
              onClick={() => setLang(code)}
            >
              {short}
            </button>
          ))}
        </div>
      </header>
      {children}
    </>
  )
}
