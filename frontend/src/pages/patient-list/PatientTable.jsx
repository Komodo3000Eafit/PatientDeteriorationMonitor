// Patient table area (US-02): active patients with triage level, latest NEWS2 score and band, and
// time of the latest reading, refreshed every REFRESH_MS. Displays backend values only; it never
// computes a score, band or status (Principle V). Rows keep the order received from the API.
// Contract: specs/016-patient-list/contracts/ui.md "Patient table area" and "Table".
import { Link } from 'react-router'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import RiskBandBadge from '../record-reading/RiskBandBadge.jsx'
import { formatSince } from './formatTime.js'
import { usePatientList } from './usePatientList.js'
import styles from './PatientTable.module.css'

export default function PatientTable() {
  const { lang, t } = useLanguage()
  const { patients, lastUpdated, status, refreshFailed } = usePatientList()

  if (status === 'loading') return <p>{t('patientList.loading')}</p>
  if (status === 'error') return <p role="alert">{t('patientList.loadError')}</p>

  return (
    <>
      {patients.length === 0 ? (
        <p>{t('patientList.empty')}</p>
      ) : (
        <div className={styles.scroll}>
          <table className={styles.table} aria-label={t('patients.title')}>
            <thead>
              <tr>
                <th scope="col">{t('patientList.colCode')}</th>
                <th scope="col">{t('patientList.colName')}</th>
                <th scope="col">{t('patientList.colTriage')}</th>
                <th scope="col">{t('patientList.colScore')}</th>
                <th scope="col">{t('patientList.colLatest')}</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.identifier}>
                  <td>
                    <Link to={'/patients/' + encodeURIComponent(p.identifier)}>{p.identifier}</Link>
                  </td>
                  <td>{p.name}</td>
                  <td>
                    <span className={`${styles.triage} ${styles['triage' + p.triage_level]}`}>
                      {t('triageLevel.' + p.triage_level)}
                    </span>
                  </td>
                  <td>
                    {p.latest_score ? (
                      <>
                        {p.latest_score.total} <RiskBandBadge band={p.latest_score.band} />
                      </>
                    ) : (
                      t('patientList.noData')
                    )}
                  </td>
                  <td>
                    {p.latest_score
                      ? formatSince(new Date(p.latest_score.recorded_at), new Date(), lang)
                      : t('patientList.noData')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {lastUpdated && (
        <p>{t('patientList.lastUpdated', { time: formatSince(lastUpdated, new Date(), lang) })}</p>
      )}
      {refreshFailed && <p role="alert">{t('patientList.refreshError')}</p>}
    </>
  )
}
