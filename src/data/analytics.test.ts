import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { createCategory } from './categories'
import { createTransaction, listTransactionsForDate } from './transactions'
import { setBudgetLimit } from './budgets'
import { getCategoryBreakdown, getMonthlyTrend, getBudgetVsActual, getCategoryComparison, spendByDayForMonth, spendByMonthForYear } from './analytics'

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

  it('builds a per-category per-month comparison', async () => {
    await db.categories.bulkAdd([
      { id: 'c1', name: 'Food', color: '#f59e0b', type: 'expense', isDefault: true, updatedAt: 1 },
      { id: 'c2', name: 'Rent', color: '#ef4444', type: 'expense', isDefault: true, updatedAt: 1 },
      { id: 'c3', name: 'Transport', color: '#14b8a6', type: 'expense', isDefault: true, updatedAt: 1 },
    ])
    await db.transactions.bulkAdd([
      { id: 't1', type: 'expense', categoryId: 'c1', amount: 10, description: '', date: '2026-07-05', time: '09:00', createdAt: 1, updatedAt: 1 },
      { id: 't2', type: 'expense', categoryId: 'c1', amount: 20, description: '', date: '2026-08-05', time: '09:00', createdAt: 1, updatedAt: 1 },
      { id: 't3', type: 'expense', categoryId: 'c2', amount: 99, description: '', date: '2026-08-06', time: '09:00', createdAt: 1, updatedAt: 1 },
      { id: 't4', type: 'expense', categoryId: 'c3', amount: 55, description: '', date: '2026-07-10', time: '09:00', createdAt: 1, updatedAt: 1 },
    ])

    const rows = await getCategoryComparison(['2026-07', '2026-08'])

    expect(rows).toContainEqual({ categoryId: 'c1', categoryName: 'Food', color: '#f59e0b', amounts: { '2026-07': 10, '2026-08': 20 } })
    expect(rows).toContainEqual({ categoryId: 'c2', categoryName: 'Rent', color: '#ef4444', amounts: { '2026-08': 99 } })
    expect(rows).toContainEqual({ categoryId: 'c3', categoryName: 'Transport', color: '#14b8a6', amounts: { '2026-07': 55 } })
  })

  it('lumps deleted and missing categories into one Uncategorized bucket', async () => {
    await db.categories.add({ id: 'c-gone', name: 'Old', color: '#000', type: 'expense', isDefault: false, deletedAt: 1, updatedAt: 1 })
    await db.transactions.bulkAdd([
      { id: 't1', type: 'expense', categoryId: 'c-gone', amount: 10, description: '', date: '2026-08-05', time: '09:00', createdAt: 1, updatedAt: 1 },
      { id: 't2', type: 'expense', categoryId: 'missing', amount: 5, description: '', date: '2026-08-06', time: '09:00', createdAt: 1, updatedAt: 1 },
    ])

    const breakdown = await getCategoryBreakdown('2026-08', 'expense')
    expect(breakdown).toEqual([{ categoryId: 'uncategorized', categoryName: 'Uncategorized', color: '#94a3b8', total: 15 }])
  })

  it('excludes budgets for deleted categories from budget vs actual', async () => {
    await db.categories.add({ id: 'c-gone', name: 'Old', color: '#000', type: 'expense', isDefault: false, deletedAt: 1, updatedAt: 1 })
    await db.budgets.add({ id: 'b1', categoryId: 'c-gone', month: '2026-08', limitAmount: 100, updatedAt: 1 })

    expect(await getBudgetVsActual('2026-08')).toEqual([])
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

describe('calendar aggregations', () => {
  beforeEach(async () => {
    await db.transactions.clear()
  })

  it('spendByDayForMonth sums expenses per day and excludes income', async () => {
    await createTransaction({ type: 'expense', categoryId: 'c1', amount: 100, description: '', date: '2026-07-09', time: '10:00' })
    await createTransaction({ type: 'expense', categoryId: 'c1', amount: 50, description: '', date: '2026-07-09', time: '11:00' })
    await createTransaction({ type: 'income', categoryId: 'c2', amount: 9999, description: '', date: '2026-07-09', time: '12:00' })
    await createTransaction({ type: 'expense', categoryId: 'c1', amount: 200, description: '', date: '2026-08-01', time: '10:00' })

    const map = await spendByDayForMonth('2026-07')
    expect(map.get('2026-07-09')).toBe(150)
    expect(map.has('2026-08-01')).toBe(false)
  })

  it('spendByMonthForYear sums expenses per month, expenses only', async () => {
    await createTransaction({ type: 'expense', categoryId: 'c1', amount: 300, description: '', date: '2026-03-15', time: '10:00' })
    await createTransaction({ type: 'income', categoryId: 'c2', amount: 5000, description: '', date: '2026-03-16', time: '10:00' })
    await createTransaction({ type: 'expense', categoryId: 'c1', amount: 700, description: '', date: '2026-07-01', time: '10:00' })

    const map = await spendByMonthForYear(2026)
    expect(map.get('2026-03')).toBe(300)
    expect(map.get('2026-07')).toBe(700)
    expect(map.has('2026-01')).toBe(false)
  })

  it('listTransactionsForDate returns only that date', async () => {
    await createTransaction({ type: 'expense', categoryId: 'c1', amount: 10, description: '', date: '2026-07-09', time: '10:00' })
    await createTransaction({ type: 'expense', categoryId: 'c1', amount: 20, description: '', date: '2026-07-10', time: '10:00' })
    const rows = await listTransactionsForDate('2026-07-09')
    expect(rows).toHaveLength(1)
    expect(rows[0].amount).toBe(10)
  })
})
