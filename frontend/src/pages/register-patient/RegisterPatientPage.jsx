// Register patient page at /patients/new (US-01), inside the <RequireAuth> group. A nurse fills
// in a synthetic name, age, sex and the triage level already assigned; the backend generates the
// patient code and the admission time. Any other role sees a fixed message and a link back.
// Contract: specs/015-register-patient/contracts/ui.md. Messages are kept as keys, so switching
// language translates them; typed values live in component state and survive the switch.
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ApiError, apiPost } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import Button from '../../components/Button.jsx'
import Card from '../../components/Card.jsx'
import { OctagonXIcon } from '../../components/Icons.jsx'
import TriageLevelBadge from '../../components/TriageLevelBadge.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import styles from './RegisterPatientPage.module.css'

const NAME_MAX_LENGTH = 100
const AGE_MIN = 0
const AGE_MAX = 130
const SEX_OPTIONS = ['female', 'male', 'other']
const TRIAGE_LEVELS = [1, 2, 3, 4, 5]

// Fixed message for each failed answer; never the server text.
function errorKeyFor(err) {
  if (err instanceof ApiError) {
    if (err.status === 422) return 'registerPatient.errorInvalid'
    if (err.status === 409) return 'registerPatient.errorConflict'
    if (err.status === 403) return 'registerPatient.nursesOnly'
    // 401: the client clears the session and the guard sends the user to /login.
    if (err.status === 401) return null
  }
  return 'registerPatient.errorFailed'
}

// Form-completeness checks only (not clinical logic): returns { field: messageKey } for each problem.
function checkFields({ name, age, sex, level }) {
  const errors = {}
  if (name.trim() === '') errors.name = 'registerPatient.required'
  if (age === '') {
    errors.age = 'registerPatient.required'
  } else if (!/^\d+$/.test(age) || Number(age) < AGE_MIN || Number(age) > AGE_MAX) {
    errors.age = 'registerPatient.ageInvalid'
  }
  if (sex === '') errors.sex = 'registerPatient.required'
  if (level === '') errors.level = 'registerPatient.required'
  return errors
}

function FieldError({ id, messageKey }) {
  const { t } = useLanguage()
  if (!messageKey) return null
  return (
    <p id={id} className={styles.fieldError}>
      <OctagonXIcon />
      <span>{t(messageKey)}</span>
    </p>
  )
}

// Joins the ids that describe a field, leaving out the missing ones.
function describedBy(...ids) {
  const joined = ids.filter(Boolean).join(' ')
  return joined === '' ? undefined : joined
}

export default function RegisterPatientPage() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState('')
  const [level, setLevel] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [errorKey, setErrorKey] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  // After success or a 401 the page unmounts; no state updates after that.
  const mounted = useRef(true)
  // Synchronous guard so a second submit never sends a second request.
  const inFlight = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  if (user?.role !== 'nurse') {
    return (
      <main>
        <h1>{t('registerPatient.title')}</h1>
        <Card>
          <p>{t('registerPatient.nursesOnly')}</p>
          <Link to="/patients">{t('nav.backToPatients')}</Link>
        </Card>
      </main>
    )
  }

  function clearFieldError(field) {
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (isSaving || inFlight.current) return
    const errors = checkFields({ name, age, sex, level })
    setFieldErrors(errors)
    setErrorKey(null)
    if (Object.keys(errors).length > 0) return

    inFlight.current = true
    setIsSaving(true)
    try {
      const result = await apiPost('/api/patients', {
        name: name.trim(),
        age: Number(age),
        sex,
        triage_level: Number(level),
      })
      if (mounted.current) navigate('/patients/' + result.identifier)
    } catch (err) {
      if (mounted.current) setErrorKey(errorKeyFor(err))
    } finally {
      inFlight.current = false
      if (mounted.current) setIsSaving(false)
    }
  }

  return (
    <main>
      <h1>{t('registerPatient.title')}</h1>
      <Card>
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label htmlFor="register-name">{t('registerPatient.name')}</label>
            <input
              id="register-name"
              name="name"
              type="text"
              autoComplete="off"
              maxLength={NAME_MAX_LENGTH}
              value={name}
              aria-invalid={fieldErrors.name ? 'true' : undefined}
              aria-describedby={describedBy('register-name-hint', fieldErrors.name && 'register-name-error')}
              onChange={(event) => {
                setName(event.target.value)
                clearFieldError('name')
              }}
            />
            <p id="register-name-hint" className={styles.hint}>
              {t('registerPatient.nameHint')}
            </p>
            <FieldError id="register-name-error" messageKey={fieldErrors.name} />
          </div>

          <div className={styles.field}>
            <label htmlFor="register-age">{t('registerPatient.age')}</label>
            <input
              id="register-age"
              name="age"
              type="number"
              inputMode="numeric"
              min={AGE_MIN}
              max={AGE_MAX}
              step={1}
              className={styles.age}
              value={age}
              aria-invalid={fieldErrors.age ? 'true' : undefined}
              aria-describedby={describedBy(fieldErrors.age && 'register-age-error')}
              onChange={(event) => {
                setAge(event.target.value)
                clearFieldError('age')
              }}
            />
            <FieldError id="register-age-error" messageKey={fieldErrors.age} />
          </div>

          <fieldset
            className={styles.group}
            aria-invalid={fieldErrors.sex ? 'true' : undefined}
            aria-describedby={describedBy(fieldErrors.sex && 'register-sex-error')}
          >
            <legend>{t('registerPatient.sex')}</legend>
            <div className={styles.options}>
              {SEX_OPTIONS.map((option) => (
                <label key={option} className={styles.option}>
                  <input
                    type="radio"
                    name="sex"
                    value={option}
                    checked={sex === option}
                    onChange={() => {
                      setSex(option)
                      clearFieldError('sex')
                    }}
                  />
                  <span>{t(`sex.${option}`)}</span>
                </label>
              ))}
            </div>
            <FieldError id="register-sex-error" messageKey={fieldErrors.sex} />
          </fieldset>

          <fieldset
            className={styles.group}
            aria-invalid={fieldErrors.level ? 'true' : undefined}
            aria-describedby={describedBy('register-level-hint', fieldErrors.level && 'register-level-error')}
          >
            <legend>{t('registerPatient.triageLevel')}</legend>
            <p id="register-level-hint" className={styles.hint}>
              {t('registerPatient.triageHint')}
            </p>
            <div className={styles.options}>
              {TRIAGE_LEVELS.map((option) => (
                <label key={option} className={styles.option}>
                  <input
                    type="radio"
                    name="triage_level"
                    value={option}
                    checked={level === String(option)}
                    onChange={() => {
                      setLevel(String(option))
                      clearFieldError('level')
                    }}
                  />
                  <TriageLevelBadge level={option} />
                </label>
              ))}
            </div>
            <FieldError id="register-level-error" messageKey={fieldErrors.level} />
          </fieldset>

          {errorKey && (
            <p role="alert" className={styles.error}>
              <OctagonXIcon />
              <span>{t(errorKey)}</span>
            </p>
          )}

          <Button type="submit" disabled={isSaving}>
            {t(isSaving ? 'registerPatient.submitting' : 'registerPatient.submit')}
          </Button>
        </form>
      </Card>
    </main>
  )
}
