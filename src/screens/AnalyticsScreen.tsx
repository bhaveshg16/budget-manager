import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { getCategoryBreakdown, getMonthlyTrend, getBudgetVsActual, getCategoryComparison } from '../data/analytics'
import type { CategoryTotal, MonthlyTotal, BudgetVsActual, ComparisonRow } from '../data/analytics'
import { currentMonthString } from '../utils/date'

function lastNMonths(n: number, endMonth: string): string[] {
  const [y, m] = endMonth.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 - (n - 1 - i), 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}

const COMPARE_KEY = 'budget-manager:compareSelection'
interface CompareSelection { months: string[]; excludedCategoryIds: string[] }

function loadSelection(defaultMonths: string[]): CompareSelection {
  try {
    const raw = localStorage.getItem(COMPARE_KEY)
    if (raw) return JSON.parse(raw) as CompareSelection
  } catch { /* corrupted selection falls back to default */ }
  return { months: defaultMonths, excludedCategoryIds: [] }
}

const MONTH_BAR_COLORS = ['#94a3b8', 'var(--color-accent)', '#f59e0b', '#a855f7', '#14b8a6', '#ec4899']

function chipClass(pressed: boolean): string {
  return `rounded-full border px-3 py-1 text-sm ${pressed ? 'bg-accent text-white border-accent' : 'bg-surface text-muted border-border'}`
}

export function AnalyticsScreen() {
  const month = currentMonthString()
  const [breakdown, setBreakdown] = useState<CategoryTotal[]>([])
  const [trend, setTrend] = useState<MonthlyTotal[]>([])
  const [budgetVsActual, setBudgetVsActual] = useState<BudgetVsActual[]>([])
  const [selection, setSelection] = useState<CompareSelection>(() => loadSelection(lastNMonths(2, month)))
  const [compareRows, setCompareRows] = useState<ComparisonRow[]>([])

  useEffect(() => {
    const months = lastNMonths(6, month)
    getCategoryBreakdown(month, 'expense').then(setBreakdown)
    getMonthlyTrend(months).then(setTrend)
    getBudgetVsActual(month).then(setBudgetVsActual)
  }, [month])

  const selectedMonthsKey = selection.months.join(',')
  useEffect(() => {
    getCategoryComparison(selectedMonthsKey.split(',')).then(setCompareRows)
  }, [selectedMonthsKey])

  function updateSelection(next: CompareSelection) {
    setSelection(next)
    localStorage.setItem(COMPARE_KEY, JSON.stringify(next))
  }

  function toggleMonth(m: string) {
    const selected = selection.months.includes(m)
    if (selected && selection.months.length === 1) return // keep at least one month
    const months = selected
      ? selection.months.filter((x) => x !== m)
      : [...selection.months, m].sort()
    updateSelection({ ...selection, months })
  }

  function toggleCategory(categoryId: string) {
    const excluded = selection.excludedCategoryIds.includes(categoryId)
    const excludedCategoryIds = excluded
      ? selection.excludedCategoryIds.filter((id) => id !== categoryId)
      : [...selection.excludedCategoryIds, categoryId]
    updateSelection({ ...selection, excludedCategoryIds })
  }

  const monthOptions = lastNMonths(12, month)
  const visibleRows = compareRows.filter((r) => !selection.excludedCategoryIds.includes(r.categoryId))
  const chartData = visibleRows.map((r) => ({ name: r.categoryName, ...r.amounts }))

  return (
    <div className="flex flex-col gap-8">
      <section className="bg-surface border border-border rounded-2xl p-3">
        <h2 className="font-semibold mb-2 text-text">Spending by category</h2>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={breakdown} dataKey="total" nameKey="categoryName" outerRadius={80}>
              {breakdown.map((c) => <Cell key={c.categoryId} fill={c.color} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </section>

      <section className="bg-surface border border-border rounded-2xl p-3">
        <h2 className="font-semibold mb-2 text-text">Trend (last 6 months)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trend}>
            <XAxis dataKey="month" tick={{ fill: 'var(--color-muted)' }} /><YAxis tick={{ fill: 'var(--color-muted)' }} /><Tooltip />
            <Line type="monotone" dataKey="expenseTotal" stroke="#ef4444" name="Expenses" />
            <Line type="monotone" dataKey="incomeTotal" stroke="var(--color-accent)" name="Income" />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section className="bg-surface border border-border rounded-2xl p-3">
        <h2 className="font-semibold mb-2 text-text">Budget vs actual</h2>
        <ul className="flex flex-col gap-2">
          {budgetVsActual.map((row) => (
            <li key={row.categoryId}>
              <div className="flex justify-between text-sm"><span>{row.categoryName}</span><span>₹{row.spent} / ₹{row.limitAmount}</span></div>
              <div className="h-2 rounded bg-border">
                <div className="h-2 rounded bg-accent" style={{ width: `${
                  row.limitAmount > 0
                    ? Math.min(100, (row.spent / row.limitAmount) * 100)
                    : row.spent > 0 ? 100 : 0
                }%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-surface border border-border rounded-2xl p-3">
        <h2 className="font-semibold mb-2 text-text">Compare</h2>
        <div className="flex flex-wrap gap-2 mb-2">
          {monthOptions.map((m) => {
            const pressed = selection.months.includes(m)
            return (
              <button key={m} type="button" aria-pressed={pressed} className={chipClass(pressed)} onClick={() => toggleMonth(m)}>
                {m}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-2 mb-2">
          {compareRows.map((r) => {
            const pressed = !selection.excludedCategoryIds.includes(r.categoryId)
            return (
              <button key={r.categoryId} type="button" aria-pressed={pressed} className={chipClass(pressed)} onClick={() => toggleCategory(r.categoryId)}>
                {r.categoryName}
              </button>
            )
          })}
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData}>
            <XAxis dataKey="name" tick={{ fill: 'var(--color-muted)' }} /><YAxis tick={{ fill: 'var(--color-muted)' }} /><Tooltip />
            {selection.months.map((m, i) => (
              <Bar key={m} dataKey={m} name={m} fill={MONTH_BAR_COLORS[i % MONTH_BAR_COLORS.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-left">
                <th className="py-1 pr-2 font-medium">Category</th>
                {selection.months.map((m) => <th key={m} className="py-1 pr-2 font-medium">{m}</th>)}
                {selection.months.length === 2 && <th className="py-1 font-medium">Δ</th>}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.categoryId}>
                  <td className="py-1 pr-2">{r.categoryName}</td>
                  {selection.months.map((m) => <td key={m} className="py-1 pr-2">₹{r.amounts[m] ?? 0}</td>)}
                  {selection.months.length === 2 && (
                    <td className="py-1">₹{(r.amounts[selection.months[1]] ?? 0) - (r.amounts[selection.months[0]] ?? 0)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
