// Shared card (TS-12): a plain div surface with an optional already-translated heading.
// Not a landmark; the page owns h1. headingLevel falls back to 2 for any invalid value.
import styles from './Card.module.css'

export default function Card({ title, headingLevel = 2, children }) {
  const level = headingLevel === 3 || headingLevel === 4 ? headingLevel : 2
  const Heading = `h${level}`

  return (
    <div className={styles.card}>
      {title ? <Heading className={styles.heading}>{title}</Heading> : null}
      {children}
    </div>
  )
}
