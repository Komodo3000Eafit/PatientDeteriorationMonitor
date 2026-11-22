// Status icons (TS-14): re-exported from lucide-react (D-46), the single icon source.
// Decorative only — aria-hidden + focusable="false"; em-sized (1.4em); currentColor (the dark
// --color-text), never a status color as text.
import { CheckCircle, CircleDashed, HeartPulse, House, OctagonX, TriangleAlert } from 'lucide-react'

const iconProps = { 'aria-hidden': 'true', focusable: 'false', size: '1.4em' }

// stable
export function CheckCircleIcon() {
  return <CheckCircle {...iconProps} />
}

// warning
export function TriangleAlertIcon() {
  return <TriangleAlert {...iconProps} />
}

// critical
export function OctagonXIcon() {
  return <OctagonX {...iconProps} />
}

// no_data
export function CircleDashIcon() {
  return <CircleDashed {...iconProps} />
}

// navigation: patient vitals / monitoring
export function HeartPulseIcon() {
  return <HeartPulse {...iconProps} />
}

// navigation: home
export function HouseIcon() {
  return <House {...iconProps} />
}
