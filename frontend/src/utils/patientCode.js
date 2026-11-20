// Patient code format check (TS-13). Presentation only: no clinical logic, no backend call.

// Upper-case letters, digits and '-', 1 to 20 characters (GLOSSARY "patient code").
const PATIENT_CODE_PATTERN = /^[A-Z0-9-]{1,20}$/

// True only for a string in the patient code format; false for anything else.
export function isPatientCode(value) {
  return typeof value === 'string' && PATIENT_CODE_PATTERN.test(value)
}
