import { db } from './db'
import { listTransactionsForMonth } from './transactions'
import { listBudgetsForMonth } from './budgets'

export interface CategoryTotal {
  categoryId: string
  categoryName: string
  color: string
  total: number
}

export async function getCategoryBreakdown(month: string, type: 'expense' | 'income'): Promise<CategoryTotal[]> {
  const [transactions, categories] = await Promise.all([listTransactionsForMonth(month), db.categories.toArray()])
  const totals = new Map<string, number>()
  for (const t of transactions) {
    if (t.type !== type) continue
    totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + t.amount)
  }
  return [...totals.entries()].map(([categoryId, total]) => {
    const category = categories.find((c) => c.id === categoryId)
    return { categoryId, categoryName: category?.name ?? 'Unknown', color: category?.color ?? '#94a3b8', total }
  })
}

export interface MonthlyTotal {
  month: string
  expenseTotal: number
  incomeTotal: number
}

export async function getMonthlyTrend(months: string[]): Promise<MonthlyTotal[]> {
  const result: MonthlyTotal[] = []
  for (const month of months) {
    const transactions = await listTransactionsForMonth(month)
    result.push({
      month,
      expenseTotal: transactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0),
      incomeTotal: transactions.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
    })
  }
  return result
}

export interface BudgetVsActual {
  categoryId: string
  categoryName: string
  limitAmount: number
  spent: number
  remaining: number
}

export async function getBudgetVsActual(month: string): Promise<BudgetVsActual[]> {
  const [budgets, categories, breakdown] = await Promise.all([
    listBudgetsForMonth(month), db.categories.toArray(), getCategoryBreakdown(month, 'expense'),
  ])
  return budgets.map((b) => {
    const category = categories.find((c) => c.id === b.categoryId)
    const spent = breakdown.find((row) => row.categoryId === b.categoryId)?.total ?? 0
    return {
      categoryId: b.categoryId, categoryName: category?.name ?? 'Unknown',
      limitAmount: b.limitAmount, spent, remaining: b.limitAmount - spent,
    }
  })
}

export interface MonthComparisonRow {
  categoryId: string
  categoryName: string
  amountA: number
  amountB: number
  delta: number
}

export async function getMonthComparison(monthA: string, monthB: string): Promise<MonthComparisonRow[]> {
  const [breakdownA, breakdownB, categories] = await Promise.all([
    getCategoryBreakdown(monthA, 'expense'), getCategoryBreakdown(monthB, 'expense'), db.categories.toArray(),
  ])
  const categoryIds = new Set([...breakdownA.map((r) => r.categoryId), ...breakdownB.map((r) => r.categoryId)])
  return [...categoryIds].map((categoryId) => {
    const amountA = breakdownA.find((r) => r.categoryId === categoryId)?.total ?? 0
    const amountB = breakdownB.find((r) => r.categoryId === categoryId)?.total ?? 0
    return {
      categoryId, categoryName: categories.find((c) => c.id === categoryId)?.name ?? 'Unknown',
      amountA, amountB, delta: amountB - amountA,
    }
  })
}
