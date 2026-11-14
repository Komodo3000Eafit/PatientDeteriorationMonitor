// Guard for protected screens (TS-06): wrap every clinical screen in <RequireAuth>; signed out shows the login page.
import LoginPage from '../LoginPage.jsx'
import { useAuth } from './AuthContext.jsx'

export default function RequireAuth({ children }) {
  const { user } = useAuth()
  return user ? children : <LoginPage />
}
