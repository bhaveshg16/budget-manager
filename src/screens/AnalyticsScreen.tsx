import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { getCategoryBreakdown, getMonthlyTrend, getBudgetVsActual, getMonthComparison } from '../data/analytics'
import type { CategoryTotal, MonthlyTotal, BudgetVsActual, MonthComparisonRow } from '../data/analytics'
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
  const [comparison, setComparison] = useState<MonthComparisonRow[]>([])

  useEffect(() => {
    const months = lastNMonths(6, month)
    const previousMonth = months[months.length - 2]
    getCategoryBreakdown(month, 'expense').then(setBreakdown)
    getMonthlyTrend(months).then(setTrend)
    getBudgetVsActual(month).then(setBudgetVsActual)
    getMonthComparison(previousMonth, month).then(setComparison)
  }, [month])

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="font-semibold mb-2">Spending by category</h2>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={breakdown} dataKey="total" nameKey="categoryName" outerRadius={80}>
              {breakdown.map((c) => <Cell key={c.categoryId} fill={c.color} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Trend (last 6 months)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trend}>
            <XAxis dataKey="month" /><YAxis /><Tooltip />
            <Line type="monotone" dataKey="expenseTotal" stroke="#ef4444" name="Expenses" />
            <Line type="monotone" dataKey="incomeTotal" stroke="#059669" name="Income" />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Budget vs actual</h2>
        <ul className="flex flex-col gap-2">
          {budgetVsActual.map((row) => (
            <li key={row.categoryId}>
              <div className="flex justify-between text-sm"><span>{row.categoryName}</span><span>₹{row.spent} / ₹{row.limitAmount}</span></div>
              <div className="h-2 rounded bg-slate-100">
                <div className="h-2 rounded bg-teal-600" style={{ width: `${
                  row.limitAmount > 0
                    ? Math.min(100, (row.spent / row.limitAmount) * 100)
                    : row.spent > 0 ? 100 : 0
                }%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-semibold mb-2">This month vs last month</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={comparison}>
            <XAxis dataKey="categoryName" /><YAxis /><Tooltip />
            <Bar dataKey="amountA" fill="#94a3b8" name="Last month" />
            <Bar dataKey="amountB" fill="#0f766e" name="This month" />
          </BarChart>
        </ResponsiveContainer>
      </section>
    </div>
  )
}
