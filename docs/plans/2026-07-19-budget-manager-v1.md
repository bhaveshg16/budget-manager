# Budget Manager v1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Build v1 of a personal budget-tracking PWA with manual entry, local-first storage, Supabase sync across devices, budgets, recurring transactions, and detailed analytics.

**Architecture:** React + TypeScript + Vite PWA. All data is written to IndexedDB (via Dexie) first for instant, offline-capable UX, then synced in the background to a Supabase Postgres database scoped to one user via row-level security. UI reads live from Dexie via `useLiveQuery` so the screen updates automatically whenever local or synced data changes.

**Tech Stack:** React, TypeScript, Vite, Tailwind CSS v4, Dexie.js, `@supabase/supabase-js`, React Router, Recharts, Vitest, Testing Library, fake-indexeddb.

**Branching:** Create and work on `feature/v1-manual-entry`; merge to `main` once all tasks are done and verified.

**Design reference:** `docs/plans/2026-07-19-budget-manager-design.md`

---

## Task 0: Create the feature branch

**Step 1:** `git checkout -b feature/v1-manual-entry`

**Step 2:** Verify: `git branch --show-current` → expect `feature/v1-manual-entry`

---

## Task 1: Scaffold the Vite + React + TypeScript project

**Files:**
- Create: everything under a temporary `tmp-scaffold/` dir, then moved to repo root
- Modify: (none pre-existing conflict except `README.md`, which we keep)

**Step 1: Scaffold into a temp directory (avoids clobbering existing README.md/docs/.git)**

```bash
npm create vite@latest tmp-scaffold -- --template react-ts
```

**Step 2: Merge into repo root, keeping our own README.md**

```bash
rm tmp-scaffold/README.md
cp -a tmp-scaffold/. .
rm -rf tmp-scaffold
```

**Step 3: Install dependencies**

```bash
npm install
```

**Step 4: Verify the scaffold builds**

Run: `npm run build`
Expected: completes with `dist/` produced, no TypeScript errors.

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TypeScript project"
```

---

## Task 2: Add Tailwind CSS v4

**Files:**
- Modify: `vite.config.ts`, `src/index.css`, `src/App.tsx`

**Step 1: Install**

```bash
npm install tailwindcss @tailwindcss/vite
```

**Step 2: Wire the Vite plugin**

`vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

**Step 3: Replace stylesheet**

`src/index.css` — replace entire contents with:
```css
@import "tailwindcss";
```

**Step 4: Add a temporary utility class to verify Tailwind is processing**

In `src/App.tsx`, wrap the returned JSX root in a div with `className="rounded-lg bg-slate-100 p-4"` (temporary — later tasks replace `App.tsx` entirely).

**Step 5: Verify Tailwind output**

```bash
npm run build
grep -l "rounded-lg" dist/assets/*.css
```
Expected: a filename is printed (the utility class made it into the compiled CSS).

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: add Tailwind CSS v4"
```

---

## Task 3: Add PWA support

**Files:**
- Modify: `vite.config.ts`
- Create: `public/icon.svg`

**Step 1: Install**

```bash
npm install -D vite-plugin-pwa
```

**Step 2: Add a simple placeholder icon**

`public/icon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="32" fill="#0f766e"/>
  <text x="96" y="128" font-size="110" text-anchor="middle" fill="white" font-family="sans-serif">₹</text>
</svg>
```
(Replace with real artwork later — not required for v1 functionality.)

**Step 3: Configure the plugin**

`vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Budget Manager',
        short_name: 'Budget',
        description: 'Personal budget tracker',
        theme_color: '#0f766e',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [{ src: '/icon.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
})
```

**Step 4: Verify**

```bash
npm run build
ls dist/manifest.webmanifest dist/sw.js
```
Expected: both files listed (no "No such file" error).

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: add PWA manifest and service worker"
```

---

## Task 4: Set up Vitest + Testing Library + fake-indexeddb

**Files:**
- Modify: `vite.config.ts`, `package.json`
- Create: `src/test/setup.ts`, `src/App.test.tsx`

**Step 1: Install**

```bash
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event fake-indexeddb
```

**Step 2: Add test config**

`vite.config.ts` — add a `test` block (Vitest reads this from the Vite config):
```ts
export default defineConfig({
  plugins: [/* ...as before... */],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
})
```

**Step 3: Test setup file**

`src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
```

**Step 4: Add npm scripts**

`package.json` — add to `"scripts"`:
```json
"test": "vitest run"
```

**Step 5: Write a smoke test**

`src/App.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />)
    expect(document.body).toBeInTheDocument()
  })
})
```

**Step 6: Run it**

```bash
npm run test
```
Expected: `1 passed`.

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: set up Vitest and Testing Library"
```

---

## Task 5: Dexie schema and date utilities

**Files:**
- Create: `src/data/db.ts`, `src/data/db.test.ts`, `src/utils/id.ts`, `src/utils/date.ts`

**Step 1: ID helper (avoids relying on `crypto.randomUUID`, which isn't consistent across all test/browser environments)**

`src/utils/id.ts`:
```ts
export function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
```

**Step 2: Date helpers**

`src/utils/date.ts`:
```ts
export function todayDateString(): string {
  return formatDate(new Date())
}

export function nowTimeString(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function currentMonthString(): string {
  return todayDateString().slice(0, 7)
}

export function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
```

**Step 3: Write the failing test for the schema**

`src/data/db.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'

describe('BudgetDatabase', () => {
  beforeEach(async () => {
    await db.categories.clear()
    await db.transactions.clear()
    await db.budgets.clear()
    await db.recurringRules.clear()
  })

  it('opens with the expected tables', () => {
    expect(db.categories).toBeDefined()
    expect(db.transactions).toBeDefined()
    expect(db.budgets).toBeDefined()
    expect(db.recurringRules).toBeDefined()
  })

  it('can add and retrieve a category', async () => {
    await db.categories.add({
      id: 'c1', name: 'Food', color: '#f59e0b', type: 'expense', isDefault: true, updatedAt: 1,
    })
    const found = await db.categories.get('c1')
    expect(found?.name).toBe('Food')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/data/db.test.ts`
Expected: FAIL — `Cannot find module './db'`

**Step 3: Implement the schema**

`src/data/db.ts`:
```ts
import Dexie, { type Table } from 'dexie'

export type TransactionType = 'expense' | 'income'
export type RecurringFrequency = 'weekly' | 'monthly'

export interface Category {
  id: string
  name: string
  color: string
  type: TransactionType
  isDefault: boolean
  updatedAt: number
}

export interface Transaction {
  id: string
  type: TransactionType
  categoryId: string
  amount: number
  description: string
  date: string // YYYY-MM-DD
  time: string // HH:mm
  recurringRuleId?: string
  createdAt: number
  updatedAt: number
}

export interface Budget {
  id: string
  categoryId: string
  month: string // YYYY-MM
  limitAmount: number
  updatedAt: number
}

export interface RecurringRule {
  id: string
  categoryId: string
  amount: number
  description: string
  type: TransactionType
  frequency: RecurringFrequency
  dayOfMonth?: number // 1-31, used when frequency = 'monthly'
  dayOfWeek?: number // 0-6 (Sun-Sat), used when frequency = 'weekly'
  isActive: boolean
  startDate: string // YYYY-MM-DD, occurrences are only counted after this date
  lastPostedDate?: string // YYYY-MM-DD, last date an occurrence was auto-posted through
  updatedAt: number
}

class BudgetDatabase extends Dexie {
  categories!: Table<Category, string>
  transactions!: Table<Transaction, string>
  budgets!: Table<Budget, string>
  recurringRules!: Table<RecurringRule, string>

  constructor() {
    super('budget-manager')
    this.version(1).stores({
      categories: 'id, type',
      transactions: 'id, categoryId, date, recurringRuleId',
      budgets: 'id, categoryId, month, [categoryId+month]',
      recurringRules: 'id, categoryId',
    })
  }
}

export const db = new BudgetDatabase()
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/data/db.test.ts`
Expected: `2 passed`

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Dexie schema and date/id utilities"
```

---

## Task 6: Category repository + default seeding

**Files:**
- Create: `src/data/categories.ts`, `src/data/categories.test.ts`

**Step 1: Write the failing tests**

`src/data/categories.test.ts`:
```ts
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
```

**Step 2: Run to verify failure**

Run: `npm run test -- src/data/categories.test.ts`
Expected: FAIL — `Cannot find module './categories'`

**Step 3: Implement**

`src/data/categories.ts`:
```ts
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
  { name: 'Groceries', color: '#eab308', type: 'expense', isDefault: true },
  { name: 'Salary', color: '#059669', type: 'income', isDefault: true },
  { name: 'Other Income', color: '#0ea5e9', type: 'income', isDefault: true },
]

export async function seedDefaultCategoriesIfEmpty(): Promise<void> {
  const count = await db.categories.count()
  if (count > 0) return
  const now = Date.now()
  await db.categories.bulkAdd(DEFAULT_CATEGORIES.map((c) => ({ ...c, id: makeId(), updatedAt: now })))
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

export async function deleteCategory(id: string): Promise<void> {
  await db.categories.delete(id)
}
```

**Step 4: Run to verify pass**

Run: `npm run test -- src/data/categories.test.ts`
Expected: `3 passed`

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add category repository with default seeding"
```

---

## Task 7: Transaction repository

**Files:**
- Create: `src/data/transactions.ts`, `src/data/transactions.test.ts`

**Step 1: Write the failing tests**

`src/data/transactions.test.ts`:
```ts
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
```

**Step 2: Run to verify failure**

Run: `npm run test -- src/data/transactions.test.ts`
Expected: FAIL — `Cannot find module './transactions'`

**Step 3: Implement**

`src/data/transactions.ts`:
```ts
import { db } from './db'
import type { Transaction, TransactionType } from './db'
import { makeId } from '../utils/id'

export interface NewTransactionInput {
  type: TransactionType
  categoryId: string
  amount: number
  description: string
  date: string
  time: string
  recurringRuleId?: string
}

export async function createTransaction(input: NewTransactionInput): Promise<Transaction> {
  const now = Date.now()
  const transaction: Transaction = { ...input, id: makeId(), createdAt: now, updatedAt: now }
  await db.transactions.add(transaction)
  return transaction
}

export async function updateTransaction(id: string, changes: Partial<NewTransactionInput>): Promise<void> {
  await db.transactions.update(id, { ...changes, updatedAt: Date.now() })
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.transactions.delete(id)
}

export async function listTransactionsForMonth(month: string): Promise<Transaction[]> {
  return db.transactions.where('date').startsWith(month).toArray()
}
```

**Step 4: Run to verify pass**

Run: `npm run test -- src/data/transactions.test.ts`
Expected: `4 passed`

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add transaction repository"
```

---

## Task 8: Budget repository

**Files:**
- Create: `src/data/budgets.ts`, `src/data/budgets.test.ts`

**Step 1: Write the failing tests**

`src/data/budgets.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { setBudgetLimit, listBudgetsForMonth, deleteBudget } from './budgets'

describe('budget repository', () => {
  beforeEach(async () => {
    await db.budgets.clear()
  })

  it('creates a budget limit', async () => {
    const b = await setBudgetLimit('c1', '2026-07', 8000)
    expect(b.limitAmount).toBe(8000)
  })

  it('updates the existing limit instead of duplicating it', async () => {
    await setBudgetLimit('c1', '2026-07', 8000)
    await setBudgetLimit('c1', '2026-07', 9000)
    const all = await listBudgetsForMonth('2026-07')
    expect(all).toHaveLength(1)
    expect(all[0].limitAmount).toBe(9000)
  })

  it('lists budgets scoped to a month', async () => {
    await setBudgetLimit('c1', '2026-07', 8000)
    await setBudgetLimit('c2', '2026-08', 3000)
    expect(await listBudgetsForMonth('2026-07')).toHaveLength(1)
  })

  it('deletes a budget', async () => {
    const b = await setBudgetLimit('c1', '2026-07', 8000)
    await deleteBudget(b.id)
    expect(await listBudgetsForMonth('2026-07')).toHaveLength(0)
  })
})
```

**Step 2: Run to verify failure**

Run: `npm run test -- src/data/budgets.test.ts`
Expected: FAIL — `Cannot find module './budgets'`

**Step 3: Implement**

`src/data/budgets.ts`:
```ts
import { db } from './db'
import type { Budget } from './db'
import { makeId } from '../utils/id'

export async function setBudgetLimit(categoryId: string, month: string, limitAmount: number): Promise<Budget> {
  const existing = await db.budgets.where('[categoryId+month]').equals([categoryId, month]).first()
  const updatedAt = Date.now()
  if (existing) {
    await db.budgets.update(existing.id, { limitAmount, updatedAt })
    return { ...existing, limitAmount, updatedAt }
  }
  const budget: Budget = { id: makeId(), categoryId, month, limitAmount, updatedAt }
  await db.budgets.add(budget)
  return budget
}

export async function listBudgetsForMonth(month: string): Promise<Budget[]> {
  return db.budgets.where('month').equals(month).toArray()
}

export async function deleteBudget(id: string): Promise<void> {
  await db.budgets.delete(id)
}
```

**Step 4: Run to verify pass**

Run: `npm run test -- src/data/budgets.test.ts`
Expected: `4 passed`

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add budget repository"
```

---

## Task 9: Recurring transaction schedule + catch-up engine

This is the trickiest logic in the app. Because a PWA cannot run code while it's closed (no reliable background execution, especially on iOS Safari), "auto-post on due date" is implemented as a **catch-up on open**: every time the app launches, it checks each active recurring rule for any occurrences due between its last post and today, and creates them all at once.

**Files:**
- Create: `src/data/recurringSchedule.ts`, `src/data/recurringSchedule.test.ts`, `src/data/recurring.ts`, `src/data/recurring.test.ts`

**Step 1: Write the failing tests for the pure date math**

`src/data/recurringSchedule.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { occurrenceDatesInRange } from './recurringSchedule'

describe('occurrenceDatesInRange', () => {
  it('returns monthly occurrences strictly after "from" up to and including "to"', () => {
    const rule = { frequency: 'monthly' as const, dayOfMonth: 1 }
    const dates = occurrenceDatesInRange(rule, '2026-01-01', '2026-04-01')
    expect(dates).toEqual(['2026-02-01', '2026-03-01', '2026-04-01'])
  })

  it('clamps day-of-month 31 to the last day of shorter months', () => {
    const rule = { frequency: 'monthly' as const, dayOfMonth: 31 }
    const dates = occurrenceDatesInRange(rule, '2026-01-15', '2026-03-31')
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })

  it('returns weekly occurrences on the target day of week', () => {
    const rule = { frequency: 'weekly' as const, dayOfWeek: 1 } // Monday
    const dates = occurrenceDatesInRange(rule, '2026-07-01', '2026-07-15')
    expect(dates).toEqual(['2026-07-06', '2026-07-13'])
  })

  it('returns an empty array when the range has no occurrence', () => {
    const rule = { frequency: 'monthly' as const, dayOfMonth: 15 }
    expect(occurrenceDatesInRange(rule, '2026-07-16', '2026-07-31')).toEqual([])
  })
})
```

**Step 2: Run to verify failure**

Run: `npm run test -- src/data/recurringSchedule.test.ts`
Expected: FAIL — `Cannot find module './recurringSchedule'`

**Step 3: Implement the pure schedule math**

`src/data/recurringSchedule.ts`:
```ts
import { formatDate } from '../utils/date'

export interface ScheduleRule {
  frequency: 'weekly' | 'monthly'
  dayOfMonth?: number
  dayOfWeek?: number
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate() // month: 1-12
}

/** Returns YYYY-MM-DD occurrence dates strictly after `fromExclusive` and up to and including `toInclusive`. */
export function occurrenceDatesInRange(rule: ScheduleRule, fromExclusive: string, toInclusive: string): string[] {
  const from = new Date(fromExclusive + 'T00:00:00')
  const to = new Date(toInclusive + 'T00:00:00')
  const results: string[] = []

  if (rule.frequency === 'monthly') {
    const day = rule.dayOfMonth ?? 1
    const cursor = new Date(from.getFullYear(), from.getMonth(), 1)
    while (cursor <= to) {
      const year = cursor.getFullYear()
      const month = cursor.getMonth() + 1
      const occurrence = new Date(year, month - 1, Math.min(day, daysInMonth(year, month)))
      if (occurrence > from && occurrence <= to) {
        results.push(formatDate(occurrence))
      }
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return results
  }

  const targetDow = rule.dayOfWeek ?? 0
  const cursor = new Date(from)
  cursor.setDate(cursor.getDate() + 1)
  while (cursor <= to) {
    if (cursor.getDay() === targetDow) results.push(formatDate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return results
}
```

**Step 4: Run to verify pass**

Run: `npm run test -- src/data/recurringSchedule.test.ts`
Expected: `4 passed`

**Step 5: Write the failing tests for the rule repository + catch-up engine**

`src/data/recurring.test.ts`:
```ts
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
})
```

**Step 6: Run to verify failure**

Run: `npm run test -- src/data/recurring.test.ts`
Expected: FAIL — `Cannot find module './recurring'`

**Step 7: Implement**

`src/data/recurring.ts`:
```ts
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
    const from = rule.lastPostedDate ?? rule.startDate
    const dueDates = occurrenceDatesInRange(rule, from, today)
    for (const date of dueDates) {
      await createTransaction({
        type: rule.type,
        categoryId: rule.categoryId,
        amount: rule.amount,
        description: rule.description,
        date,
        time: '09:00',
        recurringRuleId: rule.id,
      })
    }
    if (dueDates.length > 0) {
      await db.recurringRules.update(rule.id, { lastPostedDate: dueDates[dueDates.length - 1], updatedAt: Date.now() })
    }
  }
}
```

Note: a rule created today with `startDate` = today will not auto-post an occurrence for today itself — the user enters that first one manually (they're creating the rule because they just paid it); every occurrence afterward posts automatically.

**Step 8: Run to verify pass**

Run: `npm run test -- src/data/recurring.test.ts`
Expected: `3 passed`

**Step 9: Commit**

```bash
git add -A
git commit -m "feat: add recurring transaction schedule and catch-up engine"
```

---

## Task 10: Supabase project setup (manual) + client wiring

**This task requires you (not the agent) to create a Supabase account/project — an agent cannot sign up for a third-party service on your behalf.**

**Step 1 (manual, in browser): Create the project**
1. Go to supabase.com, create a free account and a new project (any region close to you).
2. In the SQL editor, run the schema below.
3. In Project Settings → API, copy the **Project URL** and **anon public key**.

**Step 2: Run this SQL in the Supabase SQL editor**

```sql
create table categories (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id),
  name text not null,
  color text not null,
  type text not null check (type in ('expense','income')),
  is_default boolean not null default false,
  updated_at timestamptz not null default now()
);

create table transactions (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id),
  type text not null check (type in ('expense','income')),
  category_id text not null references categories(id),
  amount numeric not null,
  description text not null default '',
  date date not null,
  time time not null,
  recurring_rule_id text,
  updated_at timestamptz not null default now()
);

create table budgets (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id),
  category_id text not null references categories(id),
  month text not null,
  limit_amount numeric not null,
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, month)
);

create table recurring_rules (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id),
  category_id text not null references categories(id),
  amount numeric not null,
  description text not null default '',
  type text not null check (type in ('expense','income')),
  frequency text not null check (frequency in ('weekly','monthly')),
  day_of_month int,
  day_of_week int,
  is_active boolean not null default true,
  start_date date not null,
  last_posted_date date,
  updated_at timestamptz not null default now()
);

alter table categories enable row level security;
alter table transactions enable row level security;
alter table budgets enable row level security;
alter table recurring_rules enable row level security;

create policy "own rows only" on categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on budgets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on recurring_rules for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

**Step 3: Install the client library**

```bash
npm install @supabase/supabase-js
```

**Step 4: Add environment template**

`.env.local.example`:
```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Copy this to `.env.local` (already gitignored by the Vite scaffold's `*.local` rule) and fill in your real values from Step 1.

**Step 5: Client wiring**

`src/lib/supabaseClient.ts`:
```ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — copy .env.local.example to .env.local and fill it in.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

**Step 6: Verify**

```bash
npm run build
```
Expected: builds successfully (the throw only fires at runtime if env vars are missing, not at build time).

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: add Supabase schema and client wiring"
```
(`.env.local` itself is never committed — confirm with `git status` that only `.env.local.example` and `supabaseClient.ts` are staged.)

---

## Task 11: Auth — one-time magic-link sign-in per device

**Files:**
- Create: `src/auth/AuthProvider.tsx`, `src/auth/SignInScreen.tsx`, `src/auth/SignInScreen.test.tsx`

**Step 1: Write the failing test**

`src/auth/SignInScreen.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { SignInScreen } from './SignInScreen'

vi.mock('../lib/supabaseClient', () => ({
  supabase: { auth: { signInWithOtp: vi.fn().mockResolvedValue({ error: null }) } },
}))

describe('SignInScreen', () => {
  it('shows a confirmation after requesting a magic link', async () => {
    render(<SignInScreen />)
    await userEvent.type(screen.getByLabelText(/email/i), 'me@example.com')
    await userEvent.click(screen.getByRole('button', { name: /send link/i }))
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument()
  })
})
```

**Step 2: Run to verify failure**

Run: `npm run test -- src/auth/SignInScreen.test.tsx`
Expected: FAIL — `Cannot find module './SignInScreen'`

**Step 3: Implement the auth context**

`src/auth/AuthProvider.tsx`:
```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

interface AuthContextValue {
  session: Session | null
  loading: boolean
  signInWithEmail: (email: string) => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession))
    return () => data.subscription.unsubscribe()
  }, [])

  async function signInWithEmail(email: string) {
    const { error } = await supabase.auth.signInWithOtp({ email })
    return { error: error?.message ?? null }
  }

  return <AuthContext.Provider value={{ session, loading, signInWithEmail }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

**Step 4: Implement the sign-in screen**

`src/auth/SignInScreen.tsx`:
```tsx
import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function SignInScreen() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithOtp({ email })
    if (error) setError(error.message)
    else setSent(true)
  }

  if (sent) return <p role="status">Check your email for a sign-in link.</p>

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-6 max-w-sm mx-auto">
      <label htmlFor="email">Email</label>
      <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
        className="border rounded-lg p-2" />
      <button type="submit" className="rounded-lg bg-teal-700 text-white p-2">Send link</button>
      {error && <p className="text-red-600">{error}</p>}
    </form>
  )
}
```

**Step 5: Run to verify pass**

Run: `npm run test -- src/auth/SignInScreen.test.tsx`
Expected: `1 passed`

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add one-time magic-link authentication"
```

---

## Task 12: Sync engine (push/pull, last-write-wins)

Given the personal (single-user, small-data) scope, the sync engine pushes every local row on each sync rather than tracking per-row dirty state — simpler, and irrelevant at this data volume (a few thousand rows at most). It pulls only rows changed since the last sync, and pulled rows always overwrite local (safe because the pull query itself is already filtered to "changed after last sync").

**Files:**
- Create: `src/sync/syncEngine.ts`, `src/sync/syncEngine.test.ts`

**Step 1: Write the failing test (using `transactions` as the reference table)**

`src/sync/syncEngine.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '../data/db'
import { syncAll, getLastSyncedAt } from './syncEngine'

const upsertMock = vi.fn().mockResolvedValue({ error: null })
const selectChain = {
  select: () => selectChain,
  gt: () => Promise.resolve({ data: [], error: null }),
}

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: vi.fn(() => ({ upsert: upsertMock, ...selectChain })),
  },
}))

describe('syncAll', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    localStorage.clear()
    upsertMock.mockClear()
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
})
```

**Step 2: Run to verify failure**

Run: `npm run test -- src/sync/syncEngine.test.ts`
Expected: FAIL — `Cannot find module './syncEngine'`

**Step 3: Implement**

`src/sync/syncEngine.ts`:
```ts
import { supabase } from '../lib/supabaseClient'
import { db } from '../data/db'
import type { Category, Transaction, Budget, RecurringRule } from '../data/db'

const LAST_SYNCED_KEY = 'budget-manager:lastSyncedAt'

export function getLastSyncedAt(): number {
  return Number(localStorage.getItem(LAST_SYNCED_KEY) ?? 0)
}

function setLastSyncedAt(value: number): void {
  localStorage.setItem(LAST_SYNCED_KEY, String(value))
}

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
const transactionToLocal = (r: Record<string, unknown>): Transaction => ({
  id: r.id as string, type: r.type as Transaction['type'], categoryId: r.category_id as string,
  amount: Number(r.amount), description: r.description as string, date: r.date as string, time: r.time as string,
  recurringRuleId: (r.recurring_rule_id as string) ?? undefined,
  createdAt: new Date(r.updated_at as string).getTime(), updatedAt: new Date(r.updated_at as string).getTime(),
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

export async function syncAll(): Promise<void> {
  const userId = await currentUserId()
  if (!userId) return

  const since = getLastSyncedAt()
  const startedAt = Date.now()

  const [categories, transactions, budgets, recurringRules] = await Promise.all([
    db.categories.toArray(), db.transactions.toArray(), db.budgets.toArray(), db.recurringRules.toArray(),
  ])

  await pushRows('categories', categories.map(categoryToRemote), userId)
  await pushRows('transactions', transactions.map(transactionToRemote), userId)
  await pushRows('budgets', budgets.map(budgetToRemote), userId)
  await pushRows('recurring_rules', recurringRules.map(ruleToRemote), userId)

  await pullRows('categories', since, categoryToLocal, (r) => db.categories.put(r))
  await pullRows('transactions', since, transactionToLocal, (r) => db.transactions.put(r))
  await pullRows('budgets', since, budgetToLocal, (r) => db.budgets.put(r))
  await pullRows('recurring_rules', since, ruleToLocal, (r) => db.recurringRules.put(r))

  setLastSyncedAt(startedAt)
}
```

**Step 4: Run to verify pass**

Run: `npm run test -- src/sync/syncEngine.test.ts`
Expected: `2 passed`

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Supabase sync engine for all four tables"
```

---

## Task 13: App shell — routing, layout, sync status, startup catch-up

**Files:**
- Modify: `src/App.tsx`, `src/main.tsx`
- Create: `src/AppShell.tsx`, `src/components/SyncStatus.tsx`

**Step 1: Install routing**

```bash
npm install react-router-dom
```

**Step 2: Wire providers in the entry point**

`src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
```

**Step 3: Sync status indicator**

`src/components/SyncStatus.tsx`:
```tsx
import { useEffect, useState } from 'react'

export function SyncStatus({ syncing }: { syncing: boolean }) {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  const label = !online ? 'Offline' : syncing ? 'Syncing…' : 'Synced'
  const color = !online ? 'bg-amber-500' : syncing ? 'bg-blue-500' : 'bg-emerald-500'

  return (
    <span className="flex items-center gap-1 text-xs text-slate-500">
      <span className={`h-2 w-2 rounded-full ${color}`} /> {label}
    </span>
  )
}
```

**Step 4: App shell with routes, startup seeding/catch-up/sync**

`src/App.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import { SignInScreen } from './auth/SignInScreen'
import { seedDefaultCategoriesIfEmpty } from './data/categories'
import { catchUpRecurringTransactions } from './data/recurring'
import { syncAll } from './sync/syncEngine'
import { todayDateString } from './utils/date'
import { SyncStatus } from './components/SyncStatus'
import { HomeScreen } from './screens/HomeScreen'
import { AddEditEntryScreen } from './screens/AddEditEntryScreen'
import { AnalyticsScreen } from './screens/AnalyticsScreen'
import { CategoriesBudgetsScreen } from './screens/CategoriesBudgetsScreen'

function App() {
  const { session, loading } = useAuth()
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (!session) return
    seedDefaultCategoriesIfEmpty()
      .then(() => catchUpRecurringTransactions(todayDateString()))
      .then(() => {
        setSyncing(true)
        return syncAll()
      })
      .finally(() => setSyncing(false))
  }, [session])

  if (loading) return null
  if (!session) return <SignInScreen />

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="flex items-center justify-between p-4 border-b">
        <nav className="flex gap-4 text-sm font-medium">
          <Link to="/">Home</Link>
          <Link to="/analytics">Analytics</Link>
          <Link to="/categories">Categories</Link>
        </nav>
        <SyncStatus syncing={syncing} />
      </header>
      <main className="p-4 max-w-lg mx-auto">
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/entry/new" element={<AddEditEntryScreen />} />
          <Route path="/entry/:id" element={<AddEditEntryScreen />} />
          <Route path="/analytics" element={<AnalyticsScreen />} />
          <Route path="/categories" element={<CategoriesBudgetsScreen />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
```

**Step 5: Verify**

```bash
npm run test
npm run build
```
Expected: existing tests still pass (the `App.test.tsx` smoke test will need updating in the next step since `App` now requires an `AuthProvider` ancestor and screens don't exist yet — see Step 6).

**Step 6: Update the smoke test to match the new shell**

`src/App.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import App from './App'

vi.mock('./auth/AuthProvider', () => ({
  useAuth: () => ({ session: null, loading: false }),
}))

describe('App', () => {
  it('shows the sign-in screen when there is no session', () => {
    render(<BrowserRouter><App /></BrowserRouter>)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })
})
```

Note: Tasks 14–16 create the `screens/` files this imports — until then, `npm run build` will fail on missing modules. That's expected; proceed to Task 14 immediately.

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: add app shell with routing, auth guard, and startup sync"
```

---

## Task 14: Home screen

**Files:**
- Create: `src/screens/HomeScreen.tsx`, `src/screens/HomeScreen.test.tsx`

**Step 1: Write the failing test**

`src/screens/HomeScreen.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { db } from '../data/db'
import { createTransaction } from '../data/transactions'
import { createCategory } from '../data/categories'
import { HomeScreen } from './HomeScreen'
import { todayDateString } from '../utils/date'

describe('HomeScreen', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    await db.categories.clear()
  })

  it('shows the running total for the current month', async () => {
    const category = await createCategory({ name: 'Food', color: '#f59e0b', type: 'expense' })
    await createTransaction({
      type: 'expense', categoryId: category.id, amount: 250, description: 'Lunch',
      date: todayDateString(), time: '13:00',
    })

    render(<BrowserRouter><HomeScreen /></BrowserRouter>)

    expect(await screen.findByText(/250/)).toBeInTheDocument()
  })
})
```

**Step 2: Run to verify failure**

Run: `npm run test -- src/screens/HomeScreen.test.tsx`
Expected: FAIL — `Cannot find module './HomeScreen'`

**Step 3: Implement**

`src/screens/HomeScreen.tsx`:
```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../data/db'
import { currentMonthString } from '../utils/date'

export function HomeScreen() {
  const month = currentMonthString()

  const transactions = useLiveQuery(
    () => db.transactions.where('date').startsWith(month).reverse().sortBy('date'),
    [month],
  )
  const categories = useLiveQuery(() => db.categories.toArray(), [])

  if (!transactions || !categories) return null

  const spent = transactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)
  const income = transactions.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Unknown'

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-100 p-3">
          <p className="text-xs text-slate-500">Spent</p>
          <p className="text-xl font-semibold">₹{spent.toFixed(0)}</p>
        </div>
        <div className="rounded-lg bg-slate-100 p-3">
          <p className="text-xs text-slate-500">Income</p>
          <p className="text-xl font-semibold">₹{income.toFixed(0)}</p>
        </div>
        <div className="rounded-lg bg-slate-100 p-3">
          <p className="text-xs text-slate-500">Net</p>
          <p className="text-xl font-semibold">₹{(income - spent).toFixed(0)}</p>
        </div>
      </section>

      <Link to="/entry/new" className="rounded-lg bg-teal-700 text-white text-center p-3 font-medium">
        + Add entry
      </Link>

      <ul className="flex flex-col gap-2">
        {transactions.map((t) => (
          <li key={t.id} className="flex justify-between rounded-lg border p-3">
            <span>{t.description || categoryName(t.categoryId)}</span>
            <span className={t.type === 'expense' ? 'text-red-600' : 'text-emerald-600'}>
              {t.type === 'expense' ? '-' : '+'}₹{t.amount.toFixed(0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

**Step 4: Run to verify pass**

Run: `npm run test -- src/screens/HomeScreen.test.tsx`
Expected: `1 passed`

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Home screen with monthly summary and recent entries"
```

---

## Task 15: Add/Edit Entry screen

**Files:**
- Create: `src/screens/AddEditEntryScreen.tsx`, `src/screens/AddEditEntryScreen.test.tsx`

**Step 1: Write the failing test**

`src/screens/AddEditEntryScreen.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../data/db'
import { createCategory } from '../data/categories'
import { AddEditEntryScreen } from './AddEditEntryScreen'

describe('AddEditEntryScreen', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    await db.categories.clear()
  })

  it('creates a transaction from the form', async () => {
    await createCategory({ name: 'Food', color: '#f59e0b', type: 'expense' })
    render(<MemoryRouter initialEntries={['/entry/new']}><AddEditEntryScreen /></MemoryRouter>)

    await userEvent.type(await screen.findByLabelText(/amount/i), '199')
    await userEvent.type(screen.getByLabelText(/description/i), 'Coffee')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    const saved = await db.transactions.toArray()
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ amount: 199, description: 'Coffee' })
  })
})
```

**Step 2: Run to verify failure**

Run: `npm run test -- src/screens/AddEditEntryScreen.test.tsx`
Expected: FAIL — `Cannot find module './AddEditEntryScreen'`

**Step 3: Implement**

`src/screens/AddEditEntryScreen.tsx`:
```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { createTransaction } from '../data/transactions'
import { createRecurringRule } from '../data/recurring'
import { todayDateString, nowTimeString } from '../utils/date'
import type { TransactionType } from '../data/db'

export function AddEditEntryScreen() {
  const navigate = useNavigate()
  const categories = useLiveQuery(() => db.categories.toArray(), [])

  const [type, setType] = useState<TransactionType>('expense')
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(todayDateString())
  const [time, setTime] = useState(nowTimeString())
  const [makeRecurring, setMakeRecurring] = useState(false)
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('monthly')

  const filteredCategories = categories?.filter((c) => c.type === type) ?? []
  const effectiveCategoryId = categoryId || filteredCategories[0]?.id || ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const numericAmount = Number(amount)

    await createTransaction({ type, categoryId: effectiveCategoryId, amount: numericAmount, description, date, time })

    if (makeRecurring) {
      const parsedDate = new Date(date + 'T00:00:00')
      await createRecurringRule({
        categoryId: effectiveCategoryId, amount: numericAmount, description, type, frequency,
        dayOfMonth: frequency === 'monthly' ? parsedDate.getDate() : undefined,
        dayOfWeek: frequency === 'weekly' ? parsedDate.getDay() : undefined,
        startDate: date,
      })
    }

    navigate('/')
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex gap-2">
        <button type="button" onClick={() => setType('expense')}
          className={`flex-1 rounded-lg p-2 ${type === 'expense' ? 'bg-red-600 text-white' : 'bg-slate-100'}`}>Expense</button>
        <button type="button" onClick={() => setType('income')}
          className={`flex-1 rounded-lg p-2 ${type === 'income' ? 'bg-emerald-600 text-white' : 'bg-slate-100'}`}>Income</button>
      </div>

      <label htmlFor="category">Category</label>
      <select id="category" value={effectiveCategoryId} onChange={(e) => setCategoryId(e.target.value)} className="border rounded-lg p-2">
        {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      <label htmlFor="amount">Amount</label>
      <input id="amount" type="number" inputMode="decimal" required value={amount}
        onChange={(e) => setAmount(e.target.value)} className="border rounded-lg p-2" />

      <label htmlFor="description">Description</label>
      <input id="description" type="text" value={description}
        onChange={(e) => setDescription(e.target.value)} className="border rounded-lg p-2" />

      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor="date">Date</label>
          <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded-lg p-2 w-full" />
        </div>
        <div className="flex-1">
          <label htmlFor="time">Time</label>
          <input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="border rounded-lg p-2 w-full" />
        </div>
      </div>

      <label className="flex items-center gap-2">
        <input type="checkbox" checked={makeRecurring} onChange={(e) => setMakeRecurring(e.target.checked)} />
        Make this recurring
      </label>

      {makeRecurring && (
        <select value={frequency} onChange={(e) => setFrequency(e.target.value as 'weekly' | 'monthly')} className="border rounded-lg p-2">
          <option value="monthly">Monthly</option>
          <option value="weekly">Weekly</option>
        </select>
      )}

      <button type="submit" className="rounded-lg bg-teal-700 text-white p-3 font-medium">Save</button>
    </form>
  )
}
```

**Step 4: Run to verify pass**

Run: `npm run test -- src/screens/AddEditEntryScreen.test.tsx`
Expected: `1 passed`

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Add/Edit Entry screen with recurring toggle"
```

---

## Task 16: Categories & Budgets screen

**Files:**
- Create: `src/screens/CategoriesBudgetsScreen.tsx`, `src/screens/CategoriesBudgetsScreen.test.tsx`

**Step 1: Write the failing test**

`src/screens/CategoriesBudgetsScreen.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../data/db'
import { createCategory } from '../data/categories'
import { currentMonthString } from '../utils/date'
import { CategoriesBudgetsScreen } from './CategoriesBudgetsScreen'

describe('CategoriesBudgetsScreen', () => {
  beforeEach(async () => {
    await db.categories.clear()
    await db.budgets.clear()
  })

  it('sets a monthly budget limit for a category', async () => {
    const category = await createCategory({ name: 'Food', color: '#f59e0b', type: 'expense' })
    render(<CategoriesBudgetsScreen />)

    const input = await screen.findByLabelText(new RegExp(category.name, 'i'))
    await userEvent.clear(input)
    await userEvent.type(input, '8000')
    await userEvent.tab() // blur to trigger save

    const budgets = await db.budgets.where('month').equals(currentMonthString()).toArray()
    expect(budgets).toHaveLength(1)
    expect(budgets[0].limitAmount).toBe(8000)
  })
})
```

**Step 2: Run to verify failure**

Run: `npm run test -- src/screens/CategoriesBudgetsScreen.test.tsx`
Expected: FAIL — `Cannot find module './CategoriesBudgetsScreen'`

**Step 3: Implement**

`src/screens/CategoriesBudgetsScreen.tsx`:
```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { setBudgetLimit } from '../data/budgets'
import { currentMonthString } from '../utils/date'

export function CategoriesBudgetsScreen() {
  const month = currentMonthString()
  const categories = useLiveQuery(() => db.categories.where('type').equals('expense').toArray(), [])
  const budgets = useLiveQuery(() => db.budgets.where('month').equals(month).toArray(), [month])

  if (!categories || !budgets) return null

  const limitFor = (categoryId: string) => budgets.find((b) => b.categoryId === categoryId)?.limitAmount ?? ''

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-lg font-semibold">Monthly Budgets</h1>
      {categories.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-2">
          <label htmlFor={`budget-${c.id}`}>{c.name}</label>
          <input
            id={`budget-${c.id}`}
            aria-label={c.name}
            type="number"
            defaultValue={limitFor(c.id)}
            onBlur={(e) => {
              const value = Number(e.target.value)
              if (!Number.isNaN(value) && value >= 0) setBudgetLimit(c.id, month, value)
            }}
            className="border rounded-lg p-2 w-28"
          />
        </div>
      ))}
    </div>
  )
}
```

**Step 4: Run to verify pass**

Run: `npm run test -- src/screens/CategoriesBudgetsScreen.test.tsx`
Expected: `1 passed`

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Categories & Budgets screen"
```

---

## Task 17: Analytics aggregation functions

**Files:**
- Create: `src/data/analytics.ts`, `src/data/analytics.test.ts`

**Step 1: Write the failing tests**

`src/data/analytics.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { createCategory } from './categories'
import { createTransaction } from './transactions'
import { setBudgetLimit } from './budgets'
import { getCategoryBreakdown, getMonthlyTrend, getBudgetVsActual, getMonthComparison } from './analytics'

describe('analytics', () => {
  beforeEach(async () => {
    await db.categories.clear()
    await db.transactions.clear()
    await db.budgets.clear()
  })

  it('breaks spending down by category for a month', async () => {
    const food = await createCategory({ name: 'Food', color: '#f59e0b', type: 'expense' })
    const rent = await createCategory({ name: 'Rent', color: '#ef4444', type: 'expense' })
    await createTransaction({ type: 'expense', categoryId: food.id, amount: 300, description: '', date: '2026-07-01', time: '09:00' })
    await createTransaction({ type: 'expense', categoryId: food.id, amount: 200, description: '', date: '2026-07-15', time: '09:00' })
    await createTransaction({ type: 'expense', categoryId: rent.id, amount: 15000, description: '', date: '2026-07-01', time: '09:00' })

    const breakdown = await getCategoryBreakdown('2026-07', 'expense')

    expect(breakdown).toEqual(expect.arrayContaining([
      expect.objectContaining({ categoryId: food.id, total: 500 }),
      expect.objectContaining({ categoryId: rent.id, total: 15000 }),
    ]))
  })

  it('produces a monthly trend of totals', async () => {
    const food = await createCategory({ name: 'Food', color: '#f59e0b', type: 'expense' })
    await createTransaction({ type: 'expense', categoryId: food.id, amount: 100, description: '', date: '2026-06-01', time: '09:00' })
    await createTransaction({ type: 'expense', categoryId: food.id, amount: 200, description: '', date: '2026-07-01', time: '09:00' })

    const trend = await getMonthlyTrend(['2026-06', '2026-07'])
    expect(trend).toEqual([
      { month: '2026-06', expenseTotal: 100, incomeTotal: 0 },
      { month: '2026-07', expenseTotal: 200, incomeTotal: 0 },
    ])
  })

  it('compares budget limit against actual spend', async () => {
    const food = await createCategory({ name: 'Food', color: '#f59e0b', type: 'expense' })
    await setBudgetLimit(food.id, '2026-07', 1000)
    await createTransaction({ type: 'expense', categoryId: food.id, amount: 400, description: '', date: '2026-07-05', time: '09:00' })

    const result = await getBudgetVsActual('2026-07')
    expect(result).toEqual([
      expect.objectContaining({ categoryId: food.id, limitAmount: 1000, spent: 400, remaining: 600 }),
    ])
  })

  it('compares totals between two months', async () => {
    const food = await createCategory({ name: 'Food', color: '#f59e0b', type: 'expense' })
    await createTransaction({ type: 'expense', categoryId: food.id, amount: 100, description: '', date: '2026-06-01', time: '09:00' })
    await createTransaction({ type: 'expense', categoryId: food.id, amount: 150, description: '', date: '2026-07-01', time: '09:00' })

    const comparison = await getMonthComparison('2026-06', '2026-07')
    expect(comparison).toEqual([
      expect.objectContaining({ categoryId: food.id, amountA: 100, amountB: 150 }),
    ])
  })
})
```

**Step 2: Run to verify failure**

Run: `npm run test -- src/data/analytics.test.ts`
Expected: FAIL — `Cannot find module './analytics'`

**Step 3: Implement**

`src/data/analytics.ts`:
```ts
import { db } from './db'
import { listTransactionsForMonth } from './transactions'
import { listBudgetsForMonth } from './budgets'

export interface CategoryTotal {
  categoryId: string
  categoryName: string
  color: string
  total: number
}

export async function getCategoryBreakdown(month: string, type: 'expense' | 'income'): Promise<CategoryTotal[]> {
  const [transactions, categories] = await Promise.all([listTransactionsForMonth(month), db.categories.toArray()])
  const totals = new Map<string, number>()
  for (const t of transactions) {
    if (t.type !== type) continue
    totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + t.amount)
  }
  return [...totals.entries()].map(([categoryId, total]) => {
    const category = categories.find((c) => c.id === categoryId)
    return { categoryId, categoryName: category?.name ?? 'Unknown', color: category?.color ?? '#94a3b8', total }
  })
}

export interface MonthlyTotal {
  month: string
  expenseTotal: number
  incomeTotal: number
}

export async function getMonthlyTrend(months: string[]): Promise<MonthlyTotal[]> {
  const result: MonthlyTotal[] = []
  for (const month of months) {
    const transactions = await listTransactionsForMonth(month)
    result.push({
      month,
      expenseTotal: transactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0),
      incomeTotal: transactions.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
    })
  }
  return result
}

export interface BudgetVsActual {
  categoryId: string
  categoryName: string
  limitAmount: number
  spent: number
  remaining: number
}

export async function getBudgetVsActual(month: string): Promise<BudgetVsActual[]> {
  const [budgets, categories, breakdown] = await Promise.all([
    listBudgetsForMonth(month), db.categories.toArray(), getCategoryBreakdown(month, 'expense'),
  ])
  return budgets.map((b) => {
    const category = categories.find((c) => c.id === b.categoryId)
    const spent = breakdown.find((row) => row.categoryId === b.categoryId)?.total ?? 0
    return {
      categoryId: b.categoryId, categoryName: category?.name ?? 'Unknown',
      limitAmount: b.limitAmount, spent, remaining: b.limitAmount - spent,
    }
  })
}

export interface MonthComparisonRow {
  categoryId: string
  categoryName: string
  amountA: number
  amountB: number
  delta: number
}

export async function getMonthComparison(monthA: string, monthB: string): Promise<MonthComparisonRow[]> {
  const [breakdownA, breakdownB, categories] = await Promise.all([
    getCategoryBreakdown(monthA, 'expense'), getCategoryBreakdown(monthB, 'expense'), db.categories.toArray(),
  ])
  const categoryIds = new Set([...breakdownA.map((r) => r.categoryId), ...breakdownB.map((r) => r.categoryId)])
  return [...categoryIds].map((categoryId) => {
    const amountA = breakdownA.find((r) => r.categoryId === categoryId)?.total ?? 0
    const amountB = breakdownB.find((r) => r.categoryId === categoryId)?.total ?? 0
    return {
      categoryId, categoryName: categories.find((c) => c.id === categoryId)?.name ?? 'Unknown',
      amountA, amountB, delta: amountB - amountA,
    }
  })
}
```

**Step 4: Run to verify pass**

Run: `npm run test -- src/data/analytics.test.ts`
Expected: `4 passed`

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add analytics aggregation functions"
```

---

## Task 18: Analytics screen (charts)

**Files:**
- Create: `src/screens/AnalyticsScreen.tsx`

**Step 1: Install charting library**

```bash
npm install recharts
```

**Step 2: Implement (no new unit tests — this screen is a thin visual wrapper over the already-tested aggregation functions in Task 17; verify by manual check in Step 3 instead)**

`src/screens/AnalyticsScreen.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { getCategoryBreakdown, getMonthlyTrend, getBudgetVsActual, getMonthComparison } from '../data/analytics'
import type { CategoryTotal, MonthlyTotal, BudgetVsActual, MonthComparisonRow } from '../data/analytics'
import { currentMonthString } from '../utils/date'

function lastNMonths(n: number, endMonth: string): string[] {
  const [y, m] = endMonth.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 - (n - 1 - i), 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}

export function AnalyticsScreen() {
  const month = currentMonthString()
  const [breakdown, setBreakdown] = useState<CategoryTotal[]>([])
  const [trend, setTrend] = useState<MonthlyTotal[]>([])
  const [budgetVsActual, setBudgetVsActual] = useState<BudgetVsActual[]>([])
  const [comparison, setComparison] = useState<MonthComparisonRow[]>([])

  useEffect(() => {
    const months = lastNMonths(6, month)
    const previousMonth = months[months.length - 2]
    getCategoryBreakdown(month, 'expense').then(setBreakdown)
    getMonthlyTrend(months).then(setTrend)
    getBudgetVsActual(month).then(setBudgetVsActual)
    getMonthComparison(previousMonth, month).then(setComparison)
  }, [month])

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="font-semibold mb-2">Spending by category</h2>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={breakdown} dataKey="total" nameKey="categoryName" outerRadius={80}>
              {breakdown.map((c) => <Cell key={c.categoryId} fill={c.color} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Trend (last 6 months)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trend}>
            <XAxis dataKey="month" /><YAxis /><Tooltip />
            <Line type="monotone" dataKey="expenseTotal" stroke="#ef4444" name="Expenses" />
            <Line type="monotone" dataKey="incomeTotal" stroke="#059669" name="Income" />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Budget vs actual</h2>
        <ul className="flex flex-col gap-2">
          {budgetVsActual.map((row) => (
            <li key={row.categoryId}>
              <div className="flex justify-between text-sm"><span>{row.categoryName}</span><span>₹{row.spent} / ₹{row.limitAmount}</span></div>
              <div className="h-2 rounded bg-slate-100">
                <div className="h-2 rounded bg-teal-600" style={{ width: `${Math.min(100, (row.spent / row.limitAmount) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-semibold mb-2">This month vs last month</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={comparison}>
            <XAxis dataKey="categoryName" /><YAxis /><Tooltip />
            <Bar dataKey="amountA" fill="#94a3b8" name="Last month" />
            <Bar dataKey="amountB" fill="#0f766e" name="This month" />
          </BarChart>
        </ResponsiveContainer>
      </section>
    </div>
  )
}
```

**Step 3: Manual verify**

```bash
npm run dev
```
Open the printed local URL, sign in, add a couple of entries across two categories, visit `/analytics`, and confirm all four sections render without console errors.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add Analytics screen with four chart views"
```

---

## Task 19: Final PWA + offline manual QA pass

No new code — this is a manual verification checklist before shipping v1.

**Step 1:** `npm run build && npm run preview`, open the preview URL on your iPhone (same Wi-Fi network, or use a tunnel like `ngrok`).

**Step 2:** In Safari, tap Share → "Add to Home Screen." Confirm the app icon and name appear correctly and it opens full-screen (no Safari chrome).

**Step 3:** With the app open, turn on Airplane Mode. Add a new entry. Confirm it saves and appears in the Home list (local-first write working).

**Step 4:** Turn Airplane Mode back off. Confirm the sync status indicator moves from "Offline" to "Syncing…" to "Synced," and check the Supabase table editor to confirm the offline entry appears remotely.

**Step 5:** On a laptop browser, open the deployed preview URL, sign in via magic link, and confirm the entry made on the iPhone appears there too.

**Step 6:** Commit only if this step required any bug-fix code changes; otherwise no commit needed.

---

## Task 20: Deploy

**Files:** none (deployment configuration only)

**Step 1:** Push the branch and open a PR (or merge locally if working solo):
```bash
git push -u origin feature/v1-manual-entry
```

**Step 2:** Create a new project on vercel.com (or Cloudflare Pages), pointing at this repo, framework preset "Vite."

**Step 3:** Add the two environment variables from `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in the hosting provider's project settings.

**Step 4:** Deploy, then repeat the Task 19 QA pass against the real production URL (not just the local preview) — magic-link emails need a real reachable URL for the redirect to work correctly.

**Step 5:** Merge `feature/v1-manual-entry` into `main`.

---

## Out of Scope (confirmed in design doc)

- AI/voice entry
- Multiple accounts/payment methods
- Per-rule auto-post vs. confirm choice
