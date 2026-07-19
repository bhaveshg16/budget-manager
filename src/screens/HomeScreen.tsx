import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../data/db'
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
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Unknown'

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-100 p-3">
          <p className="text-xs text-slate-500">Spent</p>
          <p className="text-xl font-semibold">₹{spent.toFixed(0)}</p>
        </div>
        <div className="rounded-lg bg-slate-100 p-3">
          <p className="text-xs text-slate-500">Income</p>
          <p className="text-xl font-semibold">₹{income.toFixed(0)}</p>
        </div>
        <div className="rounded-lg bg-slate-100 p-3">
          <p className="text-xs text-slate-500">Net</p>
          <p className="text-xl font-semibold">₹{(income - spent).toFixed(0)}</p>
        </div>
      </section>

      <Link to="/entry/new" className="rounded-lg bg-teal-700 text-white text-center p-3 font-medium">
        + Add entry
      </Link>

      <ul className="flex flex-col gap-2">
        {transactions.map((t) => (
          <li key={t.id} className="flex justify-between rounded-lg border p-3">
            <span>{t.description || categoryName(t.categoryId)}</span>
            <span className={t.type === 'expense' ? 'text-red-600' : 'text-emerald-600'}>
              {t.type === 'expense' ? '-' : '+'}₹{t.amount.toFixed(0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
