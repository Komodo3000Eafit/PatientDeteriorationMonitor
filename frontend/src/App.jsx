// App root (TS-05, sign-in from TS-06, routes from TS-13): language provider, auth provider and the
// shared page frame (disclaimer, user block, ES/EN switch) around the page for the current address.
// The router itself (BrowserRouter) is in main.jsx. Clinical pages go inside the <RequireAuth>
// group, so signed out redirects to /login and no clinical content renders. Address table:
// specs/013-client-routing/contracts/routes.md and frontend/README.md.
import { Navigate, Route, Routes } from 'react-router'
import AppShell from './components/AppShell.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import RequireAuth from './auth/RequireAuth.jsx'
import { LanguageProvider } from './i18n/LanguageContext.jsx'
import LoginPage from './pages/login/LoginPage.jsx'
import NotFoundPage from './pages/not-found/NotFoundPage.jsx'
import PatientDetailPage from './pages/patient-detail/PatientDetailPage.jsx'
import PatientListPage from './pages/patient-list/PatientListPage.jsx'

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<Navigate to="/patients" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route path="/patients" element={<PatientListPage />} />
              <Route path="/patients/:identifier" element={<PatientDetailPage />} />
              {/* Functional stories: add protected pages here, e.g. /patients/new (US-01) */}
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AppShell>
      </AuthProvider>
    </LanguageProvider>
  )
}
