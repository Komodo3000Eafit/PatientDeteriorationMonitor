// Guard for clinical pages (TS-06, routes from TS-13): put protected <Route>s inside <Route element={<RequireAuth />}>. Signed out → /login, remembering the page unless the user logged out.
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './AuthContext.jsx'

export default function RequireAuth() {
  const { user, loggedOut } = useAuth()
  const location = useLocation()

  if (user) return <Outlet />
  return <Navigate to="/login" replace state={loggedOut ? undefined : { from: location.pathname }} />
}
