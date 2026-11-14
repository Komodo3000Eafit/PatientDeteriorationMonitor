// All UI texts (TS-05). Spanish (es) is the complete reference; a key missing in English shows
// the Spanish text. Add every new text here in both languages; see frontend/README.md.

export const DEFAULT_LANGUAGE = 'es'

export const LANGUAGES = [
  { code: 'es', short: 'ES', name: 'Español' },
  { code: 'en', short: 'EN', name: 'English' },
]

export const translations = {
  es: {
    'app.title': 'Monitor de Deterioro del Paciente',
    'disclaimer.text': 'Prototipo académico: no es un dispositivo médico certificado.',
    'language.label': 'Idioma',
    'health.checking': 'Comprobando la conexión con el servidor…',
    'health.apiOk': 'API: funcionando',
    'health.version': 'Versión: {version}',
    'health.databaseOk': 'Base de datos: disponible',
    'health.databaseUnavailable': 'Base de datos: no disponible',
    'health.unreachable': 'No se puede conectar con el servidor.',
    'health.reloadHint': 'Recarga la página para volver a comprobar.',
    'login.title': 'Iniciar sesión',
    'login.username': 'Usuario',
    'login.password': 'Contraseña',
    'login.submit': 'Entrar',
    'login.submitting': 'Entrando…',
    'login.invalidCredentials': 'Usuario o contraseña incorrectos.',
    'login.unreachable': 'No se puede conectar con el servidor. Inténtalo de nuevo.',
    'login.sessionExpired': 'Tu sesión ha terminado. Inicia sesión de nuevo.',
    'auth.signedInAs': 'Sesión iniciada',
    'auth.logout': 'Cerrar sesión',
    'role.doctor': 'Médico',
    'role.nurse': 'Enfermero(a)',
  },
  en: {
    'app.title': 'Patient Deterioration Monitor',
    'disclaimer.text': 'Academic prototype: not a certified medical device.',
    'language.label': 'Language',
    'health.checking': 'Checking the connection to the server…',
    'health.apiOk': 'API: running',
    'health.version': 'Version: {version}',
    'health.databaseOk': 'Database: available',
    'health.databaseUnavailable': 'Database: not available',
    'health.unreachable': 'Cannot connect to the server.',
    'health.reloadHint': 'Reload the page to check again.',
    'login.title': 'Sign in',
    'login.username': 'Username',
    'login.password': 'Password',
    'login.submit': 'Sign in',
    'login.submitting': 'Signing in…',
    'login.invalidCredentials': 'Incorrect username or password.',
    'login.unreachable': 'Cannot connect to the server. Please try again.',
    'login.sessionExpired': 'Your session has ended. Please sign in again.',
    'auth.signedInAs': 'Signed in',
    'auth.logout': 'Sign out',
    'role.doctor': 'Doctor',
    'role.nurse': 'Nurse',
  },
}

// Text for a key in the given language; falls back to Spanish, then to the key itself.
export function translate(lang, key, dict = translations) {
  return dict[lang]?.[key] ?? dict.es[key] ?? key
}

// Replaces each {name} with values[name]; unknown names are left as they are.
export function interpolate(text, values) {
  if (!values) return text
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match))
}
