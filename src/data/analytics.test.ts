import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { createCategory } from './categories'
import { createTransaction } from './transactions'
import { setBudgetLimit } from './budgets'
import { getCategoryBreakdown, getMonthlyTrend, getBudgetVsActual, getMonthComparison } from './analytics'

describe('analytics', () => {
  beforeEach(async () => {
    await db.categories.clear()
    await db.transactions.clear()
    await db.budgets.clear()
  })

  it('breaks spending down by category for a month', async () => {
    const food = await createCategory({ name: 'Food', color: '#f59e0b', type: 'expense' })
    const rent = await createCategory({ name: 'Rent', color: '#ef4444', type: 'expense' })
    await createTransaction({ type: 'expense', categoryId: food.id, amount: 300, description: '', date: '2026-07-01', time: '09:00' })
    await createTransaction({ type: 'expense', categoryId: food.id, amount: 200, description: '', date: '2026-07-15', time: '09:00' })
    await createTransaction({ type: 'expense', categoryId: rent.id, amount: 15000, description: '', date: '2026-07-01', time: '09:00' })

    const breakdown = await getCategoryBreakdown('2026-07', 'expense')

    expect(breakdown).toEqual(expect.arrayContaining([
      expect.objectContaining({ categoryId: food.id, total: 500 }),
      expect.objectContaining({ categoryId: rent.id, total: 15000 }),
    ]))
  })

  it('produces a monthly trend of totals', async () => {
    const food = await createCategory({ name: 'Food', color: '#f59e0b', type: 'expense' })
    await createTransaction({ type: 'expense', categoryId: food.id, amount: 100, description: '', date: '2026-06-01', time: '09:00' })
    await createTransaction({ type: 'expense', categoryId: food.id, amount: 200, description: '', date: '2026-07-01', time: '09:00' })

    const trend = await getMonthlyTrend(['2026-06', '2026-07'])
    expect(trend).toEqual([
      { month: '2026-06', expenseTotal: 100, incomeTotal: 0 },
      { month: '2026-07', expenseTotal: 200, incomeTotal: 0 },
    ])
  })

  it('compares budget limit against actual spend', async () => {
    const food = await createCategory({ name: 'Food', color: '#f59e0b', type: 'expense' })
    await setBudgetLimit(food.id, '2026-07', 1000)
    await createTransaction({ type: 'expense', categoryId: food.id, amount: 400, description: '', date: '2026-07-05', time: '09:00' })

    const result = await getBudgetVsActual('2026-07')
    expect(result).toEqual([
      expect.objectContaining({ categoryId: food.id, limitAmount: 1000, spent: 400, remaining: 600 }),
    ])
  })

  it('compares totals between two months', async () => {
    const food = await createCategory({ name: 'Food', color: '#f59e0b', type: 'expense' })
    await createTransaction({ type: 'expense', categoryId: food.id, amount: 100, description: '', date: '2026-06-01', time: '09:00' })
    await createTransaction({ type: 'expense', categoryId: food.id, amount: 150, description: '', date: '2026-07-01', time: '09:00' })

    const comparison = await getMonthComparison('2026-06', '2026-07')
    expect(comparison).toEqual([
      expect.objectContaining({ categoryId: food.id, amountA: 100, amountB: 150 }),
    ])
  })

  it('includes a category that only has spending in one of the two months', async () => {
    const rent = await createCategory({ name: 'Rent', color: '#ef4444', type: 'expense' })
    await createTransaction({ type: 'expense', categoryId: rent.id, amount: 500, description: '', date: '2026-06-01', time: '09:00' })
    // no transaction for rent in 2026-07

    const comparison = await getMonthComparison('2026-06', '2026-07')
    expect(comparison).toEqual(expect.arrayContaining([
      expect.objectContaining({ categoryId: rent.id, amountA: 500, amountB: 0 }),
    ]))
  })

  it('excludes categories that have spending but no budget set', async () => {
    const food = await createCategory({ name: 'Food', color: '#f59e0b', type: 'expense' })
    const rent = await createCategory({ name: 'Rent', color: '#ef4444', type: 'expense' })
    await setBudgetLimit(food.id, '2026-07', 1000)
    await createTransaction({ type: 'expense', categoryId: food.id, amount: 400, description: '', date: '2026-07-05', time: '09:00' })
    await createTransaction({ type: 'expense', categoryId: rent.id, amount: 15000, description: '', date: '2026-07-01', time: '09:00' })

    const result = await getBudgetVsActual('2026-07')
    expect(result).toHaveLength(1)
    expect(result.some((row) => row.categoryId === rent.id)).toBe(false)
  })
})
