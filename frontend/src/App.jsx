// Start page (TS-04): shows the backend /health result once per page load.
// Texts are fixed Spanish strings (contracts/health-ui.md); TS-05 adds the language switch.
import { useEffect, useState } from 'react'
import { getHealth } from './api/client.js'
import './App.css'

function App() {
  const [state, setState] = useState({ kind: 'checking' })

  useEffect(() => {
    let cancelled = false
    getHealth().then(
      (health) => {
        if (!cancelled) {
          setState({
            kind: health.database === 'ok' ? 'ok' : 'databaseUnavailable',
            version: health.version,
          })
        }
      },
      () => {
        // Never show the error itself; the page uses its own fixed text.
        if (!cancelled) setState({ kind: 'unreachable' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main>
      <h1>Monitor de Deterioro del Paciente</h1>
      <section role="status">
        {state.kind === 'checking' && <p>Comprobando la conexión con el servidor…</p>}
        {state.kind === 'ok' && (
          <>
            <p>API: funcionando</p>
            <p>{`Versión: ${state.version}`}</p>
            <p>Base de datos: disponible</p>
          </>
        )}
        {state.kind === 'databaseUnavailable' && (
          <>
            <p>API: funcionando</p>
            <p>{`Versión: ${state.version}`}</p>
            <p>Base de datos: no disponible</p>
            <p>Recarga la página para volver a comprobar.</p>
          </>
        )}
        {state.kind === 'unreachable' && (
          <>
            <p>No se puede conectar con el servidor.</p>
            <p>Recarga la página para volver a comprobar.</p>
          </>
        )}
      </section>
    </main>
  )
}

export default App
