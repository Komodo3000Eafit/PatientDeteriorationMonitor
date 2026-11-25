// Readings history state and refresh for the vital signs chart (US-06, research R7,
// data-model.md "Section state"). Requests GET /api/patients/{code}/readings (no limit; API
// default 50) on mount and again REFRESH_MS after each request finishes, so two requests never
// overlap. Paused while the tab is hidden; on becoming visible it requests at once. Follows the
// same rules as US-02's usePatientList, which is specific to /api/patients and is imported here
// only for REFRESH_MS (not modified, D-52). A 401 is handled by the shared API client.
import { useEffect, useState } from 'react'
import { apiGet } from '../../api/client.js'
import { REFRESH_MS } from '../patient-list/usePatientList.js'

const INITIAL_STATE = { readings: null, lastUpdated: null, status: 'loading', refreshFailed: false }

export function useReadingsHistory(identifier) {
  const [state, setState] = useState(INITIAL_STATE)

  useEffect(() => {
    let isActive = true
    let isInFlight = false
    let hasReadings = false
    let timer = null

    // A new patient: start fresh so a later patient's data is never shown under this one.
    setState(INITIAL_STATE)

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
        const body = await apiGet(
          '/api/patients/' + encodeURIComponent(identifier) + '/readings',
        )
        if (!Array.isArray(body?.readings)) throw new Error('Unexpected readings response')
        if (!isActive) return
        hasReadings = true
        setState({
          readings: body.readings,
          lastUpdated: new Date(),
          status: 'ok',
          refreshFailed: false,
        })
      } catch {
        // Never show the error itself; the chart uses its own fixed texts. A 401 is handled by the
        // API client (clear session + redirect) before it reaches here.
        if (!isActive) return
        if (hasReadings) {
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
  }, [identifier])

  return state
}
