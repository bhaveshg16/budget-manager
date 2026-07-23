import { supabase } from '../lib/supabaseClient'
import { db } from '../data/db'
import type { Category, Transaction, Budget, RecurringRule } from '../data/db'
import { getLastSyncedAt, setLastSyncedAt } from './watermark'

export { getLastSyncedAt } from './watermark'

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

async function pushRows(tableName: string, rows: Record<string, unknown>[], userId: string): Promise<void> {
  if (rows.length === 0) return
  const { error } = await supabase.from(tableName).upsert(rows.map((r) => ({ ...r, user_id: userId })))
  if (error) throw error
}

async function pullRows<Local>(
  tableName: string,
  since: number,
  toLocal: (row: Record<string, unknown>) => Local,
  putLocal: (record: Local) => Promise<unknown>
): Promise<void> {
  const { data, error } = await supabase.from(tableName).select('*').gt('updated_at', new Date(since).toISOString())
  if (error) throw error
  for (const row of (data as Record<string, unknown>[] | null) ?? []) {
    await putLocal(toLocal(row))
  }
}

// --- Table-specific row mapping (camelCase local <-> snake_case remote) ---

const categoryToRemote = (c: Category) => ({
  id: c.id, name: c.name, color: c.color, type: c.type, is_default: c.isDefault, updated_at: new Date(c.updatedAt).toISOString(),
})
const categoryToLocal = (r: Record<string, unknown>): Category => ({
  id: r.id as string, name: r.name as string, color: r.color as string, type: r.type as Category['type'],
  isDefault: r.is_default as boolean, updatedAt: new Date(r.updated_at as string).getTime(),
})

const transactionToRemote = (t: Transaction) => ({
  id: t.id, type: t.type, category_id: t.categoryId, amount: t.amount, description: t.description,
  date: t.date, time: t.time, recurring_rule_id: t.recurringRuleId ?? null, updated_at: new Date(t.updatedAt).toISOString(),
})
// Note: the remote `transactions` table has no `created_at` column (see supabase/schema.sql), so a
// freshly-pulled row has no authoritative creation time. `pullTransactions` below fills in `createdAt`
// from the existing local record when there is one, and only falls back to `updated_at` for rows that
// are genuinely new to this device — see the comment there for why.
const transactionToLocal = (r: Record<string, unknown>, existingCreatedAt?: number): Transaction => ({
  id: r.id as string, type: r.type as Transaction['type'], categoryId: r.category_id as string,
  amount: Number(r.amount), description: r.description as string, date: r.date as string, time: r.time as string,
  recurringRuleId: (r.recurring_rule_id as string) ?? undefined,
  createdAt: existingCreatedAt ?? new Date(r.updated_at as string).getTime(),
  updatedAt: new Date(r.updated_at as string).getTime(),
})

const budgetToRemote = (b: Budget) => ({
  id: b.id, category_id: b.categoryId, month: b.month, limit_amount: b.limitAmount, updated_at: new Date(b.updatedAt).toISOString(),
})
const budgetToLocal = (r: Record<string, unknown>): Budget => ({
  id: r.id as string, categoryId: r.category_id as string, month: r.month as string,
  limitAmount: Number(r.limit_amount), updatedAt: new Date(r.updated_at as string).getTime(),
})

const ruleToRemote = (rule: RecurringRule) => ({
  id: rule.id, category_id: rule.categoryId, amount: rule.amount, description: rule.description, type: rule.type,
  frequency: rule.frequency, day_of_month: rule.dayOfMonth ?? null, day_of_week: rule.dayOfWeek ?? null,
  is_active: rule.isActive, start_date: rule.startDate, last_posted_date: rule.lastPostedDate ?? null,
  updated_at: new Date(rule.updatedAt).toISOString(),
})
const ruleToLocal = (r: Record<string, unknown>): RecurringRule => ({
  id: r.id as string, categoryId: r.category_id as string, amount: Number(r.amount), description: r.description as string,
  type: r.type as RecurringRule['type'], frequency: r.frequency as RecurringRule['frequency'],
  dayOfMonth: (r.day_of_month as number) ?? undefined, dayOfWeek: (r.day_of_week as number) ?? undefined,
  isActive: r.is_active as boolean, startDate: r.start_date as string,
  lastPostedDate: (r.last_posted_date as string) ?? undefined, updatedAt: new Date(r.updated_at as string).getTime(),
})

// Transactions need special-cased pulling (rather than the generic `pullRows`) so that `createdAt` —
// a local-only field with no remote column — survives a pull instead of being clobbered with
// `updated_at` every time. See the comment on `transactionToLocal` above for the full rationale.
async function pullTransactions(since: number): Promise<void> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .gt('updated_at', new Date(since).toISOString())
  if (error) throw error
  for (const row of (data as Record<string, unknown>[] | null) ?? []) {
    const existing = await db.transactions.get(row.id as string)
    await db.transactions.put(transactionToLocal(row, existing?.createdAt))
  }
}

export async function syncAll(): Promise<void> {
  const userId = await currentUserId()
  if (!userId) return

  const since = getLastSyncedAt()
  const startedAt = Date.now()

  const [categories, transactions, budgets, recurringRules] = await Promise.all([
    db.categories.toArray(), db.transactions.toArray(), db.budgets.toArray(), db.recurringRules.toArray(),
  ])

  // recurring_rules must land before transactions: transactions.recurring_rule_id has an FK to
  // recurring_rules(id), and a device that's been offline can accumulate catch-up transactions
  // referencing a rule that hasn't been pushed yet.
  await pushRows('categories', categories.map(categoryToRemote), userId)
  await pushRows('recurring_rules', recurringRules.map(ruleToRemote), userId)
  await pushRows('transactions', transactions.map(transactionToRemote), userId)
  await pushRows('budgets', budgets.map(budgetToRemote), userId)

  await pullRows('categories', since, categoryToLocal, (r) => db.categories.put(r))
  await pullTransactions(since)
  await pullRows('budgets', since, budgetToLocal, (r) => db.budgets.put(r))
  await pullRows('recurring_rules', since, ruleToLocal, (r) => db.recurringRules.put(r))

  setLastSyncedAt(startedAt)
}
