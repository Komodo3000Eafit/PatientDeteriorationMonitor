// App root (TS-05): language provider + shared page frame (disclaimer, ES/EN switch) around the current screen.
import AppShell from './components/AppShell.jsx'
import { LanguageProvider } from './i18n/LanguageContext.jsx'
import StartPage from './StartPage.jsx'
import './App.css'

export default function App() {
  return (
    <LanguageProvider>
      <AppShell>
        <StartPage />
      </AppShell>
    </LanguageProvider>
  )
}
