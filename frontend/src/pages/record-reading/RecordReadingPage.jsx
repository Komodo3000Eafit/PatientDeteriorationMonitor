// Reading entry page at /patients/:identifier/readings/new (US-03), inside the <RequireAuth> group.
// A nurse enters the seven parameters of one reading; the backend validates, stores and scores it
// and the stored result is shown. Any other role sees a fixed message and a link back.
// Contract: specs/017-vital-signs-scoring/contracts/ui.md. The frontend only checks that fields are
// filled and well formed (no ranges) and never computes points, the NEWS2 score or the risk band.
// Messages are kept as { key, params } and values live in component state, so switching language
// keeps them and re-renders the text in the new language.
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ApiError, apiPost } from '../../api/client.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import Button from '../../components/Button.jsx'
import Card from '../../components/Card.jsx'
import { OctagonXIcon } from '../../components/Icons.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { formatDecimal } from '../../utils/formatNumber.js'
import { isPatientCode } from '../../utils/patientCode.js'
import NotFoundPage from '../not-found/NotFoundPage.jsx'
import ReadingResult from './ReadingResult.jsx'
import styles from './RecordReadingPage.module.css'

// The seven parameter codes, in form order (GLOSSARY "parameter").
const PARAMETER_CODES = [
  'respiratory_rate',
  'spo2',
  'on_oxygen',
  'systolic_bp',
  'heart_rate',
  'consciousness',
  'temperature',
]
const INTEGER_FIELDS = ['respiratory_rate', 'spo2', 'systolic_bp', 'heart_rate']
const YES_NO_OPTIONS = ['true', 'false']
const CONSCIOUSNESS_CODES = ['A', 'C', 'V', 'P', 'U']
const WHOLE_NUMBER_PATTERN = /^\d+$/
const ONE_DECIMAL_PATTERN = /^\d+([.,]\d)?$/
// Shapes accepted in a 422 `ctx`; anything else falls back to "value not accepted".
const LIMIT_PATTERN = /^-?\d+(\.\d+)?$/
const ALLOWED_PATTERN = /^[A-Za-z0-9_]+$/

const EMPTY_VALUES = {
  respiratory_rate: '',
  spo2: '',
  on_oxygen: '',
  systolic_bp: '',
  heart_rate: '',
  consciousness: '',
  temperature: '',
}

// Form-completeness and format checks only (no ranges, no clinical logic):
// returns { field: { key } } for each problem.
function checkFields(values) {
  const errors = {}
  for (const field of INTEGER_FIELDS) {
    const value = values[field].trim()
    if (value === '') errors[field] = { key: 'recordReading.required' }
    else if (!WHOLE_NUMBER_PATTERN.test(value)) errors[field] = { key: 'recordReading.wholeNumber' }
  }
  if (values.on_oxygen === '') errors.on_oxygen = { key: 'recordReading.required' }
  if (values.consciousness === '') errors.consciousness = { key: 'recordReading.required' }
  const temperature = values.temperature.trim()
  if (temperature === '') errors.temperature = { key: 'recordReading.required' }
  else if (!ONE_DECIMAL_PATTERN.test(temperature)) errors.temperature = { key: 'recordReading.oneDecimal' }
  return errors
}

// A limit in ctx: a finite number or a plain numeric string such as "25.0".
function isLimit(value) {
  return (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && LIMIT_PATTERN.test(value))
}

// One vital-sign problem as { key, params } (change request 2026-11-20). Only the accepted rule in
// `ctx` is used, never the submitted value or the server text; numbers are formatted at render time.
function messageForProblem(problem) {
  const ctx = problem.ctx
  if (problem.type === 'missing') return { key: 'recordReading.required' }
  if (problem.type === 'out_of_range' && ctx && isLimit(ctx.min) && isLimit(ctx.max)) {
    return { key: 'recordReading.rangeError', params: { min: ctx.min, max: ctx.max } }
  }
  if (problem.type === 'too_many_decimals' && ctx && Number.isInteger(ctx.decimals) && ctx.decimals >= 0) {
    return { key: 'recordReading.decimalsError' }
  }
  if (
    problem.type === 'not_allowed' &&
    ctx &&
    Array.isArray(ctx.allowed) &&
    ctx.allowed.length > 0 &&
    ctx.allowed.every((item) => typeof item === 'string' && ALLOWED_PATTERN.test(item))
  ) {
    return { key: 'recordReading.allowedError', params: { values: ctx.allowed.join(', ') } }
  }
  return { key: 'recordReading.valueRejected' }
}

// Turns a failed answer into fixed messages; never the server text or a submitted value.
// Returns { fieldErrors, errorKey }; each field error is { key, params }.
function errorsFor(err) {
  if (!(err instanceof ApiError)) return { fieldErrors: {}, errorKey: 'recordReading.errorFailed' }
  if (err.status === 422) {
    const fieldErrors = {}
    let hasOtherProblem = !Array.isArray(err.detail)
    for (const problem of err.detail ?? []) {
      const field = Array.isArray(problem?.loc) ? problem.loc[1] : undefined
      if (PARAMETER_CODES.includes(field)) {
        fieldErrors[field] = messageForProblem(problem)
      } else {
        hasOtherProblem = true
      }
    }
    return { fieldErrors, errorKey: hasOtherProblem ? 'recordReading.errorInvalid' : null }
  }
  if (err.status === 404) return { fieldErrors: {}, errorKey: 'recordReading.errorNotFound' }
  if (err.status === 409) return { fieldErrors: {}, errorKey: 'recordReading.errorDischarged' }
  if (err.status === 403) return { fieldErrors: {}, errorKey: 'recordReading.nursesOnly' }
  // 401: the client clears the session and the guard sends the user to /login.
  if (err.status === 401) return { fieldErrors: {}, errorKey: null }
  return { fieldErrors: {}, errorKey: 'recordReading.errorFailed' }
}

// The request body: integers and temperature as numbers (a comma is sent as a dot).
function toRequestBody(values) {
  return {
    respiratory_rate: Number(values.respiratory_rate.trim()),
    spo2: Number(values.spo2.trim()),
    on_oxygen: values.on_oxygen === 'true',
    systolic_bp: Number(values.systolic_bp.trim()),
    heart_rate: Number(values.heart_rate.trim()),
    consciousness: values.consciousness,
    temperature: Number(values.temperature.trim().replace(',', '.')),
  }
}

// Builds the text at render time, so a language switch re-renders it with the new separator and unit.
function FieldError({ id, field, message }) {
  const { lang, t } = useLanguage()
  if (!message) return null
  let params = message.params
  if (message.key === 'recordReading.rangeError') {
    params = {
      min: formatDecimal(params.min, lang),
      max: formatDecimal(params.max, lang),
      unit: t('unit.' + field),
    }
  }
  return (
    <p id={id} className={styles.fieldError}>
      <OctagonXIcon />
      <span>{t(message.key, params)}</span>
    </p>
  )
}

function errorId(field) {
  return `reading-${field}-error`
}

export default function RecordReadingPage() {
  const { identifier } = useParams()
  const { user } = useAuth()
  const { t } = useLanguage()
  const [values, setValues] = useState(EMPTY_VALUES)
  const [fieldErrors, setFieldErrors] = useState({})
  const [errorKey, setErrorKey] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [savedReading, setSavedReading] = useState(null)

  // After a 401 the page unmounts; no state updates after that.
  const mounted = useRef(true)
  // Synchronous guard so a second submit never sends a second request.
  const inFlight = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  if (!isPatientCode(identifier)) {
    return <NotFoundPage />
  }

  const patientPath = '/patients/' + identifier
  const backLink = <Link to={patientPath}>{t('recordReading.backToPatient')}</Link>

  if (user?.role !== 'nurse') {
    return (
      <main>
        <h1>{t('recordReading.title', { code: identifier })}</h1>
        <Card>
          <p>{t('recordReading.nursesOnly')}</p>
          {backLink}
        </Card>
      </main>
    )
  }

  function setValue(field, value) {
    setValues((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function handleAnother() {
    setValues(EMPTY_VALUES)
    setFieldErrors({})
    setErrorKey(null)
    setSavedReading(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (isSaving || inFlight.current) return
    const errors = checkFields(values)
    setFieldErrors(errors)
    setErrorKey(null)
    if (Object.keys(errors).length > 0) return

    inFlight.current = true
    setIsSaving(true)
    try {
      const reading = await apiPost('/api/patients/' + identifier + '/readings', toRequestBody(values))
      if (mounted.current) setSavedReading(reading)
    } catch (err) {
      if (mounted.current) {
        const result = errorsFor(err)
        setFieldErrors(result.fieldErrors)
        setErrorKey(result.errorKey)
      }
    } finally {
      inFlight.current = false
      if (mounted.current) setIsSaving(false)
    }
  }

  function renderTextField(field, inputMode) {
    const id = `reading-${field}`
    const hasError = !!fieldErrors[field]
    return (
      <div className={styles.field}>
        <label htmlFor={id}>{t('parameter.' + field)}</label>
        <input
          id={id}
          name={field}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          value={values[field]}
          aria-invalid={hasError ? 'true' : undefined}
          aria-describedby={hasError ? errorId(field) : undefined}
          onChange={(event) => setValue(field, event.target.value)}
        />
        <FieldError id={errorId(field)} field={field} message={fieldErrors[field]} />
      </div>
    )
  }

  function renderRadioGroup(field, options, labelFor) {
    const hasError = !!fieldErrors[field]
    return (
      <fieldset
        className={styles.group}
        aria-invalid={hasError ? 'true' : undefined}
        aria-describedby={hasError ? errorId(field) : undefined}
      >
        <legend>{t('parameter.' + field)}</legend>
        <div className={styles.options}>
          {options.map((option) => (
            <label key={option} className={styles.option}>
              <input
                type="radio"
                name={field}
                value={option}
                checked={values[field] === option}
                onChange={() => setValue(field, option)}
              />
              <span>{labelFor(option)}</span>
            </label>
          ))}
        </div>
        <FieldError id={errorId(field)} field={field} message={fieldErrors[field]} />
      </fieldset>
    )
  }

  return (
    <main>
      <h1>{t('recordReading.title', { code: identifier })}</h1>
      <Card>
        {savedReading ? (
          <div className={styles.result}>
            <ReadingResult reading={savedReading} />
            <div className={styles.actions}>
              <Button onClick={handleAnother}>{t('recordReading.another')}</Button>
              {backLink}
            </div>
          </div>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            {renderTextField('respiratory_rate', 'numeric')}
            {renderTextField('spo2', 'numeric')}
            {renderRadioGroup('on_oxygen', YES_NO_OPTIONS, (option) => t('yesNo.' + option))}
            {renderTextField('systolic_bp', 'numeric')}
            {renderTextField('heart_rate', 'numeric')}
            {renderRadioGroup(
              'consciousness',
              CONSCIOUSNESS_CODES,
              (code) => `${code} — ${t('consciousness.' + code)}`,
            )}
            {renderTextField('temperature', 'decimal')}

            {errorKey && (
              <p role="alert" className={styles.error}>
                <OctagonXIcon />
                <span>{t(errorKey)}</span>
              </p>
            )}

            <Button type="submit" disabled={isSaving}>
              {t('recordReading.submit')}
            </Button>
          </form>
        )}
      </Card>
    </main>
  )
}
