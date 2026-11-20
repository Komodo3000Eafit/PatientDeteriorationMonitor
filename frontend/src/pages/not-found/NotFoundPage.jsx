// Not-found page (TS-13): shown for any address the app does not know. Public page, no auth check.
import { Link } from 'react-router'
import Card from '../../components/Card.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

export default function NotFoundPage() {
  const { t } = useLanguage()

  return (
    <main>
      <h1>{t('notFound.title')}</h1>
      <Card>
        <p>{t('notFound.message')}</p>
        <Link to="/patients">{t('nav.backToPatients')}</Link>
      </Card>
    </main>
  )
}
