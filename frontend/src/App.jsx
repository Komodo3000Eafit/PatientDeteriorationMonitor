// App root (TS-05, sign-in from TS-06): language provider, auth provider and the shared page frame
// (disclaimer, user block, ES/EN switch) around the current screen. Clinical screens are wrapped in
// <RequireAuth>, so signed out shows the login page and no clinical content.
import AppShell from './components/AppShell.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import RequireAuth from './auth/RequireAuth.jsx'
import { LanguageProvider } from './i18n/LanguageContext.jsx'
import StartPage from './StartPage.jsx'
import './App.css'

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AppShell>
          <RequireAuth>
            <StartPage />
          </RequireAuth>
        </AppShell>
      </AuthProvider>
    </LanguageProvider>
  )
}
