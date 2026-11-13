// Shared page frame (TS-05): pinned disclaimer banner and ES/EN switch around every screen.
// The banner has no close or hide control.
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { LANGUAGES } from '../i18n/translations.js'

export default function AppShell({ children }) {
  const { lang, setLang, t } = useLanguage()

  return (
    <>
      <header className="app-header">
        <p className="disclaimer" role="note">
          {t('disclaimer.text')}
        </p>
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
