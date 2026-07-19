import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { setBudgetLimit, listBudgetsForMonth, deleteBudget } from './budgets'

describe('budget repository', () => {
  beforeEach(async () => {
    await db.budgets.clear()
  })

  it('creates a budget limit', async () => {
    const b = await setBudgetLimit('c1', '2026-07', 8000)
    expect(b.limitAmount).toBe(8000)
  })

  it('updates the existing limit instead of duplicating it', async () => {
    await setBudgetLimit('c1', '2026-07', 8000)
    await setBudgetLimit('c1', '2026-07', 9000)
    const all = await listBudgetsForMonth('2026-07')
    expect(all).toHaveLength(1)
    expect(all[0].limitAmount).toBe(9000)
  })

  it('lists budgets scoped to a month', async () => {
    await setBudgetLimit('c1', '2026-07', 8000)
    await setBudgetLimit('c2', '2026-08', 3000)
    expect(await listBudgetsForMonth('2026-07')).toHaveLength(1)
  })

  it('deletes a budget', async () => {
    const b = await setBudgetLimit('c1', '2026-07', 8000)
    await deleteBudget(b.id)
    expect(await listBudgetsForMonth('2026-07')).toHaveLength(0)
  })

  it('does not create duplicate rows when called concurrently for the same categoryId+month', async () => {
    await Promise.all([setBudgetLimit('c1', '2026-07', 8000), setBudgetLimit('c1', '2026-07', 9000)])
    await Promise.all([setBudgetLimit('c1', '2026-07', 5000), setBudgetLimit('c1', '2026-07', 6000)])
    expect(await listBudgetsForMonth('2026-07')).toHaveLength(1)
  })
})
