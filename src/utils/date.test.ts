import { describe, it, expect } from 'vitest'
import { monthGridDays, addMonths, monthLabel, yearMonths, dayOfMonth } from './date'

describe('date grid helpers', () => {
  it('monthGridDays pads to full weeks, Monday-first', () => {
    // July 2026: 1st is a Wednesday -> 2 leading blanks (Mon, Tue)
    const cells = monthGridDays('2026-07')
    expect(cells.length % 7).toBe(0)
    expect(cells.slice(0, 2)).toEqual([null, null])
    expect(cells[2]).toBe('2026-07-01')
    expect(cells).toContain('2026-07-31')
    expect(cells.filter((c) => c !== null)).toHaveLength(31)
  })

  it('addMonths crosses year boundaries', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })

  it('monthLabel is human readable', () => {
    expect(monthLabel('2026-07')).toBe('July 2026')
  })

  it('yearMonths returns 12 padded months', () => {
    const months = yearMonths(2026)
    expect(months).toHaveLength(12)
    expect(months[0]).toBe('2026-01')
    expect(months[11]).toBe('2026-12')
  })

  it('dayOfMonth extracts the day number', () => {
    expect(dayOfMonth('2026-07-09')).toBe(9)
  })
})
