import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import type { TransactionType } from '../data/db'
import { createCategory, updateCategory, deleteCategory } from '../data/categories'
import { setBudgetLimit } from '../data/budgets'
import { currentMonthString } from '../utils/date'

export function CategoriesBudgetsScreen() {
  const month = currentMonthString()
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const budgets = useLiveQuery(() => db.budgets.where('month').equals(month).toArray(), [month])
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#3b82f6')
  const [newType, setNewType] = useState<TransactionType>('expense')

  if (!categories || !budgets) return null

  const active = categories.filter((c) => !c.deletedAt)
  const expenseCategories = active.filter((c) => c.type === 'expense')
  const limitFor = (categoryId: string) => budgets.find((b) => b.categoryId === categoryId)?.limitAmount ?? ''

  const addCategory = async () => {
    const name = newName.trim()
    if (!name) return
    await createCategory({ name, color: newColor, type: newType })
    setNewName('')
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-lg font-semibold">Categories</h1>
        {active.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            <input
              type="color"
              aria-label={`Color for ${c.name}`}
              defaultValue={c.color}
              onBlur={(e) => {
                if (e.target.value !== c.color) updateCategory(c.id, { color: e.target.value })
              }}
              className="h-8 w-8 shrink-0 rounded border border-border bg-surface"
            />
            <input
              aria-label={`Rename ${c.name}`}
              defaultValue={c.name}
              onBlur={(e) => {
                const name = e.target.value.trim()
                if (name && name !== c.name) updateCategory(c.id, { name })
                else if (!name) e.target.value = c.name
              }}
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface p-2"
            />
            <span className="text-xs text-muted w-14">{c.type}</span>
            <button
              type="button"
              aria-label={`Delete ${c.name}`}
              onClick={() => {
                if (window.confirm(`Delete ${c.name}? Its transactions will show as Uncategorized.`)) {
                  deleteCategory(c.id)
                }
              }}
              className="rounded-lg border border-border px-2 py-1 text-sm text-muted"
            >
              Delete
            </button>
          </div>
        ))}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); addCategory() }}
        >
          <input
            type="color"
            aria-label="New category color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="h-8 w-8 shrink-0 rounded border border-border bg-surface"
          />
          <input
            aria-label="New category name"
            placeholder="New category"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface p-2"
          />
          <select
            aria-label="New category type"
            value={newType}
            onChange={(e) => setNewType(e.target.value as TransactionType)}
            className="rounded-lg border border-border bg-surface p-2"
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
          <button type="submit" className="rounded-lg bg-accent px-3 py-2 text-sm text-white">
            Add category
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Monthly Budgets</h2>
        {expenseCategories.map((c) => (
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
      </section>
    </div>
  )
}
