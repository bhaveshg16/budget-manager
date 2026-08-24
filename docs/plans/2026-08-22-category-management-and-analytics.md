# Category Management & Customizable Analytics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Fix duplicated categories (dedupe + seed-ordering fix), make categories user-manageable with sync-safe soft deletes and an Uncategorized bucket, and replace the fixed month-vs-month analytics section with a category/month comparison builder.

**Architecture:** Categories gain a `deletedAt` soft-delete field that syncs through the existing push/pull engine (no tombstone infra; remote FKs `on delete restrict` never fight a soft delete). Boot order changes to pull → merge-duplicates → seed-if-empty → push → remote-delete-losers, with deterministic per-user seed IDs (`def-<slug>-<userId>`) so fresh devices converge instead of duplicating. Rendering resolves deleted/missing categories to one Uncategorized bucket.

**Tech Stack:** React 19 + TypeScript, Dexie (IndexedDB) with `fake-indexeddb` in tests, Supabase (postgres + RLS), Recharts, Vitest + Testing Library, Tailwind 4.

**Design doc:** `docs/plans/2026-08-22-category-management-and-analytics-design.md`

**Conventions:** Run tests with `npx vitest run <file>`. Commit after every task. All work on branch `feature/category-management-and-analytics`. Never commit on `main`.

---

### Task 1: Soft-delete field on Category + sync mapping + remote schema

**Files:**
- Modify: `src/data/db.ts` (Category interface)
- Modify: `src/sync/syncEngine.ts:41-47` (category mappers)
- Modify: `supabase/schema.sql:1-9`
- Test: `src/sync/syncEngine.test.ts`

**Step 1: Write the failing test** — add to `src/sync/syncEngine.test.ts` (reuse the existing `upsertMock`/`pullData` fixtures; also clear `db.categories` in `beforeEach`):

```ts
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/sync/syncEngine.test.ts`
Expected: FAIL — pushed row has no `deleted_at`; pulled record's `deletedAt` is `undefined`.

**Step 3: Implement**

In `src/data/db.ts`, add to `Category`:

```ts
export interface Category {
  id: string
  name: string
  color: string
  type: TransactionType
  isDefault: boolean
  deletedAt?: number
  updatedAt: number
}
```

In `src/sync/syncEngine.ts` replace the category mappers:

```ts
const categoryToRemote = (c: Category) => ({
  id: c.id, name: c.name, color: c.color, type: c.type, is_default: c.isDefault,
  deleted_at: c.deletedAt ? new Date(c.deletedAt).toISOString() : null,
  updated_at: new Date(c.updatedAt).toISOString(),
})
const categoryToLocal = (r: Record<string, unknown>): Category => ({
  id: r.id as string, name: r.name as string, color: r.color as string, type: r.type as Category['type'],
  isDefault: r.is_default as boolean,
  deletedAt: r.deleted_at ? new Date(r.deleted_at as string).getTime() : undefined,
  updatedAt: new Date(r.updated_at as string).getTime(),
})
```

In `supabase/schema.sql`, add `deleted_at timestamptz,` after `is_default` in the categories `create table`, and add below the table:

```sql
-- Migration for existing databases (run once in the Supabase SQL editor):
-- alter table categories add column if not exists deleted_at timestamptz;
```

No Dexie schema version bump needed — `deletedAt` is unindexed.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/sync/syncEngine.test.ts` — Expected: PASS

**Step 5: Commit**

```bash
git add src/data/db.ts src/sync/syncEngine.ts src/sync/syncEngine.test.ts supabase/schema.sql
git commit -m "feat: add syncable soft-delete field to categories"
```

---

### Task 2: Soft delete in the category repository (+ deactivate recurring rules)

**Files:**
- Modify: `src/data/categories.ts`
- Test: `src/data/categories.test.ts`

**Step 1: Write the failing tests** — in `src/data/categories.test.ts`, clear `db.recurringRules` too in `beforeEach`, and replace the delete assertion in the update/delete test plus add coverage:

```ts
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
```

Update the existing `'updates and deletes a category'` test: after `deleteCategory`, expect the record to still exist with `deletedAt` set (not `toBeUndefined()`).

**Step 2: Run to verify failure**

Run: `npx vitest run src/data/categories.test.ts`
Expected: FAIL — `listActiveCategories` not exported; deleted record is gone instead of soft-deleted.

**Step 3: Implement** — in `src/data/categories.ts` replace `deleteCategory` and add `listActiveCategories`:

```ts
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
```

**Step 4: Verify pass** — `npx vitest run src/data/categories.test.ts` — Expected: PASS

**Step 5: Commit**

```bash
git add src/data/categories.ts src/data/categories.test.ts
git commit -m "feat: soft-delete categories and deactivate their recurring rules"
```

---

### Task 3: Uncategorized resolution + screens exclude deleted categories

**Files:**
- Modify: `src/data/categories.ts` (add `UNCATEGORIZED` + `resolveCategoryDisplay`)
- Modify: `src/screens/HomeScreen.tsx:18`, `src/components/DaySheet.tsx:23`, `src/screens/AddEditEntryScreen.tsx:24`
- Test: `src/data/categories.test.ts`

**Step 1: Write the failing test** (categories.test.ts):

```ts
it('resolves deleted or missing categories to Uncategorized', async () => {
  const active = await createCategory({ name: 'Pets', color: '#fb923c', type: 'expense' })
  const gone = await createCategory({ name: 'Old', color: '#000000', type: 'expense' })
  await deleteCategory(gone.id)
  const all = await db.categories.toArray()

  expect(resolveCategoryDisplay(all, active.id).name).toBe('Pets')
  expect(resolveCategoryDisplay(all, gone.id)).toEqual(UNCATEGORIZED)
  expect(resolveCategoryDisplay(all, 'missing-id')).toEqual(UNCATEGORIZED)
})
```

**Step 2: Run to verify failure** — `npx vitest run src/data/categories.test.ts` — FAIL (not exported).

**Step 3: Implement** — in `src/data/categories.ts`:

```ts
export const UNCATEGORIZED = { id: 'uncategorized', name: 'Uncategorized', color: '#94a3b8' } as const

export function resolveCategoryDisplay(
  categories: Category[], id: string
): { id: string; name: string; color: string } {
  const category = categories.find((c) => c.id === id)
  if (!category || category.deletedAt) return UNCATEGORIZED
  return { id: category.id, name: category.name, color: category.color }
}
```

Then wire the screens:
- `HomeScreen.tsx:18` → `const categoryName = (id: string) => resolveCategoryDisplay(categories, id).name`
- `DaySheet.tsx:23` → same substitution for `name`
- `AddEditEntryScreen.tsx:24` → `const filteredCategories = categories?.filter((c) => c.type === type && !c.deletedAt) ?? []`

**Step 4: Verify** — `npx vitest run src/data/categories.test.ts src/screens/HomeScreen.test.tsx src/components/DaySheet.test.tsx src/screens/AddEditEntryScreen.test.tsx` — PASS (existing screen tests must stay green).

**Step 5: Commit**

```bash
git add src/data/categories.ts src/data/categories.test.ts src/screens/HomeScreen.tsx src/components/DaySheet.tsx src/screens/AddEditEntryScreen.tsx
git commit -m "feat: resolve deleted categories to an Uncategorized bucket in the UI"
```

---

### Task 4: Analytics buckets deleted categories into Uncategorized

**Files:**
- Modify: `src/data/analytics.ts` (`getCategoryBreakdown`, `getMonthComparison`, `getBudgetVsActual`)
- Test: `src/data/analytics.test.ts`

**Step 1: Write the failing tests** (analytics.test.ts, following its existing fixture style):

```ts
it('lumps deleted and missing categories into one Uncategorized bucket', async () => {
  await db.categories.add({ id: 'c-gone', name: 'Old', color: '#000', type: 'expense', isDefault: false, deletedAt: 1, updatedAt: 1 })
  await db.transactions.bulkAdd([
    { id: 't1', type: 'expense', categoryId: 'c-gone', amount: 10, description: '', date: '2026-08-05', time: '09:00', createdAt: 1, updatedAt: 1 },
    { id: 't2', type: 'expense', categoryId: 'missing', amount: 5, description: '', date: '2026-08-06', time: '09:00', createdAt: 1, updatedAt: 1 },
  ])

  const breakdown = await getCategoryBreakdown('2026-08', 'expense')
  expect(breakdown).toEqual([{ categoryId: 'uncategorized', categoryName: 'Uncategorized', color: '#94a3b8', total: 15 }])
})

it('excludes budgets for deleted categories from budget vs actual', async () => {
  await db.categories.add({ id: 'c-gone', name: 'Old', color: '#000', type: 'expense', isDefault: false, deletedAt: 1, updatedAt: 1 })
  await db.budgets.add({ id: 'b1', categoryId: 'c-gone', month: '2026-08', limitAmount: 100, updatedAt: 1 })

  expect(await getBudgetVsActual('2026-08')).toEqual([])
})
```

**Step 2: Verify failure** — `npx vitest run src/data/analytics.test.ts` — FAIL.

**Step 3: Implement** — in `src/data/analytics.ts`:

Rewrite `getCategoryBreakdown` to accumulate by resolved display (import `resolveCategoryDisplay` from `./categories`):

```ts
export async function getCategoryBreakdown(month: string, type: 'expense' | 'income'): Promise<CategoryTotal[]> {
  const [transactions, categories] = await Promise.all([listTransactionsForMonth(month), db.categories.toArray()])
  const totals = new Map<string, CategoryTotal>()
  for (const t of transactions) {
    if (t.type !== type) continue
    const display = resolveCategoryDisplay(categories, t.categoryId)
    const row = totals.get(display.id) ?? { categoryId: display.id, categoryName: display.name, color: display.color, total: 0 }
    row.total += t.amount
    totals.set(display.id, row)
  }
  return [...totals.values()]
}
```

In `getMonthComparison`, replace the `categories.find(...)` name lookup with the breakdown rows' own names (they're already resolved): `categoryName: (breakdownA.find((r) => r.categoryId === categoryId) ?? breakdownB.find((r) => r.categoryId === categoryId))!.categoryName` and drop the now-unused `db.categories.toArray()` from its `Promise.all`.

In `getBudgetVsActual`, filter first: `return budgets.filter((b) => { const c = categories.find((x) => x.id === b.categoryId); return c && !c.deletedAt }).map(...)`.

**Step 4: Verify** — `npx vitest run src/data/analytics.test.ts` — PASS (all pre-existing tests too).

**Step 5: Commit**

```bash
git add src/data/analytics.ts src/data/analytics.test.ts
git commit -m "feat: bucket deleted categories as Uncategorized in analytics"
```

---

### Task 5: Deterministic per-user seed IDs

**Files:**
- Modify: `src/data/categories.ts:18-25`, `src/App.tsx:23`
- Test: `src/data/categories.test.ts`, `src/App.test.tsx`

**Step 1: Write the failing test** — update the existing seed test in `categories.test.ts` (the function gains a required `userId` param) and add:

```ts
it('seeds deterministic per-user ids so two fresh devices converge', async () => {
  await seedDefaultCategoriesIfEmpty('user-1')
  const first = await listCategories()
  expect(first.find((c) => c.name === 'Food')?.id).toBe('def-food-user-1')
  expect(first.find((c) => c.name === 'Bills & Utilities')?.id).toBe('def-bills-utilities-user-1')
})
```

**Step 2: Verify failure** — `npx vitest run src/data/categories.test.ts` — FAIL.

**Step 3: Implement** — in `src/data/categories.ts` (drop the now-unused `makeId` import):

```ts
const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export async function seedDefaultCategoriesIfEmpty(userId: string): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    const count = await db.categories.count()
    if (count > 0) return
    const now = Date.now()
    await db.categories.bulkAdd(
      DEFAULT_CATEGORIES.map((c) => ({ ...c, id: `def-${slugify(c.name)}-${userId}`, updatedAt: now }))
    )
  })
}
```

In `App.tsx`, pass the id: `seedDefaultCategoriesIfEmpty(session.user.id)` (full boot-order rework lands in Task 7; this keeps it compiling).

**Step 4: Verify** — `npx vitest run src/data/categories.test.ts src/App.test.tsx` — PASS.

**Step 5: Commit**

```bash
git add src/data/categories.ts src/data/categories.test.ts src/App.tsx
git commit -m "feat: seed default categories with deterministic per-user ids"
```

---

### Task 6: Duplicate-category merge migration (local)

**Files:**
- Create: `src/data/mergeCategories.ts`
- Test: `src/data/mergeCategories.test.ts`

**Step 1: Write the failing tests** — create `src/data/mergeCategories.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { mergeDuplicateCategories } from './mergeCategories'

const cat = (id: string, name: string, type: 'expense' | 'income' = 'expense') =>
  ({ id, name, color: '#000000', type, isDefault: true, updatedAt: 1 })

describe('mergeDuplicateCategories', () => {
  beforeEach(async () => {
    await Promise.all([db.categories.clear(), db.transactions.clear(), db.budgets.clear(), db.recurringRules.clear()])
  })

  it('merges same-name-same-type duplicates into a deterministic winner and re-points references', async () => {
    await db.categories.bulkAdd([cat('b-food', 'Food'), cat('a-food', 'Food'), cat('def-food-u1', 'Food')])
    await db.transactions.add({ id: 't1', type: 'expense', categoryId: 'b-food', amount: 10, description: '', date: '2026-08-01', time: '09:00', createdAt: 1, updatedAt: 1 })
    await db.recurringRules.add({ id: 'r1', categoryId: 'a-food', amount: 5, description: '', type: 'expense', frequency: 'monthly', dayOfMonth: 1, isActive: true, startDate: '2026-01-01', updatedAt: 1 })

    const result = await mergeDuplicateCategories()

    expect((await db.categories.toArray()).map((c) => c.id)).toEqual(['def-food-u1'])
    expect((await db.transactions.get('t1'))?.categoryId).toBe('def-food-u1')
    expect((await db.recurringRules.get('r1'))?.categoryId).toBe('def-food-u1')
    expect(result.deletedCategoryIds.sort()).toEqual(['a-food', 'b-food'])
  })

  it('collapses same-month budget collisions keeping the latest', async () => {
    await db.categories.bulkAdd([cat('a-food', 'Food'), cat('b-food', 'Food')])
    await db.budgets.bulkAdd([
      { id: 'bud-old', categoryId: 'a-food', month: '2026-08', limitAmount: 100, updatedAt: 1 },
      { id: 'bud-new', categoryId: 'b-food', month: '2026-08', limitAmount: 200, updatedAt: 2 },
    ])

    const result = await mergeDuplicateCategories()

    const budgets = await db.budgets.toArray()
    expect(budgets).toHaveLength(1)
    expect(budgets[0]).toMatchObject({ id: 'bud-new', categoryId: 'a-food', limitAmount: 200 })
    expect(result.deletedBudgetIds).toEqual(['bud-old'])
  })

  it('does not merge across types or touch soft-deleted categories, and is idempotent', async () => {
    await db.categories.bulkAdd([
      cat('c1', 'Other', 'expense'), cat('c2', 'Other', 'income'),
      { ...cat('c3', 'Other', 'expense'), deletedAt: 1 },
    ])

    const first = await mergeDuplicateCategories()
    const second = await mergeDuplicateCategories()

    expect((await db.categories.toArray())).toHaveLength(3)
    expect(first.deletedCategoryIds).toEqual([])
    expect(second.deletedCategoryIds).toEqual([])
  })
})
```

**Step 2: Verify failure** — `npx vitest run src/data/mergeCategories.test.ts` — FAIL (module missing).

**Step 3: Implement** — create `src/data/mergeCategories.ts`:

```ts
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
```

**Step 4: Verify** — `npx vitest run src/data/mergeCategories.test.ts` — PASS.

**Step 5: Commit**

```bash
git add src/data/mergeCategories.ts src/data/mergeCategories.test.ts
git commit -m "feat: add idempotent duplicate-category merge migration"
```

---

### Task 7: Boot orchestration — pull → merge → seed → push → remote delete

**Files:**
- Modify: `src/sync/syncEngine.ts` (add `deleteRemoteRows`)
- Modify: `src/App.tsx:21-34`
- Test: `src/sync/syncEngine.test.ts`, `src/App.test.tsx`

**Step 1: Write the failing test** — in `syncEngine.test.ts`, extend the supabase mock's `from()` return with a delete chain and add:

```ts
const deleteInMock = vi.fn().mockResolvedValue({ error: null })
// inside vi.mock's from(): { upsert: upsertMock, delete: () => ({ in: deleteInMock }), ...selectChainFor(table) }

it('deletes remote rows by id', async () => {
  await deleteRemoteRows('categories', ['a', 'b'])
  expect(deleteInMock).toHaveBeenCalledWith('id', ['a', 'b'])
})

it('skips the network entirely for an empty id list', async () => {
  await deleteRemoteRows('categories', [])
  expect(deleteInMock).not.toHaveBeenCalled()
})
```

**Step 2: Verify failure** — `npx vitest run src/sync/syncEngine.test.ts` — FAIL (not exported).

**Step 3: Implement** — in `src/sync/syncEngine.ts`:

```ts
export async function deleteRemoteRows(tableName: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from(tableName).delete().in('id', ids)
  if (error) throw error
}
```

Rework the `App.tsx` effect body (keep the existing `session?.user.id` dependency and its comment):

```tsx
useEffect(() => {
  if (!session) return
  const userId = session.user.id
  const boot = async () => {
    setSyncing(true)
    try {
      // Pull first so a fresh device sees existing remote categories before deciding to seed;
      // swallow network errors so an offline first run still seeds and works locally.
      await syncAll().catch(() => {})
      const merged = await mergeDuplicateCategories()
      await seedDefaultCategoriesIfEmpty(userId)
      await catchUpRecurringTransactions(todayDateString())
      // Second sync pushes re-pointed/seeded rows so the remote FK (`on delete restrict`)
      // no longer blocks deleting the merged-away duplicates. Budgets go first: their rows
      // reference the loser categories. Failures are retried on a later boot.
      await syncAll().catch(() => {})
      await deleteRemoteRows('budgets', merged.deletedBudgetIds).catch(() => {})
      await deleteRemoteRows('categories', merged.deletedCategoryIds).catch(() => {})
    } finally {
      setSyncing(false)
    }
  }
  boot()
  // oxlint-disable-next-line react-hooks/exhaustive-deps
}, [session?.user.id])
```

Update `App.test.tsx` mocks:

```ts
vi.mock('./data/mergeCategories', () => ({
  mergeDuplicateCategories: vi.fn().mockResolvedValue({ deletedCategoryIds: [], deletedBudgetIds: [] }),
}))
vi.mock('./sync/syncEngine', () => ({
  syncAll: vi.fn().mockResolvedValue(undefined),
  deleteRemoteRows: vi.fn().mockResolvedValue(undefined),
}))
```

**Step 4: Verify** — `npx vitest run src/sync/syncEngine.test.ts src/App.test.tsx` — PASS.

**Step 5: Commit**

```bash
git add src/sync/syncEngine.ts src/sync/syncEngine.test.ts src/App.tsx src/App.test.tsx
git commit -m "fix: pull before seeding and merge duplicate categories on boot"
```

---

### Task 8: Category CRUD UI on the Categories screen

**Files:**
- Modify: `src/screens/CategoriesBudgetsScreen.tsx`
- Test: `src/screens/CategoriesBudgetsScreen.test.tsx`

**Step 1: Write the failing tests** — follow the file's existing render/setup pattern; seed Dexie directly and use `userEvent`:

```ts
it('adds a new category', async () => {
  render(<CategoriesBudgetsScreen />)
  await screen.findByText('Monthly Budgets')
  await user.type(screen.getByLabelText(/new category name/i), 'Pets')
  await user.click(screen.getByRole('button', { name: /add category/i }))
  expect(await screen.findByDisplayValue('Pets')).toBeInTheDocument()
  const stored = await db.categories.toArray()
  expect(stored.some((c) => c.name === 'Pets' && !c.isDefault)).toBe(true)
})

it('deletes a category and hides it from budgets', async () => {
  await db.categories.add({ id: 'c1', name: 'Food', color: '#f59e0b', type: 'expense', isDefault: true, updatedAt: 1 })
  render(<CategoriesBudgetsScreen />)
  await user.click(await screen.findByRole('button', { name: /delete food/i }))
  await waitFor(async () => expect((await db.categories.get('c1'))?.deletedAt).toBeGreaterThan(0))
  expect(screen.queryByLabelText('Food')).not.toBeInTheDocument()
})

it('renames a category on blur', async () => {
  await db.categories.add({ id: 'c1', name: 'Food', color: '#f59e0b', type: 'expense', isDefault: true, updatedAt: 1 })
  render(<CategoriesBudgetsScreen />)
  const nameInput = await screen.findByLabelText(/rename food/i)
  await user.clear(nameInput)
  await user.type(nameInput, 'Eating out')
  await user.tab()
  await waitFor(async () => expect((await db.categories.get('c1'))?.name).toBe('Eating out'))
})
```

**Step 2: Verify failure** — `npx vitest run src/screens/CategoriesBudgetsScreen.test.tsx` — FAIL.

**Step 3: Implement** — rewrite `CategoriesBudgetsScreen.tsx`:

```tsx
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import type { TransactionType } from '../data/db'
import { createCategory, updateCategory, deleteCategory } from '../data/categories'
import { setBudgetLimit } from '../data/budgets'
import { currentMonthString } from '../utils/date'

export function CategoriesBudgetsScreen() {
  const month = currentMonthString()
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const budgets = useLiveQuery(() => db.budgets.where('month').equals(month).toArray(), [month])
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#3b82f6')
  const [newType, setNewType] = useState<TransactionType>('expense')

  if (!categories || !budgets) return null

  const active = categories.filter((c) => !c.deletedAt)
  const expenseCategories = active.filter((c) => c.type === 'expense')
  const limitFor = (categoryId: string) => budgets.find((b) => b.categoryId === categoryId)?.limitAmount ?? ''

  const addCategory = async () => {
    const name = newName.trim()
    if (!name) return
    await createCategory({ name, color: newColor, type: newType })
    setNewName('')
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-lg font-semibold">Categories</h1>
        {active.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            <input
              type="color"
              aria-label={`Color for ${c.name}`}
              value={c.color}
              onChange={(e) => updateCategory(c.id, { color: e.target.value })}
              className="h-8 w-8 shrink-0 rounded border border-border bg-surface"
            />
            <input
              aria-label={`Rename ${c.name}`}
              defaultValue={c.name}
              onBlur={(e) => {
                const name = e.target.value.trim()
                if (name && name !== c.name) updateCategory(c.id, { name })
              }}
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface p-2"
            />
            <span className="text-xs text-muted w-14">{c.type}</span>
            <button
              type="button"
              aria-label={`Delete ${c.name}`}
              onClick={() => deleteCategory(c.id)}
              className="rounded-lg border border-border px-2 py-1 text-sm text-muted"
            >
              Delete
            </button>
          </div>
        ))}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); addCategory() }}
        >
          <input
            type="color"
            aria-label="New category color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="h-8 w-8 shrink-0 rounded border border-border bg-surface"
          />
          <input
            aria-label="New category name"
            placeholder="New category"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface p-2"
          />
          <select
            aria-label="New category type"
            value={newType}
            onChange={(e) => setNewType(e.target.value as TransactionType)}
            className="rounded-lg border border-border bg-surface p-2"
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
          <button type="submit" className="rounded-lg bg-accent px-3 py-2 text-sm text-white">
            Add category
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Monthly Budgets</h2>
        {expenseCategories.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2">
            <label htmlFor={`budget-${c.id}`}>{c.name}</label>
            <input
              id={`budget-${c.id}`}
              aria-label={c.name}
              type="number"
              defaultValue={limitFor(c.id)}
              onBlur={(e) => {
                if (e.target.value === '') return
                const value = Number(e.target.value)
                if (!Number.isNaN(value) && value >= 0) setBudgetLimit(c.id, month, value)
              }}
              className="border border-border bg-surface rounded-lg p-2 w-28"
            />
          </div>
        ))}
      </section>
    </div>
  )
}
```

Note: budgets now render for expense categories only, matching prior behavior; the management list shows both types.

**Step 4: Verify** — `npx vitest run src/screens/CategoriesBudgetsScreen.test.tsx` — PASS (existing budget tests included; update their queries if the heading level change breaks them).

**Step 5: Commit**

```bash
git add src/screens/CategoriesBudgetsScreen.tsx src/screens/CategoriesBudgetsScreen.test.tsx
git commit -m "feat: add category management (add, rename, recolor, delete) to categories screen"
```

---

### Task 9: Comparison data function

**Files:**
- Modify: `src/data/analytics.ts` (add `getCategoryComparison`, remove `getMonthComparison` + `MonthComparisonRow`)
- Test: `src/data/analytics.test.ts`

**Step 1: Write the failing test**:

```ts
it('builds a per-category per-month comparison', async () => {
  await db.categories.bulkAdd([
    { id: 'c1', name: 'Food', color: '#f59e0b', type: 'expense', isDefault: true, updatedAt: 1 },
    { id: 'c2', name: 'Rent', color: '#ef4444', type: 'expense', isDefault: true, updatedAt: 1 },
  ])
  await db.transactions.bulkAdd([
    { id: 't1', type: 'expense', categoryId: 'c1', amount: 10, description: '', date: '2026-07-05', time: '09:00', createdAt: 1, updatedAt: 1 },
    { id: 't2', type: 'expense', categoryId: 'c1', amount: 20, description: '', date: '2026-08-05', time: '09:00', createdAt: 1, updatedAt: 1 },
    { id: 't3', type: 'expense', categoryId: 'c2', amount: 99, description: '', date: '2026-08-06', time: '09:00', createdAt: 1, updatedAt: 1 },
  ])

  const rows = await getCategoryComparison(['2026-07', '2026-08'])

  expect(rows).toContainEqual({ categoryId: 'c1', categoryName: 'Food', color: '#f59e0b', amounts: { '2026-07': 10, '2026-08': 20 } })
  expect(rows).toContainEqual({ categoryId: 'c2', categoryName: 'Rent', color: '#ef4444', amounts: { '2026-08': 99 } })
})
```

**Step 2: Verify failure** — `npx vitest run src/data/analytics.test.ts` — FAIL.

**Step 3: Implement** — in `src/data/analytics.ts`, add:

```ts
export interface ComparisonRow {
  categoryId: string
  categoryName: string
  color: string
  amounts: Record<string, number> // month (YYYY-MM) -> expense total
}

export async function getCategoryComparison(months: string[]): Promise<ComparisonRow[]> {
  const rows = new Map<string, ComparisonRow>()
  for (const month of months) {
    for (const item of await getCategoryBreakdown(month, 'expense')) {
      const row = rows.get(item.categoryId) ??
        { categoryId: item.categoryId, categoryName: item.categoryName, color: item.color, amounts: {} }
      row.amounts[month] = item.total
      rows.set(item.categoryId, row)
    }
  }
  return [...rows.values()]
}
```

Delete `getMonthComparison`, `MonthComparisonRow`, and their tests (superseded by the builder; the screen stops using them in Task 10 — do the screen import swap there in the same commit if the build complains, otherwise keep removal here and Task 10 immediately follows).

**Step 4: Verify** — `npx vitest run src/data/analytics.test.ts` — PASS. If `tsc` fails because `AnalyticsScreen` still imports `getMonthComparison`, proceed to Task 10 and commit both together.

**Step 5: Commit**

```bash
git add src/data/analytics.ts src/data/analytics.test.ts
git commit -m "feat: add per-category per-month comparison aggregation"
```

---

### Task 10: Comparison builder UI

**Files:**
- Modify: `src/screens/AnalyticsScreen.tsx` (replace the "This month vs last month" section)
- Test: `src/screens/AnalyticsScreen.test.tsx` (create if absent)

**Step 1: Write the failing tests** — mock nothing; seed Dexie (fake-indexeddb) and render:

```ts
it('renders the comparison builder with month and category chips', async () => {
  await db.categories.add({ id: 'c1', name: 'Food', color: '#f59e0b', type: 'expense', isDefault: true, updatedAt: 1 })
  await db.transactions.add({ id: 't1', type: 'expense', categoryId: 'c1', amount: 10, description: '', date: '2026-08-05', time: '09:00', createdAt: 1, updatedAt: 1 })
  render(<AnalyticsScreen />)
  expect(await screen.findByText('Compare')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '2026-08', pressed: true })).toBeInTheDocument()
  expect(await screen.findByRole('button', { name: 'Food', pressed: true })).toBeInTheDocument()
})

it('persists chip selection to localStorage', async () => {
  await db.categories.add({ id: 'c1', name: 'Food', color: '#f59e0b', type: 'expense', isDefault: true, updatedAt: 1 })
  await db.transactions.add({ id: 't1', type: 'expense', categoryId: 'c1', amount: 10, description: '', date: '2026-08-05', time: '09:00', createdAt: 1, updatedAt: 1 })
  render(<AnalyticsScreen />)
  await user.click(await screen.findByRole('button', { name: 'Food', pressed: true }))
  await waitFor(() => {
    expect(JSON.parse(localStorage.getItem('budget-manager:compareSelection')!).excludedCategoryIds).toContain('c1')
  })
})
```

(Recharts renders nothing measurable in jsdom — assert on chips/table, not SVG.)

**Step 2: Verify failure** — `npx vitest run src/screens/AnalyticsScreen.test.tsx` — FAIL.

**Step 3: Implement** — in `AnalyticsScreen.tsx`:

- Remove `getMonthComparison`/`MonthComparisonRow` imports and the `comparison` state; delete the "This month vs last month" section.
- Add state + persistence (store **selected months** and **excluded category ids** — exclusion means new categories appear by default):

```tsx
const COMPARE_KEY = 'budget-manager:compareSelection'
interface CompareSelection { months: string[]; excludedCategoryIds: string[] }

function loadSelection(defaultMonths: string[]): CompareSelection {
  try {
    const raw = localStorage.getItem(COMPARE_KEY)
    if (raw) return JSON.parse(raw) as CompareSelection
  } catch { /* corrupted selection falls back to default */ }
  return { months: defaultMonths, excludedCategoryIds: [] }
}
```

- Component logic: `const monthOptions = lastNMonths(12, month)`; selection state initialized from `loadSelection(lastNMonths(2, month))`; on every toggle, `setSelection` and `localStorage.setItem(COMPARE_KEY, JSON.stringify(next))`. Load rows with `getCategoryComparison(selection.months)` in a `useEffect` keyed on `selection.months`. `const visibleRows = rows.filter((r) => !selection.excludedCategoryIds.includes(r.categoryId))`.
- Chips: month chips and category chips as `<button type="button" aria-pressed={selected}>` styled `rounded-full border px-3 py-1 text-sm` with `bg-accent text-white` when pressed, `bg-surface text-muted border-border` when not.
- Chart + table in a new section titled `Compare`:

```tsx
const MONTH_BAR_COLORS = ['#94a3b8', 'var(--color-accent)', '#f59e0b', '#a855f7', '#14b8a6', '#ec4899']
const chartData = visibleRows.map((r) => ({ name: r.categoryName, ...r.amounts }))

<ResponsiveContainer width="100%" height={220}>
  <BarChart data={chartData}>
    <XAxis dataKey="name" tick={{ fill: 'var(--color-muted)' }} />
    <YAxis tick={{ fill: 'var(--color-muted)' }} />
    <Tooltip />
    {selection.months.map((m, i) => (
      <Bar key={m} dataKey={m} name={m} fill={MONTH_BAR_COLORS[i % MONTH_BAR_COLORS.length]} />
    ))}
  </BarChart>
</ResponsiveContainer>

<table className="w-full text-sm">
  <thead>
    <tr className="text-muted">
      <th className="text-left font-normal">Category</th>
      {selection.months.map((m) => <th key={m} className="text-right font-normal">{m}</th>)}
      {selection.months.length === 2 && <th className="text-right font-normal">Δ</th>}
    </tr>
  </thead>
  <tbody>
    {visibleRows.map((r) => (
      <tr key={r.categoryId}>
        <td>{r.categoryName}</td>
        {selection.months.map((m) => <td key={m} className="text-right">₹{r.amounts[m] ?? 0}</td>)}
        {selection.months.length === 2 && (
          <td className="text-right">₹{(r.amounts[selection.months[1]] ?? 0) - (r.amounts[selection.months[0]] ?? 0)}</td>
        )}
      </tr>
    ))}
  </tbody>
</table>
```

**Step 4: Verify** — `npx vitest run src/screens/AnalyticsScreen.test.tsx` — PASS.

**Step 5: Commit**

```bash
git add src/screens/AnalyticsScreen.tsx src/screens/AnalyticsScreen.test.tsx
git commit -m "feat: replace fixed month comparison with customizable comparison builder"
```

---

### Task 11: Full verification

**Step 1:** `npx vitest run` — Expected: all tests pass.
**Step 2:** `npm run lint` — Expected: clean.
**Step 3:** `npm run build` — Expected: `tsc -b` and vite build succeed.
**Step 4:** Fix anything that surfaces (e.g., stale imports of `getMonthComparison`), re-run, then commit any fixes:

```bash
git add -A && git commit -m "chore: fix lint/build fallout from category and analytics rework"
```

**Step 5:** Remind the user to run the one-time Supabase migration in the SQL editor:

```sql
alter table categories add column if not exists deleted_at timestamptz;
```

This must be run **before** deploying/using the new build, or category pushes will fail (unknown column).

---

```json
{
  "plan_id": "2026-08-22-category-management-and-analytics",
  "plan_file": "docs/plans/2026-08-22-category-management-and-analytics.md",
  "tasks": [
    { "id": 1, "title": "Soft-delete field + sync mapping + remote schema", "depends_on": [], "estimated_complexity": "S", "parallel_safe": false },
    { "id": 2, "title": "Soft delete in category repository", "depends_on": [1], "estimated_complexity": "S", "parallel_safe": false },
    { "id": 3, "title": "Uncategorized resolution + screens exclude deleted", "depends_on": [2], "estimated_complexity": "S", "parallel_safe": false },
    { "id": 4, "title": "Analytics buckets Uncategorized", "depends_on": [3], "estimated_complexity": "S", "parallel_safe": false },
    { "id": 5, "title": "Deterministic per-user seed IDs", "depends_on": [], "estimated_complexity": "S", "parallel_safe": true },
    { "id": 6, "title": "Duplicate-category merge migration", "depends_on": [2], "estimated_complexity": "M", "parallel_safe": false },
    { "id": 7, "title": "Boot orchestration + remote deletes", "depends_on": [5, 6], "estimated_complexity": "M", "parallel_safe": false },
    { "id": 8, "title": "Category CRUD UI", "depends_on": [3], "estimated_complexity": "M", "parallel_safe": false },
    { "id": 9, "title": "Comparison data function", "depends_on": [4], "estimated_complexity": "S", "parallel_safe": false },
    { "id": 10, "title": "Comparison builder UI", "depends_on": [9], "estimated_complexity": "M", "parallel_safe": false },
    { "id": 11, "title": "Full verification (tests, lint, build)", "depends_on": [7, 8, 10], "estimated_complexity": "S", "parallel_safe": false }
  ],
  "total_tasks": 11
}
```
