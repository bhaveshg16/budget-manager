import { db } from './db'
import type { Budget } from './db'
import { makeId } from '../utils/id'

export async function setBudgetLimit(categoryId: string, month: string, limitAmount: number): Promise<Budget> {
  return db.transaction('rw', db.budgets, async () => {
    const existing = await db.budgets.where('[categoryId+month]').equals([categoryId, month]).first()
    const updatedAt = Date.now()
    if (existing) {
      await db.budgets.update(existing.id, { limitAmount, updatedAt })
      return { ...existing, limitAmount, updatedAt }
    }
    const budget: Budget = { id: makeId(), categoryId, month, limitAmount, updatedAt }
    await db.budgets.add(budget)
    return budget
  })
}

export async function listBudgetsForMonth(month: string): Promise<Budget[]> {
  return db.budgets.where('month').equals(month).toArray()
}

export async function deleteBudget(id: string): Promise<void> {
  await db.budgets.delete(id)
}
