// Triage-level filter for the patient list (US-09): a native <select> with a visible label.
// Controlled: the parent holds the value (null = all levels, or 1..5) and receives the new
// value through onChange. It only chooses which rows are shown; it never changes a triage level.
// Contract: specs/025-patient-list-filter-sort/contracts/ui.md "Triage filter control".
import { useId } from 'react'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import styles from './TriageFilter.module.css'

const TRIAGE_LEVELS = [1, 2, 3, 4, 5]
const ALL_VALUE = ''

export default function TriageFilter({ value, onChange }) {
  const { t } = useLanguage()
  const selectId = useId()

  function handleChange(event) {
    const selected = event.target.value
    onChange(selected === ALL_VALUE ? null : Number(selected))
  }

  return (
    <div className={styles.filter}>
      <label htmlFor={selectId} className={styles.label}>
        {t('patientList.filterLabel')}
      </label>
      <select
        id={selectId}
        className={styles.select}
        value={value === null ? ALL_VALUE : String(value)}
        onChange={handleChange}
      >
        <option value={ALL_VALUE}>{t('patientList.filterAll')}</option>
        {TRIAGE_LEVELS.map((level) => (
          <option key={level} value={String(level)}>
            {t('triageLevel.' + level)}
          </option>
        ))}
      </select>
    </div>
  )
}
