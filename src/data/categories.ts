import { db } from './db'
import type { Category, TransactionType } from './db'
import { makeId } from '../utils/id'

const DEFAULT_CATEGORIES: Array<Omit<Category, 'id' | 'updatedAt'>> = [
  { name: 'Food', color: '#f59e0b', type: 'expense', isDefault: true },
  { name: 'Rent', color: '#ef4444', type: 'expense', isDefault: true },
  { name: 'Transport', color: '#3b82f6', type: 'expense', isDefault: true },
  { name: 'Shopping', color: '#a855f7', type: 'expense', isDefault: true },
  { name: 'Bills & Utilities', color: '#14b8a6', type: 'expense', isDefault: true },
  { name: 'Entertainment', color: '#ec4899', type: 'expense', isDefault: true },
  { name: 'Health', color: '#22c55e', type: 'expense', isDefault: true },
  { name: 'Groceries', color: '#65a30d', type: 'expense', isDefault: true },
  { name: 'Salary', color: '#059669', type: 'income', isDefault: true },
  { name: 'Other Income', color: '#0ea5e9', type: 'income', isDefault: true },
]

export async function seedDefaultCategoriesIfEmpty(): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    const count = await db.categories.count()
    if (count > 0) return
    const now = Date.now()
    await db.categories.bulkAdd(DEFAULT_CATEGORIES.map((c) => ({ ...c, id: makeId(), updatedAt: now })))
  })
}

export async function listCategories(): Promise<Category[]> {
  return db.categories.toArray()
}

export async function createCategory(input: { name: string; color: string; type: TransactionType }): Promise<Category> {
  const category: Category = { ...input, id: makeId(), isDefault: false, updatedAt: Date.now() }
  await db.categories.add(category)
  return category
}

export async function updateCategory(id: string, changes: Partial<Pick<Category, 'name' | 'color'>>): Promise<void> {
  await db.categories.update(id, { ...changes, updatedAt: Date.now() })
}

export const UNCATEGORIZED = { id: 'uncategorized', name: 'Uncategorized', color: '#94a3b8' } as const

export function resolveCategoryDisplay(
  categories: Category[], id: string
): { id: string; name: string; color: string } {
  const category = categories.find((c) => c.id === id)
  if (!category || category.deletedAt) return UNCATEGORIZED
  return { id: category.id, name: category.name, color: category.color }
}

export async function listActiveCategories(): Promise<Category[]> {
  return (await db.categories.toArray()).filter((c) => !c.deletedAt)
}

export async function deleteCategory(id: string): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', db.categories, db.recurringRules, async () => {
    await db.categories.update(id, { deletedAt: now, updatedAt: now })
    await db.recurringRules.where('categoryId').equals(id).modify({ isActive: false, updatedAt: now })
  })
}
