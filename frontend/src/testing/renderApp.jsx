// Test helper (TS-13, research R9): renders the whole app inside an in-memory router at the given
// addresses, plus a probe that prints the current path and a hidden test-only "go back" button
// (navigate(-1), like the browser's Back button). Not shipped. Synthetic data only.
import { render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'
import App from '../App.jsx'

function LocationProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <output data-testid="location">{location.pathname}</output>
      <button type="button" data-testid="go-back" hidden onClick={() => navigate(-1)} />
    </>
  )
}

// entries: the history stack (addresses); index: the current entry (default: the last one).
export function renderApp(entries = ['/'], index) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index ?? entries.length - 1}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  )
}

// The current address path shown by the probe.
export function currentPath() {
  return screen.getByTestId('location').textContent
}
