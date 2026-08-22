import { db } from './db'
import { listTransactionsForMonth } from './transactions'
import { listBudgetsForMonth } from './budgets'
import { resolveCategoryDisplay } from './categories'
import { yearMonths } from '../utils/date'

export interface CategoryTotal {
  categoryId: string
  categoryName: string
  color: string
  total: number
}

export async function getCategoryBreakdown(month: string, type: 'expense' | 'income'): Promise<CategoryTotal[]> {
  const [transactions, categories] = await Promise.all([listTransactionsForMonth(month), db.categories.toArray()])
  const totals = new Map<string, CategoryTotal>()
  for (const t of transactions) {
    if (t.type !== type) continue
    const display = resolveCategoryDisplay(categories, t.categoryId)
    const row = totals.get(display.id) ?? { categoryId: display.id, categoryName: display.name, color: display.color, total: 0 }
    row.total += t.amount
    totals.set(display.id, row)
  }
  return [...totals.values()]
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
  return budgets.flatMap((b) => {
    const category = categories.find((c) => c.id === b.categoryId)
    if (!category || category.deletedAt) return []
    const spent = breakdown.find((row) => row.categoryId === b.categoryId)?.total ?? 0
    return {
      categoryId: b.categoryId, categoryName: category.name,
      limitAmount: b.limitAmount, spent, remaining: b.limitAmount - spent,
    }
  })
}

export interface ComparisonRow {
  categoryId: string
  categoryName: string
  color: string
  amounts: Record<string, number> // month (YYYY-MM) -> expense total
}

export async function getCategoryComparison(months: string[]): Promise<ComparisonRow[]> {
  const rows = new Map<string, ComparisonRow>()
  for (const month of months) {
    for (const item of await getCategoryBreakdown(month, 'expense')) {
      const row = rows.get(item.categoryId) ??
        { categoryId: item.categoryId, categoryName: item.categoryName, color: item.color, amounts: {} }
      row.amounts[month] = item.total
      rows.set(item.categoryId, row)
    }
  }
  return [...rows.values()]
}

export async function spendByDayForMonth(month: string): Promise<Map<string, number>> {
  const transactions = await listTransactionsForMonth(month)
  const map = new Map<string, number>()
  for (const t of transactions) {
    if (t.type !== 'expense') continue
    map.set(t.date, (map.get(t.date) ?? 0) + t.amount)
  }
  return map
}

export async function spendByMonthForYear(year: number): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  for (const month of yearMonths(year)) {
    const transactions = await listTransactionsForMonth(month)
    const total = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    if (total > 0) map.set(month, total)
  }
  return map
}
