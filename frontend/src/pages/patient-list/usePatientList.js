// Patient list state and refresh (US-02, research R6; data-model.md "Page state").
// Requests GET /api/patients on mount and again REFRESH_MS after each request finishes, so two
// requests never overlap. Paused while the tab is hidden; on becoming visible it requests at once.
// A 401 is handled by the shared API client (session expiry), which unmounts this page.
import { useEffect, useState } from 'react'
import { apiGet } from '../../api/client.js'

export const REFRESH_MS = 15000

const INITIAL_STATE = { patients: null, lastUpdated: null, status: 'loading', refreshFailed: false }

export function usePatientList() {
  const [state, setState] = useState(INITIAL_STATE)

  useEffect(() => {
    let isActive = true
    let isInFlight = false
    let hasList = false
    let timer = null

    function clearTimer() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    }

    function scheduleNext() {
      clearTimer()
      if (isActive && !document.hidden) timer = setTimeout(load, REFRESH_MS)
    }

    async function load() {
      if (isInFlight) return
      isInFlight = true
      timer = null
      try {
        const body = await apiGet('/api/patients')
        if (!Array.isArray(body?.patients)) throw new Error('Unexpected /api/patients response')
        if (!isActive) return
        hasList = true
        setState({ patients: body.patients, lastUpdated: new Date(), status: 'ok', refreshFailed: false })
      } catch {
        // Never show the error itself; the table uses its own fixed texts.
        if (!isActive) return
        if (hasList) {
          setState((previous) => ({ ...previous, refreshFailed: true }))
        } else {
          setState((previous) => ({ ...previous, status: 'error' }))
        }
      } finally {
        isInFlight = false
        scheduleNext()
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        clearTimer()
      } else if (!isInFlight) {
        clearTimer()
        load()
      }
      // Visible while a request is in flight: that request schedules the next one when it ends.
    }

    load()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      isActive = false
      clearTimer()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return state
}
