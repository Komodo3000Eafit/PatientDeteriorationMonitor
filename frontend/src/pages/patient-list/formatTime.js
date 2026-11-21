// Time text for the patient list (US-02, research R7): "{relative} ({clock})",
// e.g. "hace 3 min (14:32)" / "3 min ago (14:32)". Pure presentation helper, no React.
// Contract: specs/016-patient-list/contracts/ui.md "Time text".

const SECOND_MS = 1000
const MINUTE_S = 60
const HOUR_S = 60 * MINUTE_S
const DAY_S = 24 * HOUR_S

function isSameLocalDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  )
}

// Relative part: seconds under 1 min, minutes under 1 h, hours under 24 h, else days; rounded down.
// A date after `now` (clock skew) is shown as 0 s. The value is negated so it reads as the past;
// -0 keeps the past form ("hace 0 s" / "0 sec. ago").
function formatRelative(date, now, lang) {
  const rtf = new Intl.RelativeTimeFormat(lang, { style: 'short', numeric: 'always' })
  const elapsedS = Math.max(0, Math.floor((now.getTime() - date.getTime()) / SECOND_MS))
  if (elapsedS < MINUTE_S) return rtf.format(-elapsedS, 'second')
  if (elapsedS < HOUR_S) return rtf.format(-Math.floor(elapsedS / MINUTE_S), 'minute')
  if (elapsedS < DAY_S) return rtf.format(-Math.floor(elapsedS / HOUR_S), 'hour')
  return rtf.format(-Math.floor(elapsedS / DAY_S), 'day')
}

// Clock part: hour and minute on the 24-hour clock in every language, plus day and short month
// when not on the same local day as `now`.
function formatClock(date, now, lang) {
  const options = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
  if (!isSameLocalDay(date, now)) {
    options.day = 'numeric'
    options.month = 'short'
  }
  return new Intl.DateTimeFormat(lang, options).format(date)
}

export function formatSince(date, now, lang) {
  return `${formatRelative(date, now, lang)} (${formatClock(date, now, lang)})`
}
