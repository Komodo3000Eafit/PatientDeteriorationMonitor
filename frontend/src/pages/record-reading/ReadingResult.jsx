// Stored result of one reading (US-03): NEWS2 score, risk band and the reason for every point,
// rendered only from the backend answer. Never computes points, the score or the band.
// Contract: specs/017-vital-signs-scoring/contracts/ui.md "Result view".
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { formatReason, formatValue } from './formatReason.js'
import RiskBandBadge from './RiskBandBadge.jsx'
import styles from './ReadingResult.module.css'

export default function ReadingResult({
  reading,
  titleKey = 'recordReading.resultTitle',
  titleWithDate = false,
}) {
  const { lang, t } = useLanguage()
  const { score } = reading
  const recordedAt = new Date(reading.recorded_at).toLocaleString(lang)

  return (
    <section className={styles.result} aria-labelledby="reading-result-title">
      {titleWithDate ? (
        // US-05 (PatientDetailPage): title and recorded_at on one line, "Título — fecha".
        <h2 id="reading-result-title" className={styles.titleWithDate}>
          <span>{t(titleKey)}</span>
          <span className={styles.titleDate}> — {recordedAt}</span>
        </h2>
      ) : (
        // US-03 default (RecordReadingPage): unchanged — title line, then the date line.
        <>
          <h2 id="reading-result-title" className={styles.title}>
            {t(titleKey)}
          </h2>
          <p className={styles.time}>{recordedAt}</p>
        </>
      )}
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
