import { db } from './db'
import type { Budget, Category } from './db'

export interface MergeResult {
  deletedCategoryIds: string[]
  deletedBudgetIds: string[]
}

// One-shot (but idempotent, run-every-boot) repair for the historical seed-before-first-pull bug:
// each fresh device seeded its own randomly-ID'd defaults, so synced accounts hold N copies of
// every default. Winner choice must be deterministic across devices so concurrent runs converge:
// a deterministic seed id (def-*) if present, else the lexicographically smallest id.
export async function mergeDuplicateCategories(): Promise<MergeResult> {
  return db.transaction('rw', db.categories, db.transactions, db.budgets, db.recurringRules, async () => {
    const categories = (await db.categories.toArray()).filter((c) => !c.deletedAt)
    const groups = new Map<string, Category[]>()
    for (const c of categories) {
      const key = `${c.type}:${c.name.trim().toLowerCase()}`
      groups.set(key, [...(groups.get(key) ?? []), c])
    }

    const deletedCategoryIds: string[] = []
    const deletedBudgetIds: string[] = []
    const now = Date.now()

    for (const group of groups.values()) {
      if (group.length < 2) continue
      const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id))
      const winner = sorted.find((c) => c.id.startsWith('def-')) ?? sorted[0]

      for (const loser of sorted) {
        if (loser.id === winner.id) continue
        await db.transactions.where('categoryId').equals(loser.id).modify({ categoryId: winner.id, updatedAt: now })
        await db.recurringRules.where('categoryId').equals(loser.id).modify({ categoryId: winner.id, updatedAt: now })
        await db.budgets.where('categoryId').equals(loser.id).modify({ categoryId: winner.id, updatedAt: now })
        await db.categories.delete(loser.id)
        deletedCategoryIds.push(loser.id)
      }

      // Re-pointing can leave two budgets on the same (category, month); remote has a unique
      // constraint on it, so collapse to the most recently updated before the next push.
      const budgets = await db.budgets.where('categoryId').equals(winner.id).toArray()
      const byMonth = new Map<string, Budget[]>()
      for (const b of budgets) byMonth.set(b.month, [...(byMonth.get(b.month) ?? []), b])
      for (const rows of byMonth.values()) {
        if (rows.length < 2) continue
        const keep = rows.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a))
        for (const b of rows) {
          if (b.id === keep.id) continue
          await db.budgets.delete(b.id)
          deletedBudgetIds.push(b.id)
        }
      }
    }

    return { deletedCategoryIds, deletedBudgetIds }
  })
}
