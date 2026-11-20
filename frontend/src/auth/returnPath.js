// Return-to page after sign-in (TS-13): only internal app paths, never /login, so no open redirect.
// No control characters or backslashes: the URL parser strips tab/CR/LF, so "/\t/x" would become "//x".

const DEFAULT_PATH = '/patients'
const UNSAFE_CHARS = /[\u0000-\u001F\u007F\\]/

// Returns state.from when it is a safe internal path, otherwise '/patients'. Never throws.
export function returnPath(state) {
  const from = state?.from
  if (typeof from !== 'string') return DEFAULT_PATH
  if (!from.startsWith('/')) return DEFAULT_PATH
  if (from.startsWith('//') || from.startsWith('/\\')) return DEFAULT_PATH
  if (UNSAFE_CHARS.test(from)) return DEFAULT_PATH
  if (from === '/login' || from.startsWith('/login/')) return DEFAULT_PATH
  return from
}
