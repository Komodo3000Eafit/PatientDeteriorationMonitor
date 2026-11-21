// Stored result of one reading (US-03): NEWS2 score, risk band and the reason for every point,
// rendered only from the backend answer. Never computes points, the score or the band.
// Contract: specs/017-vital-signs-scoring/contracts/ui.md "Result view".
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { formatReason, formatValue } from './formatReason.js'
import RiskBandBadge from './RiskBandBadge.jsx'
import styles from './ReadingResult.module.css'

export default function ReadingResult({ reading }) {
  const { lang, t } = useLanguage()
  const { score } = reading

  return (
    <section className={styles.result} aria-labelledby="reading-result-title">
      <h2 id="reading-result-title" className={styles.title}>
        {t('recordReading.resultTitle')}
      </h2>
      <p className={styles.time}>{new Date(reading.recorded_at).toLocaleString(lang)}</p>
      <p className={styles.summary}>
        {t('recordReading.score')}: {score.total}
      </p>
      <p className={styles.summary}>
        {t('recordReading.band')}: <RiskBandBadge band={score.band} />
      </p>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{t('recordReading.parameter')}</th>
              <th scope="col">{t('recordReading.value')}</th>
              <th scope="col">{t('recordReading.points')}</th>
              <th scope="col">{t('recordReading.reason')}</th>
            </tr>
          </thead>
          <tbody>
            {score.entries.map((entry) => (
              <tr key={entry.parameter}>
                <th scope="row">{t('parameter.' + entry.parameter)}</th>
                <td>{formatValue(entry, t, lang)}</td>
                <td>{entry.points}</td>
                <td>{formatReason(entry, t, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
