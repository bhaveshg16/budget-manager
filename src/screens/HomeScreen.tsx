import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../data/db'
import { resolveCategoryDisplay } from '../data/categories'
import { currentMonthString } from '../utils/date'

export function HomeScreen() {
  const month = currentMonthString()

  const transactions = useLiveQuery(
    () => db.transactions.where('date').startsWith(month).reverse().sortBy('date'),
    [month],
  )
  const categories = useLiveQuery(() => db.categories.toArray(), [])

  if (!transactions || !categories) return null

  const spent = transactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)
  const income = transactions.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)
  const categoryName = (id: string) => resolveCategoryDisplay(categories, id).name

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-surface border border-border p-3">
          <p className="text-xs text-muted">Spent</p>
          <p className="text-xl font-semibold">₹{spent.toFixed(0)}</p>
        </div>
        <div className="rounded-2xl bg-surface border border-border p-3">
          <p className="text-xs text-muted">Income</p>
          <p className="text-xl font-semibold">₹{income.toFixed(0)}</p>
        </div>
        <div className="rounded-2xl bg-surface border border-border p-3">
          <p className="text-xs text-muted">Net</p>
          <p className="text-xl font-semibold">₹{(income - spent).toFixed(0)}</p>
        </div>
      </section>

      <ul className="flex flex-col gap-2">
        {transactions.map((t) => (
          <li key={t.id}>
            <Link to={`/entry/${t.id}`} className="flex justify-between rounded-lg border border-border p-3">
              <span>{t.description || categoryName(t.categoryId)}</span>
              <span className={t.type === 'expense' ? 'text-red-500' : 'text-accent'}>
                {t.type === 'expense' ? '-' : '+'}₹{t.amount.toFixed(0)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
