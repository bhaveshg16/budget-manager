import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { spendByDayForMonth, spendByMonthForYear } from '../data/analytics'
import { monthGridDays, monthLabel, addMonths, dayOfMonth, currentMonthString, yearMonths } from '../utils/date'
import { heatLevel } from '../utils/heat'
import { DaySheet } from '../components/DaySheet'

const HEAT_BG = ['bg-transparent', 'bg-heat-1', 'bg-heat-2', 'bg-heat-3', 'bg-heat-4', 'bg-heat-5']
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export function CalendarScreen() {
  const [month, setMonth] = useState(currentMonthString())
  const [view, setView] = useState<'month' | 'year'>('month')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const year = Number(month.slice(0, 4))
  const dayTotals = useLiveQuery(() => spendByDayForMonth(month), [month])
  const monthTotals = useLiveQuery(() => spendByMonthForYear(year), [year])

  if (view === 'year') {
    if (!monthTotals) return null
    const months = yearMonths(year)
    const yearMax = Math.max(0, ...monthTotals.values())
    const yearSpent = [...monthTotals.values()].reduce((s, v) => s + v, 0)
    return (
      <div className="flex flex-col gap-4">
        <header className="flex items-center justify-between">
          <button aria-label="Previous year" onClick={() => setMonth(addMonths(month, -12))}
            className="rounded-lg px-3 py-1 text-muted">‹</button>
          <div className="text-center">
            <p data-testid="year-title" className="text-lg font-semibold">{year}</p>
            <p className="text-sm text-muted">Spent ₹{yearSpent.toFixed(0)}</p>
          </div>
          <button aria-label="Next year" onClick={() => setMonth(addMonths(month, 12))}
            className="rounded-lg px-3 py-1 text-muted">›</button>
        </header>
        <div className="grid grid-cols-3 gap-2">
          {months.map((m) => {
            const spent = monthTotals.get(m) ?? 0
            const level = heatLevel(spent, yearMax)
            return (
              <button key={m} data-testid={`month-${m.slice(5)}`}
                onClick={() => { setMonth(m); setView('month') }}
                className={`flex aspect-square flex-col items-center justify-center rounded-xl border border-border ${HEAT_BG[level]}`}>
                <span className="text-sm text-text">{monthLabel(m).split(' ')[0].slice(0, 3)}</span>
                {spent > 0 && <span className="text-xs text-muted">{spent.toFixed(0)}</span>}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (!dayTotals) return null

  const cells = monthGridDays(month)
  const max = Math.max(0, ...dayTotals.values())
  const monthSpent = [...dayTotals.values()].reduce((s, v) => s + v, 0)

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <button aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}
          className="rounded-lg px-3 py-1 text-muted">‹</button>
        <div className="text-center">
          <button data-testid="calendar-title" onClick={() => setView('year')} className="text-lg font-semibold">
            {monthLabel(month)}
          </button>
          <p className="text-sm text-muted">Spent ₹{monthSpent.toFixed(0)}</p>
        </div>
        <button aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}
          className="rounded-lg px-3 py-1 text-muted">›</button>
      </header>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
        {WEEKDAYS.map((d, i) => <div key={i}>{d}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />
          const spent = dayTotals.get(date) ?? 0
          const level = heatLevel(spent, max)
          return (
            <button key={i} data-testid={`day-${date}`} aria-label={`${date}, spent ₹${spent}`} onClick={() => setSelectedDay(date)}
              className={`flex aspect-square flex-col items-center justify-center rounded-lg border border-border text-xs ${HEAT_BG[level]}`}>
              <span className="text-text">{dayOfMonth(date)}</span>
              {spent > 0 && <span className="text-[10px] text-muted">{spent.toFixed(0)}</span>}
            </button>
          )
        })}
      </div>

      {selectedDay && <DaySheet date={selectedDay} onClose={() => setSelectedDay(null)} />}
    </div>
  )
}
