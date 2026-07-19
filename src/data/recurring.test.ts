import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { createRecurringRule, catchUpRecurringTransactions } from './recurring'

describe('recurring engine', () => {
  beforeEach(async () => {
    await db.recurringRules.clear()
    await db.transactions.clear()
  })

  it('posts one transaction per due monthly occurrence and advances lastPostedDate', async () => {
    const rule = await createRecurringRule({
      categoryId: 'c1', amount: 15000, description: 'Rent', type: 'expense',
      frequency: 'monthly', dayOfMonth: 1, startDate: '2026-01-01',
    })

    await catchUpRecurringTransactions('2026-04-01')

    const posted = await db.transactions.where('recurringRuleId').equals(rule.id).toArray()
    expect(posted).toHaveLength(3) // Feb 1, Mar 1, Apr 1
    expect(posted.map((t) => t.date).sort()).toEqual(['2026-02-01', '2026-03-01', '2026-04-01'])

    const updatedRule = await db.recurringRules.get(rule.id)
    expect(updatedRule?.lastPostedDate).toBe('2026-04-01')
  })

  it('does not re-post occurrences already covered by lastPostedDate', async () => {
    const rule = await createRecurringRule({
      categoryId: 'c1', amount: 15000, description: 'Rent', type: 'expense',
      frequency: 'monthly', dayOfMonth: 1, startDate: '2026-01-01',
    })
    await catchUpRecurringTransactions('2026-04-01')
    await catchUpRecurringTransactions('2026-04-01') // run again with no new time passing

    const posted = await db.transactions.where('recurringRuleId').equals(rule.id).toArray()
    expect(posted).toHaveLength(3)
  })

  it('skips inactive rules', async () => {
    const rule = await createRecurringRule({
      categoryId: 'c1', amount: 500, description: 'Gym', type: 'expense',
      frequency: 'monthly', dayOfMonth: 1, startDate: '2026-01-01',
    })
    await db.recurringRules.update(rule.id, { isActive: false })
    await catchUpRecurringTransactions('2026-04-01')
    expect(await db.transactions.where('recurringRuleId').equals(rule.id).toArray()).toHaveLength(0)
  })

  it('does not double-post when catchUp runs concurrently for the same rule (e.g. StrictMode double-invoke)', async () => {
    const rule = await createRecurringRule({
      categoryId: 'c1', amount: 15000, description: 'Rent', type: 'expense',
      frequency: 'monthly', dayOfMonth: 1, startDate: '2026-01-01',
    })

    await Promise.all([
      catchUpRecurringTransactions('2026-04-01'),
      catchUpRecurringTransactions('2026-04-01'),
    ])

    const posted = await db.transactions.where('recurringRuleId').equals(rule.id).toArray()
    expect(posted).toHaveLength(3) // Feb 1, Mar 1, Apr 1 — not 6
    expect(posted.map((t) => t.date).sort()).toEqual(['2026-02-01', '2026-03-01', '2026-04-01'])

    const updatedRule = await db.recurringRules.get(rule.id)
    expect(updatedRule?.lastPostedDate).toBe('2026-04-01')
  })
})
