import { describe, it, expect } from 'vitest'
import { occurrenceDatesInRange } from './recurringSchedule'

describe('occurrenceDatesInRange', () => {
  it('returns monthly occurrences strictly after "from" up to and including "to"', () => {
    const rule = { frequency: 'monthly' as const, dayOfMonth: 1 }
    const dates = occurrenceDatesInRange(rule, '2026-01-01', '2026-04-01')
    expect(dates).toEqual(['2026-02-01', '2026-03-01', '2026-04-01'])
  })

  it('clamps day-of-month 31 to the last day of shorter months', () => {
    const rule = { frequency: 'monthly' as const, dayOfMonth: 31 }
    const dates = occurrenceDatesInRange(rule, '2026-01-15', '2026-03-31')
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })

  it('returns weekly occurrences on the target day of week', () => {
    const rule = { frequency: 'weekly' as const, dayOfWeek: 1 } // Monday
    const dates = occurrenceDatesInRange(rule, '2026-07-01', '2026-07-15')
    expect(dates).toEqual(['2026-07-06', '2026-07-13'])
  })

  it('returns an empty array when the range has no occurrence', () => {
    const rule = { frequency: 'monthly' as const, dayOfMonth: 15 }
    expect(occurrenceDatesInRange(rule, '2026-07-16', '2026-07-31')).toEqual([])
  })
})
