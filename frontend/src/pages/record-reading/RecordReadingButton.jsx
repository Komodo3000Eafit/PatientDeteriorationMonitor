// Nurse-only button that opens the reading entry page for one patient (US-03). Renders nothing
// for any other role. Mounted on the patient detail page.
import { Activity } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../auth/AuthContext.jsx'
import Button from '../../components/Button.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import styles from './RecordReadingButton.module.css'

export default function RecordReadingButton({ identifier }) {
  const { user } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()

  if (user?.role !== 'nurse') return null

  return (
    <div className={styles.wrapper}>
      <Button variant="primary" onClick={() => navigate('/patients/' + identifier + '/readings/new')}>
        <span className={styles.content}>
          <Activity aria-hidden="true" focusable="false" size="1.25em" />
          <span>{t('recordReading.button')}</span>
        </span>
      </Button>
    </div>
  )
}
