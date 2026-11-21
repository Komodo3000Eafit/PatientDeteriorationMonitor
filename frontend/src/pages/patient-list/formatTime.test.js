// US-02 time text tests (AC6, AC15; research R7), following specs/016-patient-list/contracts/ui.md
// "Time text": "{relative} ({clock})", the date added when it is not the same local day.
// Expected texts are what Intl produces in Node for 'es' and 'en' (not the contract's examples).
// Every date is built with the local-time Date constructor, so the clock part does not depend on
// the machine's time zone. Pure function, no React, no backend.
import { describe, it, expect } from 'vitest'
import { formatClockSeconds, formatSince } from './formatTime.js'

// Fixed "now": 21 November 2026, 14:35:00 local time.
const NOW = new Date(2026, 10, 21, 14, 35, 0)
const secondsAgo = (s) => new Date(NOW.getTime() - s * 1000)

describe('US-02 formatSince relative and clock text', () => {
  it('AC6 AC15 30 seconds ago', () => {
    expect(formatSince(secondsAgo(30), NOW, 'es')).toBe('hace 30 s (14:34)')
    expect(formatSince(secondsAgo(30), NOW, 'en')).toBe('30 sec. ago (14:34)')
  })

  it('AC6 AC15 3 minutes ago (the "hace 3 min (14:32)" example)', () => {
    expect(formatSince(secondsAgo(180), NOW, 'es')).toBe('hace 3 min (14:32)')
    expect(formatSince(secondsAgo(180), NOW, 'en')).toBe('3 min. ago (14:32)')
  })

  it('AC6 AC15 2 hours ago', () => {
    expect(formatSince(secondsAgo(2 * 3600), NOW, 'es')).toBe('hace 2 h (12:35)')
    expect(formatSince(secondsAgo(2 * 3600), NOW, 'en')).toBe('2 hr. ago (12:35)')
  })

  it('AC6 AC15 another day adds the date', () => {
    const twoDaysAgo = new Date(2026, 10, 19, 14, 34, 0)
    expect(formatSince(twoDaysAgo, NOW, 'es')).toBe('hace 2 d (19 nov, 14:34)')
    expect(formatSince(twoDaysAgo, NOW, 'en')).toBe('2 days ago (Nov 19, 14:34)')
  })

  it('AC6 yesterday a few minutes ago still adds the date (not the same local day)', () => {
    const now = new Date(2026, 10, 21, 0, 10, 0)
    const lateYesterday = new Date(2026, 10, 20, 23, 50, 0)
    expect(formatSince(lateYesterday, now, 'es')).toBe('hace 20 min (20 nov, 23:50)')
    expect(formatSince(lateYesterday, now, 'en')).toBe('20 min. ago (Nov 20, 23:50)')
  })

  it('AC6 band edges: 59 s stays seconds, 60 s is 1 min, 3599 s is 59 min, 3600 s is 1 h', () => {
    expect(formatSince(secondsAgo(59), NOW, 'es')).toBe('hace 59 s (14:34)')
    expect(formatSince(secondsAgo(60), NOW, 'es')).toBe('hace 1 min (14:34)')
    expect(formatSince(secondsAgo(3599), NOW, 'es')).toBe('hace 59 min (13:35)')
    expect(formatSince(secondsAgo(3600), NOW, 'es')).toBe('hace 1 h (13:35)')
  })

  it('AC6 now and a date slightly in the future (clock skew) read as 0 s in the past', () => {
    expect(formatSince(NOW, NOW, 'es')).toBe('hace 0 s (14:35)')
    expect(formatSince(new Date(NOW.getTime() + 10000), NOW, 'es')).toBe('hace 0 s (14:35)')
    expect(formatSince(NOW, NOW, 'en')).toBe('0 sec. ago (14:35)')
  })
})

// Change request 2026-11-21: the last-update line shows the exact local time with seconds on the
// 24-hour clock (contracts/ui.md "Last-update line"; AC6, AC11, AC15).
describe('US-02 formatClockSeconds (last-update line)', () => {
  it('AC6 AC11 afternoon time with seconds, 24-hour, in Spanish and English', () => {
    const date = new Date(2026, 10, 21, 16, 5, 12)
    expect(formatClockSeconds(date, 'es')).toBe('16:05:12')
    expect(formatClockSeconds(date, 'en')).toBe('16:05:12')
  })

  it('AC11 just after midnight is 00, never 24 or 12 AM', () => {
    const date = new Date(2026, 10, 22, 0, 5, 9)
    expect(formatClockSeconds(date, 'es')).toBe('00:05:09')
    expect(formatClockSeconds(date, 'en')).toBe('00:05:09')
  })

  it('AC11 noon and the last second of the day', () => {
    expect(formatClockSeconds(new Date(2026, 10, 21, 12, 0, 0), 'en')).toBe('12:00:00')
    expect(formatClockSeconds(new Date(2026, 10, 21, 23, 59, 59), 'es')).toBe('23:59:59')
  })

  it('AC6 no relative part and no date, even for another day', () => {
    const text = formatClockSeconds(new Date(2026, 10, 19, 9, 1, 2), 'es')
    expect(text).toBe('09:01:02')
    expect(text).not.toMatch(/hace|nov/)
  })
})
