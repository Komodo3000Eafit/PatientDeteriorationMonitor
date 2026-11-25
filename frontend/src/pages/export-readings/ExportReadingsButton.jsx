// Button on the patient detail page that downloads every stored reading as CSV (US-10). Any signed-in role. Mounted on the patient detail page.
import { useState } from 'react'
import { Download } from 'lucide-react'
import { apiGet } from '../../api/client.js'
import Button from '../../components/Button.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { isPatientCode } from '../../utils/patientCode.js'
import { downloadCsv } from './downloadCsv.js'
import { buildReadingsCsv, exportFileName } from './readingsCsv.js'
import styles from './ExportReadingsButton.module.css'

export default function ExportReadingsButton({ identifier }) {
  const { t } = useLanguage()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  if (!isPatientCode(identifier)) return null

  async function handleExport() {
    if (busy) return
    setBusy(true)
    setFailed(false)
    try {
      const body = await apiGet('/api/patients/' + identifier + '/readings/export')
      if (!Array.isArray(body?.readings)) {
        throw new Error('Unexpected export response')
      }
      downloadCsv(buildReadingsCsv(body.readings), exportFileName(identifier))
    } catch {
      // Any failure shows the translated alert. A 401 is already handled by the shared client
      // (session cleared, redirect to the login page).
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.wrapper}>
      <Button variant="secondary" onClick={handleExport} disabled={busy}>
        <span className={styles.content}>
          <Download aria-hidden="true" focusable="false" size="1.25em" />
          <span>{busy ? t('exportReadings.busy') : t('exportReadings.button')}</span>
        </span>
      </Button>
      {failed && (
        <p role="alert" className={styles.error}>
          {t('exportReadings.error')}
        </p>
      )}
    </div>
  )
}
