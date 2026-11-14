// Signed-in user (TS-06): React Context with { user, signIn, signOut, sessionExpired }.
// The session itself lives in src/auth/session.js; the API client adds the token to requests.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getMe, login, onUnauthorized } from '../api/client.js'
import { clearSession, getSession, saveSession } from './session.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getSession()?.user ?? null)
  const [sessionExpired, setSessionExpired] = useState(false)

  // A 401 on a request that used the stored token: the client already cleared the session.
  useEffect(
    () =>
      onUnauthorized(() => {
        setUser(null)
        setSessionExpired(true)
      }),
    [],
  )

  // Runs once per load: refresh the stored user from GET /me.
  useEffect(() => {
    let cancelled = false
    if (getSession()) {
      getMe().then(
        (me) => {
          if (cancelled) return
          const current = getSession()
          if (current) {
            saveSession({ ...current, user: me })
            setUser(me)
          }
        },
        () => {
          // A 401 is handled by the unauthorized handler; network errors keep the stored user.
        },
      )
    }
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(async (username, password) => {
    // Errors from login() propagate unchanged (a 401 means wrong credentials).
    const { access_token } = await login(username, password)
    let me
    try {
      me = await getMe(access_token)
    } catch {
      // Any /me failure after a successful login is reported as "cannot connect"; nothing is saved.
      throw new Error('Profile check failed')
    }
    saveSession({ token: access_token, user: me })
    setUser(me)
    setSessionExpired(false)
  }, [])

  const signOut = useCallback(() => {
    clearSession()
    setUser(null)
    setSessionExpired(false)
  }, [])

  const value = useMemo(
    () => ({ user, signIn, signOut, sessionExpired }),
    [user, signIn, signOut, sessionExpired],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === null) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return context
}
