import { db } from './db'
import type { RecurringRule, TransactionType, RecurringFrequency } from './db'
import { makeId } from '../utils/id'
import { createTransaction } from './transactions'
import { occurrenceDatesInRange } from './recurringSchedule'

export interface NewRecurringRuleInput {
  categoryId: string
  amount: number
  description: string
  type: TransactionType
  frequency: RecurringFrequency
  dayOfMonth?: number
  dayOfWeek?: number
  startDate: string
}

export async function createRecurringRule(input: NewRecurringRuleInput): Promise<RecurringRule> {
  const rule: RecurringRule = { ...input, id: makeId(), isActive: true, updatedAt: Date.now() }
  await db.recurringRules.add(rule)
  return rule
}

export async function listActiveRecurringRules(): Promise<RecurringRule[]> {
  return db.recurringRules.filter((r) => r.isActive).toArray()
}

export async function deactivateRecurringRule(id: string): Promise<void> {
  await db.recurringRules.update(id, { isActive: false, updatedAt: Date.now() })
}

/** Call once on app startup. Posts any transactions due since each active rule's last check, up to `today`. */
export async function catchUpRecurringTransactions(today: string): Promise<void> {
  const rules = await listActiveRecurringRules()
  for (const rule of rules) {
    // Each rule's read-check-post-write cycle runs in one transaction spanning both tables,
    // re-reading the rule's current state from inside the transaction. Without this, two
    // concurrent invocations (React StrictMode double-invoke, two open tabs) could both read
    // the same stale lastPostedDate before either writes back, and both would post the same
    // set of transactions twice — duplicating real financial entries.
    await db.transaction('rw', [db.recurringRules, db.transactions], async () => {
      const current = await db.recurringRules.get(rule.id)
      if (!current || !current.isActive) return

      const from = current.lastPostedDate ?? current.startDate
      const dueDates = occurrenceDatesInRange(current, from, today)
      for (const date of dueDates) {
        await createTransaction({
          type: current.type,
          categoryId: current.categoryId,
          amount: current.amount,
          description: current.description,
          date,
          time: '09:00',
          recurringRuleId: current.id,
        })
      }
      if (dueDates.length > 0) {
        await db.recurringRules.update(current.id, { lastPostedDate: dueDates[dueDates.length - 1], updatedAt: Date.now() })
      }
    })
  }
}
