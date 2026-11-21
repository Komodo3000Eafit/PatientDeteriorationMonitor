// Patient detail placeholder (TS-13) until US-05 replaces it. Reads the patient code from the
// address; an invalid code shows the not-found page. The code is shown only as text; no backend call.
import { Link, useParams } from 'react-router'
import Card from '../../components/Card.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { isPatientCode } from '../../utils/patientCode.js'
import NotFoundPage from '../not-found/NotFoundPage.jsx'
import RecordReadingButton from '../record-reading/RecordReadingButton.jsx'
import RetriageSuggestion from './RetriageSuggestion.jsx'

export default function PatientDetailPage() {
  const { identifier } = useParams()
  const { t } = useLanguage()

  if (!isPatientCode(identifier)) {
    return <NotFoundPage />
  }

  return (
    <main>
      <h1>{t('patientDetail.title', { code: identifier })}</h1>
      <RecordReadingButton identifier={identifier} />
      <RetriageSuggestion identifier={identifier} />
      <Card>
        <p>{t('patientDetail.placeholder')}</p>
        <Link to="/patients">{t('nav.backToPatients')}</Link>
      </Card>
    </main>
  )
}
