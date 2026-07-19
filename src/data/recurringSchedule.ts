import { formatDate } from '../utils/date'

export interface ScheduleRule {
  frequency: 'weekly' | 'monthly'
  dayOfMonth?: number
  dayOfWeek?: number
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate() // month: 1-12
}

/** Returns YYYY-MM-DD occurrence dates strictly after `fromExclusive` and up to and including `toInclusive`. */
export function occurrenceDatesInRange(rule: ScheduleRule, fromExclusive: string, toInclusive: string): string[] {
  const from = new Date(fromExclusive + 'T00:00:00')
  const to = new Date(toInclusive + 'T00:00:00')
  const results: string[] = []

  if (rule.frequency === 'monthly') {
    const day = rule.dayOfMonth ?? 1
    const cursor = new Date(from.getFullYear(), from.getMonth(), 1)
    while (cursor <= to) {
      const year = cursor.getFullYear()
      const month = cursor.getMonth() + 1
      const occurrence = new Date(year, month - 1, Math.min(day, daysInMonth(year, month)))
      if (occurrence > from && occurrence <= to) {
        results.push(formatDate(occurrence))
      }
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return results
  }

  const targetDow = rule.dayOfWeek ?? 0
  const cursor = new Date(from)
  cursor.setDate(cursor.getDate() + 1)
  while (cursor <= to) {
    if (cursor.getDay() === targetDow) results.push(formatDate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return results
}
