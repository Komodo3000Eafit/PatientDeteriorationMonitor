// Patient table area (US-02): active patients with triage level, latest NEWS2 score and band, and
// time of the latest reading, refreshed every REFRESH_MS. Displays backend values only; it never
// computes a score, band or status (Principle V). By default rows keep the order received from the
// API; US-09 adds a triage-level filter and column-header sorting applied in the browser to the
// loaded rows (filterAndSort), re-applied on every refresh (page-extension exception, D-58).
// Contracts: specs/016-patient-list/contracts/ui.md "Patient table area" and "Table";
// specs/025-patient-list-filter-sort/contracts/ui.md.
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { filterAndSort, SORT_DEFAULT_DIRECTION } from './filterAndSort.js'
import { formatClockSeconds, formatSince } from './formatTime.js'
import ScoreBadge from './ScoreBadge.jsx'
import TriageFilter from './TriageFilter.jsx'
import { usePatientList } from './usePatientList.js'
import styles from './PatientTable.module.css'

const ARIA_SORT = { asc: 'ascending', desc: 'descending' }

// A sortable column header (US-09): the button's visible text is the US-02 column label, so the
// header's text content is unchanged; the chevron is decorative and adds no text.
function SortHeader({ column, labelKey, sortLabelKey, sort, onSort }) {
  const { t } = useLanguage()
  const isActive = sort.column === column
  const Chevron = sort.direction === 'asc' ? ChevronUp : ChevronDown

  function handleClick() {
    onSort(column)
  }

  return (
    <th scope="col" aria-sort={isActive ? ARIA_SORT[sort.direction] : 'none'}>
      <button
        type="button"
        className={styles.sortButton}
        aria-label={t(sortLabelKey)}
        onClick={handleClick}
      >
        {t(labelKey)}
        {isActive && (
          <Chevron aria-hidden="true" focusable="false" size="1em" className={styles.sortIcon} />
        )}
      </button>
    </th>
  )
}

export default function PatientTable() {
  const { lang, t } = useLanguage()
  const { patients, lastUpdated, status, refreshFailed } = usePatientList()
  const [filter, setFilter] = useState({ triageLevel: null })
  const [sort, setSort] = useState({ column: null, direction: 'asc' })
  // patients is null until the first list arrives (loading/error); the early returns below cover it.
  const rows = useMemo(
    () => (patients ? filterAndSort(patients, filter, sort) : []),
    [patients, filter, sort],
  )

  function handleFilterChange(triageLevel) {
    setFilter({ triageLevel })
  }

  function handleSort(column) {
    setSort((current) =>
      current.column === column
        ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: SORT_DEFAULT_DIRECTION[column] },
    )
  }

  if (status === 'loading') return <p>{t('patientList.loading')}</p>
  if (status === 'error') return <p role="alert">{t('patientList.loadError')}</p>

  const isFiltered = filter.triageLevel !== null

  return (
    <>
      {patients.length === 0 ? (
        <p>{t('patientList.empty')}</p>
      ) : (
        <>
          <div className={styles.controls}>
            <TriageFilter value={filter.triageLevel} onChange={handleFilterChange} />
            {isFiltered && (
              <p role="status" className={styles.resultCount}>
                {t('patientList.resultCount', { shown: rows.length, total: patients.length })}
              </p>
            )}
          </div>
          {rows.length === 0 ? (
            <p>{t('patientList.filteredEmpty')}</p>
          ) : (
            <div className={styles.scroll}>
              <table className={styles.table} aria-label={t('patients.title')}>
                <thead>
                  <tr>
                    <SortHeader
                      column="code"
                      labelKey="patientList.colCode"
                      sortLabelKey="patientList.sortByCode"
                      sort={sort}
                      onSort={handleSort}
                    />
                    <th scope="col">{t('patientList.colName')}</th>
                    <SortHeader
                      column="triage"
                      labelKey="patientList.colTriage"
                      sortLabelKey="patientList.sortByTriage"
                      sort={sort}
                      onSort={handleSort}
                    />
                    <SortHeader
                      column="score"
                      labelKey="patientList.colScore"
                      sortLabelKey="patientList.sortByScore"
                      sort={sort}
                      onSort={handleSort}
                    />
                    <SortHeader
                      column="latest"
                      labelKey="patientList.colLatest"
                      sortLabelKey="patientList.sortByLatest"
                      sort={sort}
                      onSort={handleSort}
                    />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
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
                          <ScoreBadge total={p.latest_score.total} band={p.latest_score.band} />
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
        </>
      )}
      {lastUpdated && (
        <p>{t('patientList.lastUpdated', { time: formatClockSeconds(lastUpdated, lang) })}</p>
      )}
      {refreshFailed && <p role="alert">{t('patientList.refreshError')}</p>}
    </>
  )
}
