// Shared button (TS-12): primary or secondary variant, 44px target, token-only styling.
// The caller's className and style are intentionally ignored; styling lives in the module.
import styles from './Button.module.css'

export default function Button({ variant = 'primary', type = 'button', disabled = false, children, className: _ignoredClassName, style: _ignoredStyle, ...rest }) {
  const variantClass = variant === 'secondary' ? styles.secondary : styles.primary
  const className = `${styles.button} ${variantClass}`

  return (
    <button {...rest} type={type} disabled={disabled} className={className}>
      {children}
    </button>
  )
}
