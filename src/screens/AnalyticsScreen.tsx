import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { getCategoryBreakdown, getMonthlyTrend, getBudgetVsActual } from '../data/analytics'
import type { CategoryTotal, MonthlyTotal, BudgetVsActual } from '../data/analytics'
import { currentMonthString } from '../utils/date'

function lastNMonths(n: number, endMonth: string): string[] {
  const [y, m] = endMonth.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 - (n - 1 - i), 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}

export function AnalyticsScreen() {
  const month = currentMonthString()
  const [breakdown, setBreakdown] = useState<CategoryTotal[]>([])
  const [trend, setTrend] = useState<MonthlyTotal[]>([])
  const [budgetVsActual, setBudgetVsActual] = useState<BudgetVsActual[]>([])

  useEffect(() => {
    const months = lastNMonths(6, month)
    getCategoryBreakdown(month, 'expense').then(setBreakdown)
    getMonthlyTrend(months).then(setTrend)
    getBudgetVsActual(month).then(setBudgetVsActual)
  }, [month])

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
    </div>
  )
}
