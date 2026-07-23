import { describe, it, expect, beforeEach } from 'vitest'
import { resetLocalDataForUser, ACTIVE_USER_KEY } from './localReset'
import { db } from './db'
import { createTransaction } from './transactions'
import { setLastSyncedAt, getLastSyncedAt } from '../sync/watermark'

describe('resetLocalDataForUser', () => {
  beforeEach(async () => {
    await Promise.all([db.transactions.clear(), db.categories.clear(), db.budgets.clear(), db.recurringRules.clear()])
    localStorage.clear()
  })

  it('preserves local data when the same user resolves again', async () => {
    localStorage.setItem(ACTIVE_USER_KEY, 'user-A')
    await createTransaction({ type: 'expense', categoryId: 'c1', amount: 10, description: '', date: '2026-07-09', time: '10:00' })
    const didReset = await resetLocalDataForUser('user-A')
    expect(didReset).toBe(false)
    expect(await db.transactions.count()).toBe(1)
  })

  it('wipes local data and resets the watermark when a different user signs in', async () => {
    localStorage.setItem(ACTIVE_USER_KEY, 'user-A')
    setLastSyncedAt(12345)
    await createTransaction({ type: 'expense', categoryId: 'c1', amount: 10, description: '', date: '2026-07-09', time: '10:00' })

    const didReset = await resetLocalDataForUser('user-B')
    expect(didReset).toBe(true)
    expect(await db.transactions.count()).toBe(0)
    expect(getLastSyncedAt()).toBe(0)
    expect(localStorage.getItem(ACTIVE_USER_KEY)).toBe('user-B')
  })

  it('records the user on first login (no stored id) and reports a reset', async () => {
    const didReset = await resetLocalDataForUser('user-A')
    expect(didReset).toBe(true)
    expect(localStorage.getItem(ACTIVE_USER_KEY)).toBe('user-A')
  })
})
