import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { spendByDayForMonth } from '../data/analytics'
import { monthGridDays, monthLabel, addMonths, dayOfMonth, currentMonthString } from '../utils/date'
import { heatLevel } from '../utils/heat'

const HEAT_BG = ['bg-transparent', 'bg-heat-1', 'bg-heat-2', 'bg-heat-3', 'bg-heat-4', 'bg-heat-5']
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export function CalendarScreen() {
  const [month, setMonth] = useState(currentMonthString())
  const dayTotals = useLiveQuery(() => spendByDayForMonth(month), [month])

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
          <p data-testid="calendar-title" className="text-lg font-semibold">{monthLabel(month)}</p>
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
            <div key={i} data-testid={`day-${date}`}
              className={`flex aspect-square flex-col items-center justify-center rounded-lg border border-border text-xs ${HEAT_BG[level]}`}>
              <span className="text-text">{dayOfMonth(date)}</span>
              {spent > 0 && <span className="text-[10px] text-muted">{spent.toFixed(0)}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
