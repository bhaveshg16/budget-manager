import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../data/db'
import { listTransactionsForDate } from '../data/transactions'

export function DaySheet({ date, onClose }: { date: string; onClose: () => void }) {
  const navigate = useNavigate()
  const transactions = useLiveQuery(() => listTransactionsForDate(date), [date])
  const categories = useLiveQuery(() => db.categories.toArray(), [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  if (!transactions || !categories) return null

  const spent = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const name = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Unknown'

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-20 flex items-end bg-black/40" onClick={onClose}>
      <div className="w-full rounded-t-2xl bg-surface p-4" onClick={(e) => e.stopPropagation()}>
        <p className="text-center text-sm text-muted">{date} · ₹{spent.toFixed(0)}</p>
        <ul className="my-3 flex flex-col gap-2">
          {transactions.map((t) => (
            <li key={t.id} className="flex justify-between rounded-lg border border-border p-3">
              <span>{t.description || name(t.categoryId)}</span>
              <span className={t.type === 'expense' ? 'text-red-500' : 'text-accent'}>
                {t.type === 'expense' ? '-' : '+'}₹{t.amount.toFixed(0)}
              </span>
            </li>
          ))}
          {transactions.length === 0 && <li className="py-4 text-center text-sm text-muted">No entries</li>}
        </ul>
        <button onClick={() => navigate(`/entry/new?date=${date}`)}
          className="w-full rounded-xl bg-accent p-3 font-medium text-white">+ add to this day</button>
      </div>
    </div>
  )
}
