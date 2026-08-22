import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '../data/db'
import { syncAll, getLastSyncedAt, deleteRemoteRows } from './syncEngine'

const upsertMock = vi.fn().mockResolvedValue({ error: null })
const deleteInMock = vi.fn().mockResolvedValue({ error: null })

// Per-table pull results, so tests can control what a `.select('*').gt(...)` pull returns for a
// given table without affecting the others. Defaults to an empty pull (no rows changed remotely).
const pullData: Record<string, unknown[]> = {}

function selectChainFor(table: string) {
  const chain = {
    select: () => chain,
    gt: () => Promise.resolve({ data: pullData[table] ?? [], error: null }),
  }
  return chain
}

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: vi.fn((table: string) => ({ upsert: upsertMock, delete: () => ({ in: deleteInMock }), ...selectChainFor(table) })),
  },
}))

describe('syncAll', () => {
  beforeEach(async () => {
    await db.categories.clear()
    await db.transactions.clear()
    localStorage.clear()
    upsertMock.mockClear()
    deleteInMock.mockClear()
    for (const key of Object.keys(pullData)) delete pullData[key]
  })

  it('pushes local rows tagged with the current user id', async () => {
    await db.transactions.add({
      id: 't1', type: 'expense', categoryId: 'c1', amount: 100, description: 'Tea',
      date: '2026-07-19', time: '09:00', createdAt: 1, updatedAt: 1,
    })

    await syncAll()

    expect(upsertMock).toHaveBeenCalled()
    const pushedRows = upsertMock.mock.calls.flatMap((call) => call[0])
    expect(pushedRows.some((r: { id: string; user_id: string }) => r.id === 't1' && r.user_id === 'user-1')).toBe(true)
  })

  it('records a lastSyncedAt timestamp after syncing', async () => {
    expect(getLastSyncedAt()).toBe(0)
    await syncAll()
    expect(getLastSyncedAt()).toBeGreaterThan(0)
  })

  it('preserves the existing local createdAt when pulling an update to a known transaction', async () => {
    await db.transactions.add({
      id: 't1', type: 'expense', categoryId: 'c1', amount: 100, description: 'Tea',
      date: '2026-07-19', time: '09:00', createdAt: 1000, updatedAt: 1000,
    })
    pullData.transactions = [{
      id: 't1', type: 'expense', category_id: 'c1', amount: 250, description: 'Tea (edited elsewhere)',
      date: '2026-07-19', time: '09:00', recurring_rule_id: null, updated_at: '2026-07-19T12:00:00.000Z',
    }]

    await syncAll()

    const local = await db.transactions.get('t1')
    expect(local?.createdAt).toBe(1000)
    expect(local?.amount).toBe(250)
    expect(local?.updatedAt).toBe(new Date('2026-07-19T12:00:00.000Z').getTime())
  })

  it('falls back to updated_at for createdAt when the pulled row is new to this device', async () => {
    pullData.transactions = [{
      id: 't2', type: 'income', category_id: 'c2', amount: 500, description: 'Freelance',
      date: '2026-07-19', time: '10:00', recurring_rule_id: null, updated_at: '2026-07-19T08:30:00.000Z',
    }]

    await syncAll()

    const local = await db.transactions.get('t2')
    const expected = new Date('2026-07-19T08:30:00.000Z').getTime()
    expect(local?.createdAt).toBe(expected)
    expect(local?.updatedAt).toBe(expected)
  })

  it('round-trips category deleted_at through push and pull', async () => {
    await db.categories.add({
      id: 'c-del', name: 'Old', color: '#000000', type: 'expense',
      isDefault: false, updatedAt: 5, deletedAt: 5,
    })
    pullData['categories'] = [{
      id: 'c-remote', name: 'Remote', color: '#ffffff', type: 'expense',
      is_default: false, updated_at: '2026-08-01T00:00:00Z', deleted_at: '2026-08-01T00:00:00Z',
    }]

    await syncAll()

    const pushedCategories = upsertMock.mock.calls
      .flatMap(([rows]) => rows as Record<string, unknown>[])
      .filter((r) => r.id === 'c-del')
    expect(pushedCategories[0].deleted_at).toBe(new Date(5).toISOString())

    const pulled = await db.categories.get('c-remote')
    expect(pulled?.deletedAt).toBe(new Date('2026-08-01T00:00:00Z').getTime())
  })
})

describe('deleteRemoteRows', () => {
  beforeEach(() => {
    deleteInMock.mockClear()
  })

  it('deletes remote rows by id', async () => {
    await deleteRemoteRows('categories', ['a', 'b'])
    expect(deleteInMock).toHaveBeenCalledWith('id', ['a', 'b'])
  })

  it('skips the network entirely for an empty id list', async () => {
    await deleteRemoteRows('categories', [])
    expect(deleteInMock).not.toHaveBeenCalled()
  })
})
