// Browser session (TS-06): token + user in sessionStorage['pdm.session'] (one tab), with an in-memory copy for blocked storage.

export const SESSION_KEY = 'pdm.session'

let memory = null

function isNonEmptyString(value) {
  return typeof value === 'string' && value !== ''
}

function isValid(s) {
  return (
    s !== null &&
    typeof s === 'object' &&
    isNonEmptyString(s.token) &&
    s.user !== null &&
    typeof s.user === 'object' &&
    isNonEmptyString(s.user.username) &&
    isNonEmptyString(s.user.full_name) &&
    isNonEmptyString(s.user.role)
  )
}

// Stored session if valid, otherwise the in-memory copy, or null. Never throws.
export function getSession() {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY)
    if (raw !== null) {
      let parsed = null
      try {
        parsed = JSON.parse(raw)
      } catch {
        parsed = null
      }
      if (isValid(parsed)) return parsed
      // Invalid or unparsable: drop it.
      try {
        window.sessionStorage.removeItem(SESSION_KEY)
      } catch {
        // Storage blocked: ignore.
      }
      memory = null
    }
  } catch {
    // Storage blocked: fall back to the in-memory copy.
  }
  return isValid(memory) ? memory : null
}

export function saveSession(s) {
  memory = s
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(s))
  } catch {
    // Storage blocked: the in-memory copy is enough for this page load.
  }
}

export function clearSession() {
  memory = null
  try {
    window.sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // Storage blocked: ignore.
  }
}
