import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { createTransaction, updateTransaction, deleteTransaction, listTransactionsForMonth } from './transactions'

describe('transaction repository', () => {
  beforeEach(async () => {
    await db.transactions.clear()
  })

  const base = { type: 'expense' as const, categoryId: 'c1', amount: 250, description: 'Lunch', date: '2026-07-19', time: '13:00' }

  it('creates a transaction', async () => {
    const t = await createTransaction(base)
    expect(t.id).toBeTruthy()
    expect(await db.transactions.get(t.id)).toMatchObject({ amount: 250 })
  })

  it('updates a transaction and bumps updatedAt', async () => {
    const t = await createTransaction(base)
    const before = t.updatedAt
    await new Promise((r) => setTimeout(r, 5))
    await updateTransaction(t.id, { amount: 300 })
    const updated = await db.transactions.get(t.id)
    expect(updated?.amount).toBe(300)
    expect(updated!.updatedAt).toBeGreaterThan(before)
  })

  it('deletes a transaction', async () => {
    const t = await createTransaction(base)
    await deleteTransaction(t.id)
    expect(await db.transactions.get(t.id)).toBeUndefined()
  })

  it('lists transactions for a given month only', async () => {
    await createTransaction({ ...base, date: '2026-07-01' })
    await createTransaction({ ...base, date: '2026-07-19' })
    await createTransaction({ ...base, date: '2026-08-01' })
    const julyOnly = await listTransactionsForMonth('2026-07')
    expect(julyOnly).toHaveLength(2)
  })
})
