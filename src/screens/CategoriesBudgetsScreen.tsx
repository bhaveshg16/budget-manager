import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { setBudgetLimit } from '../data/budgets'
import { currentMonthString } from '../utils/date'

export function CategoriesBudgetsScreen() {
  const month = currentMonthString()
  const categories = useLiveQuery(() => db.categories.where('type').equals('expense').toArray(), [])
  const budgets = useLiveQuery(() => db.budgets.where('month').equals(month).toArray(), [month])

  if (!categories || !budgets) return null

  const limitFor = (categoryId: string) => budgets.find((b) => b.categoryId === categoryId)?.limitAmount ?? ''

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-lg font-semibold">Monthly Budgets</h1>
      {categories.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-2">
          <label htmlFor={`budget-${c.id}`}>{c.name}</label>
          <input
            id={`budget-${c.id}`}
            aria-label={c.name}
            type="number"
            defaultValue={limitFor(c.id)}
            onBlur={(e) => {
              if (e.target.value === '') return
              const value = Number(e.target.value)
              if (!Number.isNaN(value) && value >= 0) setBudgetLimit(c.id, month, value)
            }}
            className="border border-border bg-surface rounded-lg p-2 w-28"
          />
        </div>
      ))}
    </div>
  )
}
