// Nurse-only button that opens the register patient page (US-01). Renders nothing for any other role.
import { UserPlus } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../auth/AuthContext.jsx'
import Button from '../../components/Button.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import styles from './RegisterPatientButton.module.css'

export default function RegisterPatientButton() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()

  if (user?.role !== 'nurse') return null

  return (
    <div className={styles.wrapper}>
      <Button variant="primary" onClick={() => navigate('/patients/new')}>
        <span className={styles.content}>
          <UserPlus aria-hidden="true" focusable="false" size="1.25em" />
          <span>{t('registerPatient.button')}</span>
        </span>
      </Button>
    </div>
  )
}
