import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// No StrictMode: it would run effects twice in development and call /health twice (research R4).
createRoot(document.getElementById('root')).render(<App />)
