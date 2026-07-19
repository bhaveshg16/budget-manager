import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'

describe('BudgetDatabase', () => {
  beforeEach(async () => {
    await db.categories.clear()
    await db.transactions.clear()
    await db.budgets.clear()
    await db.recurringRules.clear()
  })

  it('opens with the expected tables', () => {
    expect(db.categories).toBeDefined()
    expect(db.transactions).toBeDefined()
    expect(db.budgets).toBeDefined()
    expect(db.recurringRules).toBeDefined()
  })

  it('can add and retrieve a category', async () => {
    await db.categories.add({
      id: 'c1', name: 'Food', color: '#f59e0b', type: 'expense', isDefault: true, updatedAt: 1,
    })
    const found = await db.categories.get('c1')
    expect(found?.name).toBe('Food')
  })
})
