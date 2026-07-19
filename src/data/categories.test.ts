import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { seedDefaultCategoriesIfEmpty, listCategories, createCategory, updateCategory, deleteCategory } from './categories'

describe('category repository', () => {
  beforeEach(async () => {
    await db.categories.clear()
  })

  it('seeds default categories only when empty', async () => {
    await seedDefaultCategoriesIfEmpty()
    const first = await listCategories()
    expect(first.length).toBeGreaterThan(0)

    await seedDefaultCategoriesIfEmpty()
    const second = await listCategories()
    expect(second.length).toBe(first.length)
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
    expect(await db.categories.get(category.id)).toBeUndefined()
  })
})
