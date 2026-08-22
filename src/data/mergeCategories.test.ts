import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { mergeDuplicateCategories } from './mergeCategories'

const cat = (id: string, name: string, type: 'expense' | 'income' = 'expense') =>
  ({ id, name, color: '#000000', type, isDefault: true, updatedAt: 1 })

describe('mergeDuplicateCategories', () => {
  beforeEach(async () => {
    await Promise.all([db.categories.clear(), db.transactions.clear(), db.budgets.clear(), db.recurringRules.clear()])
  })

  it('merges same-name-same-type duplicates into a deterministic winner and re-points references', async () => {
    await db.categories.bulkAdd([cat('b-food', 'Food'), cat('a-food', 'Food'), cat('def-food-u1', 'Food')])
    await db.transactions.add({ id: 't1', type: 'expense', categoryId: 'b-food', amount: 10, description: '', date: '2026-08-01', time: '09:00', createdAt: 1, updatedAt: 1 })
    await db.recurringRules.add({ id: 'r1', categoryId: 'a-food', amount: 5, description: '', type: 'expense', frequency: 'monthly', dayOfMonth: 1, isActive: true, startDate: '2026-01-01', updatedAt: 1 })

    const result = await mergeDuplicateCategories()

    expect((await db.categories.toArray()).map((c) => c.id)).toEqual(['def-food-u1'])
    expect((await db.transactions.get('t1'))?.categoryId).toBe('def-food-u1')
    expect((await db.recurringRules.get('r1'))?.categoryId).toBe('def-food-u1')
    expect(result.deletedCategoryIds.sort()).toEqual(['a-food', 'b-food'])
  })

  it('collapses same-month budget collisions keeping the latest', async () => {
    await db.categories.bulkAdd([cat('a-food', 'Food'), cat('b-food', 'Food')])
    await db.budgets.bulkAdd([
      { id: 'bud-old', categoryId: 'a-food', month: '2026-08', limitAmount: 100, updatedAt: 1 },
      { id: 'bud-new', categoryId: 'b-food', month: '2026-08', limitAmount: 200, updatedAt: 2 },
    ])

    const result = await mergeDuplicateCategories()

    const budgets = await db.budgets.toArray()
    expect(budgets).toHaveLength(1)
    expect(budgets[0]).toMatchObject({ id: 'bud-new', categoryId: 'a-food', limitAmount: 200 })
    expect(result.deletedBudgetIds).toEqual(['bud-old'])
  })

  it('does not merge across types or touch soft-deleted categories, and is idempotent', async () => {
    await db.categories.bulkAdd([
      cat('c1', 'Other', 'expense'), cat('c2', 'Other', 'income'),
      { ...cat('c3', 'Other', 'expense'), deletedAt: 1 },
    ])

    const first = await mergeDuplicateCategories()
    const second = await mergeDuplicateCategories()

    expect((await db.categories.toArray())).toHaveLength(3)
    expect(first.deletedCategoryIds).toEqual([])
    expect(second.deletedCategoryIds).toEqual([])
  })
})
