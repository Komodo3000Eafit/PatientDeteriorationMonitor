// Status icons (TS-12): inline SVG, no icon library, no title, no text, no props.
// Each icon carries meaning only alongside its label; aria-hidden keeps it out of the a11y tree.

const svgProps = {
  viewBox: '0 0 24 24',
  width: '1.25em',
  height: '1.25em',
  'aria-hidden': 'true',
  focusable: 'false',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '2',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

// stable: a check mark inside a circle
export function CheckCircleIcon() {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l3 3 5-6" />
    </svg>
  )
}

// warning: a triangle with an exclamation mark
export function TriangleAlertIcon() {
  return (
    <svg {...svgProps}>
      <path d="M12 4L2 20h20L12 4z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

// critical: an octagon with an "x"
export function OctagonXIcon() {
  return (
    <svg {...svgProps}>
      <path d="M8 3h8l5 5v8l-5 5H8l-5-5V8l5-5z" />
      <path d="M9 9l6 6" />
      <path d="M15 9l-6 6" />
    </svg>
  )
}

// no_data: a circle with a horizontal dash
export function CircleDashIcon() {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
    </svg>
  )
}
