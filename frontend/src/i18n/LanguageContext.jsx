// Current UI language (TS-05): React Context with { lang, setLang, t }.
// The choice is remembered in localStorage when the browser allows it; Spanish otherwise.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { DEFAULT_LANGUAGE, interpolate, translate } from './translations.js'

const STORAGE_KEY = 'pdm.language'

// Only 'es' or 'en' is accepted from storage; anything else, or blocked storage, gives Spanish.
function readStoredLanguage() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    if (value === 'es' || value === 'en') return value
  } catch {
    // Storage blocked or unavailable: use the default language.
  }
  return DEFAULT_LANGUAGE
}

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(readStoredLanguage)

  const setLang = useCallback((next) => {
    if (next !== 'es' && next !== 'en') return
    setLangState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* not remembered; works for this visit */
    }
  }, [])

  // Keep <html lang> and the tab title in the selected language.
  useEffect(() => {
    document.documentElement.lang = lang
    document.title = translate(lang, 'app.title')
  }, [lang])

  const t = useCallback((key, values) => interpolate(translate(lang, key), values), [lang])

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (context === null) {
    throw new Error('useLanguage must be used inside LanguageProvider')
  }
  return context
}
