import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { seedDefaultCategoriesIfEmpty, listCategories, listActiveCategories, createCategory, updateCategory, deleteCategory, resolveCategoryDisplay, UNCATEGORIZED } from './categories'

describe('category repository', () => {
  beforeEach(async () => {
    await db.categories.clear()
    await db.recurringRules.clear()
  })

  it('seeds default categories only when empty', async () => {
    await seedDefaultCategoriesIfEmpty('user-1')
    const first = await listCategories()
    expect(first.length).toBeGreaterThan(0)

    await seedDefaultCategoriesIfEmpty('user-1')
    const second = await listCategories()
    expect(second.length).toBe(first.length)
  })

  it('seeds deterministic per-user ids so two fresh devices converge', async () => {
    await seedDefaultCategoriesIfEmpty('user-1')
    const first = await listCategories()
    expect(first.find((c) => c.name === 'Food')?.id).toBe('def-food-user-1')
    expect(first.find((c) => c.name === 'Bills & Utilities')?.id).toBe('def-bills-utilities-user-1')
  })

  it('creates a custom category', async () => {
    const category = await createCategory({ name: 'Pets', color: '#fb923c', type: 'expense' })
    const found = await db.categories.get(category.id)
    expect(found?.name).toBe('Pets')
    expect(found?.isDefault).toBe(false)
  })

  it('updates and deletes a category', async () => {
    const category = await createCategory({ name: 'Pets', color: '#fb923c', type: 'expense' })
    await updateCategory(category.id, { name: 'Pet Care' })
    expect((await db.categories.get(category.id))?.name).toBe('Pet Care')

    await deleteCategory(category.id)
    const deleted = await db.categories.get(category.id)
    expect(deleted).toBeDefined()
    expect(deleted?.deletedAt).toBeGreaterThan(0)
  })

  it('soft-deletes a category and deactivates its recurring rules', async () => {
    const category = await createCategory({ name: 'Pets', color: '#fb923c', type: 'expense' })
    await db.recurringRules.add({
      id: 'r1', categoryId: category.id, amount: 10, description: '', type: 'expense',
      frequency: 'monthly', dayOfMonth: 1, isActive: true, startDate: '2026-01-01', updatedAt: 1,
    })

    await deleteCategory(category.id)

    const deleted = await db.categories.get(category.id)
    expect(deleted?.deletedAt).toBeGreaterThan(0)
    expect((await db.recurringRules.get('r1'))?.isActive).toBe(false)
  })

  it('lists only active categories', async () => {
    const keep = await createCategory({ name: 'Keep', color: '#111111', type: 'expense' })
    const drop = await createCategory({ name: 'Drop', color: '#222222', type: 'expense' })
    await deleteCategory(drop.id)

    const active = await listActiveCategories()
    expect(active.map((c) => c.id)).toEqual([keep.id])
  })

  it('resolves deleted or missing categories to Uncategorized', async () => {
    const active = await createCategory({ name: 'Pets', color: '#fb923c', type: 'expense' })
    const gone = await createCategory({ name: 'Old', color: '#000000', type: 'expense' })
    await deleteCategory(gone.id)
    const all = await db.categories.toArray()

    expect(resolveCategoryDisplay(all, active.id).name).toBe('Pets')
    expect(resolveCategoryDisplay(all, gone.id)).toEqual(UNCATEGORIZED)
    expect(resolveCategoryDisplay(all, 'missing-id')).toEqual(UNCATEGORIZED)
  })
})
