import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { createTransaction } from '../data/transactions'
import { createRecurringRule } from '../data/recurring'
import { todayDateString, nowTimeString } from '../utils/date'
import type { TransactionType } from '../data/db'

export function AddEditEntryScreen() {
  const navigate = useNavigate()
  const categories = useLiveQuery(() => db.categories.toArray(), [])

  const [type, setType] = useState<TransactionType>('expense')
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(todayDateString())
  const [time, setTime] = useState(nowTimeString())
  const [makeRecurring, setMakeRecurring] = useState(false)
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('monthly')

  const filteredCategories = categories?.filter((c) => c.type === type) ?? []
  const effectiveCategoryId = filteredCategories.some((c) => c.id === categoryId)
    ? categoryId
    : (filteredCategories[0]?.id ?? '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const numericAmount = Number(amount)

    await createTransaction({ type, categoryId: effectiveCategoryId, amount: numericAmount, description, date, time })

    if (makeRecurring) {
      const parsedDate = new Date(date + 'T00:00:00')
      await createRecurringRule({
        categoryId: effectiveCategoryId, amount: numericAmount, description, type, frequency,
        dayOfMonth: frequency === 'monthly' ? parsedDate.getDate() : undefined,
        dayOfWeek: frequency === 'weekly' ? parsedDate.getDay() : undefined,
        startDate: date,
      })
    }

    navigate('/')
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex gap-2">
        <button type="button" onClick={() => setType('expense')}
          className={`flex-1 rounded-lg p-2 ${type === 'expense' ? 'bg-red-600 text-white' : 'bg-slate-100'}`}>Expense</button>
        <button type="button" onClick={() => setType('income')}
          className={`flex-1 rounded-lg p-2 ${type === 'income' ? 'bg-emerald-600 text-white' : 'bg-slate-100'}`}>Income</button>
      </div>

      <label htmlFor="category">Category</label>
      <select id="category" required value={effectiveCategoryId} onChange={(e) => setCategoryId(e.target.value)} className="border rounded-lg p-2">
        {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      <label htmlFor="amount">Amount</label>
      <input id="amount" type="number" inputMode="decimal" required value={amount}
        onChange={(e) => setAmount(e.target.value)} className="border rounded-lg p-2" />

      <label htmlFor="description">Description</label>
      <input id="description" type="text" value={description}
        onChange={(e) => setDescription(e.target.value)} className="border rounded-lg p-2" />

      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor="date">Date</label>
          <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded-lg p-2 w-full" />
        </div>
        <div className="flex-1">
          <label htmlFor="time">Time</label>
          <input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="border rounded-lg p-2 w-full" />
        </div>
      </div>

      <label className="flex items-center gap-2">
        <input type="checkbox" checked={makeRecurring} onChange={(e) => setMakeRecurring(e.target.checked)} />
        Make this recurring
      </label>

      {makeRecurring && (
        <select value={frequency} onChange={(e) => setFrequency(e.target.value as 'weekly' | 'monthly')} className="border rounded-lg p-2">
          <option value="monthly">Monthly</option>
          <option value="weekly">Weekly</option>
        </select>
      )}

      <button type="submit" className="rounded-lg bg-teal-700 text-white p-3 font-medium">Save</button>
    </form>
  )
}
