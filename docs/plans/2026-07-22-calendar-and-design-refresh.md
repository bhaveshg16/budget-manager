# Calendar View & Design Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add a Calendar tab with a daily/monthly expenses heatmap, and reskin the app with an adaptive light+dark design system fronted by a bottom tab bar.

**Architecture:** Introduce a semantic CSS-variable token layer (Tailwind v4 `@theme` + `prefers-color-scheme`) so both themes are first-class; convert the top text nav into a fixed bottom tab bar with a center "+"; add two read-only Dexie aggregations that feed an emerald heatmap Calendar screen with day/year zoom levels and a per-day bottom sheet. No schema, sync, auth, or recurring-rule changes.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, Dexie (IndexedDB) + dexie-react-hooks, react-router-dom v7, Recharts, vitest + @testing-library/react + fake-indexeddb.

**Reference the design:** `docs/plans/2026-07-22-calendar-and-design-refresh-design.md`

**Conventions in this codebase:**
- Currency rendered as `₹{n.toFixed(0)}`.
- Dates are `YYYY-MM-DD` strings; months are `YYYY-MM` strings (see `src/utils/date.ts`).
- Tests colocated as `*.test.ts(x)` next to source; data tests use `fake-indexeddb` (already wired in `src/test/setup.ts`).
- Run a single test file: `npx vitest run <path>`. Run all: `npm test`. Lint: `npm run lint`. Build: `npm run build`.

---

### Task 1: Date grid helpers

**Files:**
- Modify: `src/utils/date.ts`
- Test: `src/utils/date.test.ts` (create)

**Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { monthGridDays, addMonths, monthLabel, yearMonths, dayOfMonth } from './date'

describe('date grid helpers', () => {
  it('monthGridDays pads to full weeks, Monday-first', () => {
    // July 2026: 1st is a Wednesday -> 2 leading blanks (Mon, Tue)
    const cells = monthGridDays('2026-07')
    expect(cells.length % 7).toBe(0)
    expect(cells.slice(0, 2)).toEqual([null, null])
    expect(cells[2]).toBe('2026-07-01')
    expect(cells).toContain('2026-07-31')
    expect(cells.filter((c) => c !== null)).toHaveLength(31)
  })

  it('addMonths crosses year boundaries', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })

  it('monthLabel is human readable', () => {
    expect(monthLabel('2026-07')).toBe('July 2026')
  })

  it('yearMonths returns 12 padded months', () => {
    const months = yearMonths(2026)
    expect(months).toHaveLength(12)
    expect(months[0]).toBe('2026-01')
    expect(months[11]).toBe('2026-12')
  })

  it('dayOfMonth extracts the day number', () => {
    expect(dayOfMonth('2026-07-09')).toBe(9)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/date.test.ts`
Expected: FAIL — helpers not exported.

**Step 3: Add the implementation to `src/utils/date.ts`**

```ts
// Days to render for a month grid, Monday-first. Leading/trailing padding are null.
export function monthGridDays(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const daysInMonth = new Date(y, m, 0).getDate()
  // JS getDay(): 0=Sun..6=Sat. Convert to Monday-first: 0=Mon..6=Sun.
  const leading = (first.getDay() + 6) % 7
  const cells: (string | null)[] = []
  for (let i = 0; i < leading; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function yearMonths(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
}

export function dayOfMonth(dateString: string): number {
  return Number(dateString.slice(8, 10))
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/date.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/date.ts src/utils/date.test.ts
git commit -m "feat: add month-grid date helpers for calendar"
```

---

### Task 2: Heatmap level helper

**Files:**
- Create: `src/utils/heat.ts`
- Test: `src/utils/heat.test.ts` (create)

**Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { heatLevel } from './heat'

describe('heatLevel', () => {
  it('is 0 for no spend or no max', () => {
    expect(heatLevel(0, 1000)).toBe(0)
    expect(heatLevel(500, 0)).toBe(0)
  })
  it('scales 1..5 relative to the max', () => {
    expect(heatLevel(1000, 1000)).toBe(5)
    expect(heatLevel(1, 1000)).toBe(1)
    expect(heatLevel(600, 1000)).toBe(3)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/heat.test.ts`
Expected: FAIL — module not found.

**Step 3: Write `src/utils/heat.ts`**

```ts
// Bucket a value into a 0..5 heat level, normalized against the visible max.
// 0 = no spend (rendered bare); 1..5 = increasing intensity.
export function heatLevel(value: number, max: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (value <= 0 || max <= 0) return 0
  return Math.min(5, Math.ceil((value / max) * 5)) as 1 | 2 | 3 | 4 | 5
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/heat.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/heat.ts src/utils/heat.test.ts
git commit -m "feat: add heatLevel helper for calendar tinting"
```

---

### Task 3: Calendar data aggregations

**Files:**
- Modify: `src/data/transactions.ts` (add `listTransactionsForDate`)
- Modify: `src/data/analytics.ts` (add `spendByDayForMonth`, `spendByMonthForYear`)
- Test: `src/data/analytics.test.ts` (append cases)

**Step 1: Write the failing tests** — append to `src/data/analytics.test.ts`

```ts
import { spendByDayForMonth, spendByMonthForYear } from './analytics'
import { listTransactionsForDate } from './transactions'
import { createTransaction } from './transactions'
import { db } from './db'

describe('calendar aggregations', () => {
  beforeEach(async () => {
    await db.transactions.clear()
  })

  it('spendByDayForMonth sums expenses per day and excludes income', async () => {
    await createTransaction({ type: 'expense', categoryId: 'c1', amount: 100, description: '', date: '2026-07-09', time: '10:00' })
    await createTransaction({ type: 'expense', categoryId: 'c1', amount: 50, description: '', date: '2026-07-09', time: '11:00' })
    await createTransaction({ type: 'income', categoryId: 'c2', amount: 9999, description: '', date: '2026-07-09', time: '12:00' })
    await createTransaction({ type: 'expense', categoryId: 'c1', amount: 200, description: '', date: '2026-08-01', time: '10:00' })

    const map = await spendByDayForMonth('2026-07')
    expect(map.get('2026-07-09')).toBe(150)
    expect(map.has('2026-08-01')).toBe(false)
  })

  it('spendByMonthForYear sums expenses per month, expenses only', async () => {
    await createTransaction({ type: 'expense', categoryId: 'c1', amount: 300, description: '', date: '2026-03-15', time: '10:00' })
    await createTransaction({ type: 'income', categoryId: 'c2', amount: 5000, description: '', date: '2026-03-16', time: '10:00' })
    await createTransaction({ type: 'expense', categoryId: 'c1', amount: 700, description: '', date: '2026-07-01', time: '10:00' })

    const map = await spendByMonthForYear(2026)
    expect(map.get('2026-03')).toBe(300)
    expect(map.get('2026-07')).toBe(700)
    expect(map.has('2026-01')).toBe(false) // empty months omitted
  })

  it('listTransactionsForDate returns only that date', async () => {
    await createTransaction({ type: 'expense', categoryId: 'c1', amount: 10, description: '', date: '2026-07-09', time: '10:00' })
    await createTransaction({ type: 'expense', categoryId: 'c1', amount: 20, description: '', date: '2026-07-10', time: '10:00' })
    const rows = await listTransactionsForDate('2026-07-09')
    expect(rows).toHaveLength(1)
    expect(rows[0].amount).toBe(10)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/analytics.test.ts`
Expected: FAIL — functions not exported.

**Step 3: Implement**

Append to `src/data/transactions.ts`:

```ts
export async function listTransactionsForDate(date: string): Promise<Transaction[]> {
  return db.transactions.where('date').equals(date).toArray()
}
```

Append to `src/data/analytics.ts` (add `import { yearMonths } from '../utils/date'` at top):

```ts
export async function spendByDayForMonth(month: string): Promise<Map<string, number>> {
  const transactions = await listTransactionsForMonth(month)
  const map = new Map<string, number>()
  for (const t of transactions) {
    if (t.type !== 'expense') continue
    map.set(t.date, (map.get(t.date) ?? 0) + t.amount)
  }
  return map
}

export async function spendByMonthForYear(year: number): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  for (const month of yearMonths(year)) {
    const transactions = await listTransactionsForMonth(month)
    const total = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    if (total > 0) map.set(month, total)
  }
  return map
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/analytics.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/data/transactions.ts src/data/analytics.ts src/data/analytics.test.ts
git commit -m "feat: add calendar spend aggregations (per-day, per-month)"
```

---

### Task 4: Design token layer (light + dark)

**Files:**
- Modify: `src/index.css`
- Modify: `index.html` (add `color-scheme` meta)

No unit test — verified by build + visual. The reskin tasks depend on these tokens existing.

**Step 1: Replace `src/index.css` contents**

```css
@import "tailwindcss";

@theme {
  --color-bg: #faf9f7;
  --color-surface: #ffffff;
  --color-text: #0f172a;
  --color-muted: #64748b;
  --color-border: #e7e5e0;
  --color-accent: #10b981;
  --color-heat-1: #d1fae5;
  --color-heat-2: #a7f3d0;
  --color-heat-3: #6ee7b7;
  --color-heat-4: #34d399;
  --color-heat-5: #10b981;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #0f1211;
    --color-surface: #191d1b;
    --color-text: #f1f5f9;
    --color-muted: #94a3b8;
    --color-border: #2a302d;
    --color-accent: #34d399;
    --color-heat-1: #123528;
    --color-heat-2: #14503a;
    --color-heat-3: #15694b;
    --color-heat-4: #10b981;
    --color-heat-5: #34d399;
  }
}

body {
  background-color: var(--color-bg);
  color: var(--color-text);
}
```

This generates the utilities the reskin uses: `bg-bg`, `bg-surface`, `text-text`, `text-muted`, `border-border`, `bg-accent`, `text-accent`, and `bg-heat-1`…`bg-heat-5`.

**Step 2: Add to `index.html` `<head>`**

```html
<meta name="color-scheme" content="light dark" />
```

**Step 3: Verify build**

Run: `npm run build`
Expected: succeeds with no CSS/utility errors.

**Step 4: Commit**

```bash
git add src/index.css index.html
git commit -m "feat: add adaptive light/dark design token layer"
```

---

### Task 5: Bottom tab bar navigation shell

**Files:**
- Create: `src/components/BottomNav.tsx`
- Modify: `src/App.tsx`
- Test: `src/components/BottomNav.test.tsx` (create)

**Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { BottomNav } from './BottomNav'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>,
  )
}

describe('BottomNav', () => {
  it('renders all tabs and the add button', () => {
    renderAt('/')
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /calendar/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /analytics/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /categories/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /add entry/i })).toHaveAttribute('href', '/entry/new')
  })

  it('marks the active tab with aria-current', () => {
    renderAt('/calendar')
    expect(screen.getByRole('link', { name: /calendar/i })).toHaveAttribute('aria-current', 'page')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/BottomNav.test.tsx`
Expected: FAIL — module not found.

**Step 3: Write `src/components/BottomNav.tsx`**

```tsx
import { NavLink } from 'react-router-dom'

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${isActive ? 'text-accent' : 'text-muted'}`

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex items-center border-t border-border bg-surface">
      <NavLink to="/" end className={tabClass} aria-label="Home">
        <span aria-hidden>🏠</span>Home
      </NavLink>
      <NavLink to="/calendar" className={tabClass} aria-label="Calendar">
        <span aria-hidden>📅</span>Calendar
      </NavLink>
      <NavLink to="/entry/new" aria-label="Add entry"
        className="mx-1 -mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl text-white shadow-lg">
        +
      </NavLink>
      <NavLink to="/analytics" className={tabClass} aria-label="Analytics">
        <span aria-hidden>📊</span>Analytics
      </NavLink>
      <NavLink to="/categories" className={tabClass} aria-label="Categories">
        <span aria-hidden>🏷️</span>Categories
      </NavLink>
    </nav>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/BottomNav.test.tsx`
Expected: PASS

**Step 5: Rewire `src/App.tsx`**

Replace the returned JSX (the `<div className="min-h-screen ...">` block) with the bottom-nav layout. Add `import { BottomNav } from './components/BottomNav'` and add the Calendar route. The header shrinks to just the sync indicator; the bottom nav owns navigation. Content gets bottom padding so it clears the fixed nav.

```tsx
  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="flex items-center justify-end p-3">
        <SyncStatus syncing={syncing} />
      </header>
      <main className="mx-auto max-w-lg px-4 pb-24">
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/calendar" element={<CalendarScreen />} />
          <Route path="/entry/new" element={<AddEditEntryScreen />} />
          <Route path="/entry/:id" element={<AddEditEntryScreen />} />
          <Route path="/analytics" element={<AnalyticsScreen />} />
          <Route path="/categories" element={<CategoriesBudgetsScreen />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
```

Add the import near the other screen imports:

```tsx
import { CalendarScreen } from './screens/CalendarScreen'
```

> NOTE: `CalendarScreen` does not exist yet — Task 6 creates it. If you want App.tsx to compile before Task 6, add a temporary placeholder `export function CalendarScreen() { return null }`; otherwise sequence Task 6 before running the app. Either way, `App.test.tsx` should still pass after Task 6.

Also remove the now-unused `Link` import from `App.tsx` if it is no longer referenced.

**Step 6: Run the existing app test**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS (adjust the test if it asserted the old top-nav links; update those assertions to match the bottom nav).

**Step 7: Commit**

```bash
git add src/components/BottomNav.tsx src/components/BottomNav.test.tsx src/App.tsx
git commit -m "feat: replace top nav with bottom tab bar + center add button"
```

---

### Task 6: Calendar screen — day view heatmap

**Files:**
- Create: `src/screens/CalendarScreen.tsx`
- Test: `src/screens/CalendarScreen.test.tsx` (create)

**Step 1: Write the failing test**

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach } from 'vitest'
import { CalendarScreen } from './CalendarScreen'
import { db } from '../data/db'
import { createTransaction } from '../data/transactions'
import { currentMonthString } from '../utils/date'

function renderCalendar() {
  return render(<MemoryRouter><CalendarScreen /></MemoryRouter>)
}

describe('CalendarScreen day view', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    await db.categories.clear()
  })

  it('renders the current month label and weekday headers', async () => {
    renderCalendar()
    await waitFor(() => expect(screen.getByTestId('calendar-title')).toBeInTheDocument())
    expect(screen.getAllByText('M').length).toBeGreaterThan(0)
  })

  it('tints the busiest day at the highest heat level', async () => {
    const month = currentMonthString()
    await createTransaction({ type: 'expense', categoryId: 'c1', amount: 5000, description: '', date: `${month}-15`, time: '10:00' })
    await createTransaction({ type: 'expense', categoryId: 'c1', amount: 100, description: '', date: `${month}-16`, time: '10:00' })
    renderCalendar()
    await waitFor(() => expect(screen.getByTestId(`day-${month}-15`)).toHaveClass('bg-heat-5'))
    expect(screen.getByTestId(`day-${month}-16`)).toHaveClass('bg-heat-1')
  })

  it('navigates to the previous month when ‹ is pressed', async () => {
    renderCalendar()
    const title = await screen.findByTestId('calendar-title')
    const initial = title.textContent
    await userEvent.click(screen.getByRole('button', { name: /previous month/i }))
    await waitFor(() => expect(screen.getByTestId('calendar-title').textContent).not.toBe(initial))
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/screens/CalendarScreen.test.tsx`
Expected: FAIL — module not found.

**Step 3: Write `src/screens/CalendarScreen.tsx`** (day view only; year view + sheet added in Tasks 7–8)

```tsx
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { spendByDayForMonth } from '../data/analytics'
import { monthGridDays, monthLabel, addMonths, dayOfMonth, currentMonthString } from '../utils/date'
import { heatLevel } from '../utils/heat'

const HEAT_BG = ['bg-transparent', 'bg-heat-1', 'bg-heat-2', 'bg-heat-3', 'bg-heat-4', 'bg-heat-5']
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export function CalendarScreen() {
  const [month, setMonth] = useState(currentMonthString())
  const dayTotals = useLiveQuery(() => spendByDayForMonth(month), [month])

  if (!dayTotals) return null

  const cells = monthGridDays(month)
  const max = Math.max(0, ...dayTotals.values())
  const monthSpent = [...dayTotals.values()].reduce((s, v) => s + v, 0)

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <button aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}
          className="rounded-lg px-3 py-1 text-muted">‹</button>
        <div className="text-center">
          <p data-testid="calendar-title" className="text-lg font-semibold">{monthLabel(month)}</p>
          <p className="text-sm text-muted">Spent ₹{monthSpent.toFixed(0)}</p>
        </div>
        <button aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}
          className="rounded-lg px-3 py-1 text-muted">›</button>
      </header>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
        {WEEKDAYS.map((d, i) => <div key={i}>{d}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />
          const spent = dayTotals.get(date) ?? 0
          const level = heatLevel(spent, max)
          return (
            <div key={i} data-testid={`day-${date}`}
              className={`flex aspect-square flex-col items-center justify-center rounded-lg border border-border text-xs ${HEAT_BG[level]}`}>
              <span className="text-text">{dayOfMonth(date)}</span>
              {spent > 0 && <span className="text-[10px] text-muted">{spent.toFixed(0)}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/screens/CalendarScreen.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/screens/CalendarScreen.tsx src/screens/CalendarScreen.test.tsx
git commit -m "feat: add calendar day-view heatmap screen"
```

---

### Task 7: Calendar screen — year view (zoom out/in)

**Files:**
- Modify: `src/screens/CalendarScreen.tsx`
- Test: `src/screens/CalendarScreen.test.tsx` (append)

**Step 1: Append failing tests**

```tsx
describe('CalendarScreen year view', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    await db.categories.clear()
  })

  it('zooms out to a 12-month grid when the title is tapped, then back in', async () => {
    renderCalendar()
    await userEvent.click(await screen.findByTestId('calendar-title'))
    await waitFor(() => expect(screen.getByTestId('year-title')).toBeInTheDocument())
    // 12 month cells present
    expect(screen.getByTestId('month-01')).toBeInTheDocument()
    expect(screen.getByTestId('month-12')).toBeInTheDocument()
    // zoom back into a month
    await userEvent.click(screen.getByTestId('month-03'))
    await waitFor(() => expect(screen.getByTestId('calendar-title')).toBeInTheDocument())
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/screens/CalendarScreen.test.tsx`
Expected: FAIL — no year view.

**Step 3: Modify `CalendarScreen.tsx`**

Add imports:

```tsx
import { spendByMonthForYear } from '../data/analytics'
import { yearMonths } from '../utils/date'
```

Add view + year state and the year query at the top of the component:

```tsx
  const [view, setView] = useState<'month' | 'year'>('month')
  const year = Number(month.slice(0, 4))
  const monthTotals = useLiveQuery(() => spendByMonthForYear(year), [year])
```

Make the day-view title a button that zooms out:

```tsx
        <button data-testid="calendar-title" onClick={() => setView('year')} className="text-lg font-semibold">
          {monthLabel(month)}
        </button>
```
(Keep the "Spent …" line beneath it as before.)

Add the year-view render near the top of the component, before the day-view `return` (guard on `monthTotals`):

```tsx
  if (view === 'year') {
    if (!monthTotals) return null
    const months = yearMonths(year)
    const yearMax = Math.max(0, ...monthTotals.values())
    const yearSpent = [...monthTotals.values()].reduce((s, v) => s + v, 0)
    return (
      <div className="flex flex-col gap-4">
        <header className="flex items-center justify-between">
          <button aria-label="Previous year" onClick={() => setMonth(addMonths(month, -12))}
            className="rounded-lg px-3 py-1 text-muted">‹</button>
          <div className="text-center">
            <p data-testid="year-title" className="text-lg font-semibold">{year}</p>
            <p className="text-sm text-muted">Spent ₹{yearSpent.toFixed(0)}</p>
          </div>
          <button aria-label="Next year" onClick={() => setMonth(addMonths(month, 12))}
            className="rounded-lg px-3 py-1 text-muted">›</button>
        </header>
        <div className="grid grid-cols-3 gap-2">
          {months.map((m) => {
            const spent = monthTotals.get(m) ?? 0
            const level = heatLevel(spent, yearMax)
            return (
              <button key={m} data-testid={`month-${m.slice(5)}`}
                onClick={() => { setMonth(m); setView('month') }}
                className={`flex aspect-square flex-col items-center justify-center rounded-xl border border-border ${HEAT_BG[level]}`}>
                <span className="text-sm text-text">{monthLabel(m).split(' ')[0].slice(0, 3)}</span>
                {spent > 0 && <span className="text-xs text-muted">{spent.toFixed(0)}</span>}
              </button>
            )
          })}
        </div>
      </div>
    )
  }
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/screens/CalendarScreen.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/screens/CalendarScreen.tsx src/screens/CalendarScreen.test.tsx
git commit -m "feat: add calendar year-view zoom out/in"
```

---

### Task 8: Day bottom sheet + add-to-day

**Files:**
- Create: `src/components/DaySheet.tsx`
- Modify: `src/screens/CalendarScreen.tsx` (open sheet on day tap)
- Modify: `src/screens/AddEditEntryScreen.tsx` (accept `?date=` prefill)
- Test: `src/components/DaySheet.test.tsx` (create)
- Test: `src/screens/AddEditEntryScreen.test.tsx` (append prefill case)

**Step 1: Write the failing tests**

`src/components/DaySheet.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DaySheet } from './DaySheet'
import { db } from '../data/db'
import { createTransaction } from '../data/transactions'

describe('DaySheet', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    await db.categories.clear()
  })

  it('shows the day total and its transactions', async () => {
    await createTransaction({ type: 'expense', categoryId: 'c1', amount: 420, description: 'Lunch', date: '2026-07-09', time: '13:00' })
    render(<MemoryRouter><DaySheet date="2026-07-09" onClose={() => {}} /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Lunch')).toBeInTheDocument())
    expect(screen.getByText(/2026-07-09/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add to this day/i })).toBeInTheDocument()
  })
})
```

Append to `src/screens/AddEditEntryScreen.test.tsx`:

```tsx
import { MemoryRouter } from 'react-router-dom'
// ...
it('prefills the date from the ?date= query param', async () => {
  render(
    <MemoryRouter initialEntries={['/entry/new?date=2026-07-09']}>
      <AddEditEntryScreen />
    </MemoryRouter>,
  )
  const dateInput = await screen.findByLabelText(/date/i) as HTMLInputElement
  expect(dateInput.value).toBe('2026-07-09')
})
```
(If the existing AddEditEntry test already wraps in a router, match its existing render helper instead of adding a second `MemoryRouter`.)

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/DaySheet.test.tsx src/screens/AddEditEntryScreen.test.tsx`
Expected: FAIL.

**Step 3: Write `src/components/DaySheet.tsx`**

```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../data/db'
import { listTransactionsForDate } from '../data/transactions'

export function DaySheet({ date, onClose }: { date: string; onClose: () => void }) {
  const navigate = useNavigate()
  const transactions = useLiveQuery(() => listTransactionsForDate(date), [date])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  if (!transactions || !categories) return null

  const spent = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const name = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Unknown'

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-black/40" onClick={onClose}>
      <div className="w-full rounded-t-2xl bg-surface p-4" onClick={(e) => e.stopPropagation()}>
        <p className="text-center text-sm text-muted">{date} · ₹{spent.toFixed(0)}</p>
        <ul className="my-3 flex flex-col gap-2">
          {transactions.map((t) => (
            <li key={t.id} className="flex justify-between rounded-lg border border-border p-3">
              <span>{t.description || name(t.categoryId)}</span>
              <span className={t.type === 'expense' ? 'text-red-500' : 'text-accent'}>
                {t.type === 'expense' ? '-' : '+'}₹{t.amount.toFixed(0)}
              </span>
            </li>
          ))}
          {transactions.length === 0 && <li className="py-4 text-center text-sm text-muted">No entries</li>}
        </ul>
        <button onClick={() => navigate(`/entry/new?date=${date}`)}
          className="w-full rounded-xl bg-accent p-3 font-medium text-white">+ add to this day</button>
      </div>
    </div>
  )
}
```

**Step 4: Wire the sheet into `CalendarScreen.tsx`**

Add `import { DaySheet } from '../components/DaySheet'` and selection state:

```tsx
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
```

Make each day cell a button that opens the sheet (change the day `<div>` to a `<button>` with `onClick={() => setSelectedDay(date)}`, keeping `data-testid={`day-${date}`}` and its classes). At the end of the day-view `return`, render the sheet:

```tsx
      {selectedDay && <DaySheet date={selectedDay} onClose={() => setSelectedDay(null)} />}
```

**Step 5: Prefill date in `AddEditEntryScreen.tsx`**

Add `useSearchParams` to the existing `react-router-dom` import, then:

```tsx
  const [searchParams] = useSearchParams()
  const [date, setDate] = useState(searchParams.get('date') ?? todayDateString())
```
(Replace the existing `const [date, setDate] = useState(todayDateString())` line.)

**Step 6: Run tests to verify they pass**

Run: `npx vitest run src/components/DaySheet.test.tsx src/screens/AddEditEntryScreen.test.tsx src/screens/CalendarScreen.test.tsx`
Expected: PASS

**Step 7: Commit**

```bash
git add src/components/DaySheet.tsx src/components/DaySheet.test.tsx src/screens/CalendarScreen.tsx src/screens/AddEditEntryScreen.tsx src/screens/AddEditEntryScreen.test.tsx
git commit -m "feat: add day bottom sheet with quick add-to-day"
```

---

### Task 9: Reskin existing screens to the token system

**Files (modify):**
- `src/screens/HomeScreen.tsx`
- `src/screens/AddEditEntryScreen.tsx`
- `src/screens/AnalyticsScreen.tsx`
- `src/screens/CategoriesBudgetsScreen.tsx`
- `src/auth/SignInScreen.tsx`
- `src/components/SyncStatus.tsx`

This is a mechanical color swap, not a behavior change. No new tests; existing screen tests must keep passing.

**Step 1: Apply the token swap across the files**

Replace hardcoded colors with tokens consistently:

| Old | New |
|---|---|
| `bg-white` | `bg-surface` |
| `bg-slate-100` (cards/tiles) | `bg-surface` + `border border-border`, or `bg-bg` |
| `text-slate-900` | `text-text` |
| `text-slate-500` | `text-muted` |
| `border` (bare) | `border border-border` |
| `bg-teal-700` / `bg-emerald-600` (primary action) | `bg-accent` |
| expense red (`text-red-600`) | keep `text-red-500` (semantic, not themed) |
| income green (`text-emerald-600`) | `text-accent` |

Concretely:
- **HomeScreen**: summary tiles → `rounded-2xl bg-surface border border-border p-3`; "Add entry" `Link` → `bg-accent text-white rounded-xl`; transaction rows → `border border-border`, amounts use `text-red-500` / `text-accent`. (The floating "+" now lives in the bottom nav; keep or drop the inline "Add entry" button per preference — dropping it is fine since the nav covers it. If dropped, remove the now-unused `Link` import.)
- **AddEditEntryScreen**: inputs/selects → `border border-border bg-surface rounded-lg`; type toggle keeps red/emerald active states but swap emerald→`bg-accent`; submit → `bg-accent`.
- **AnalyticsScreen**: cards → `bg-surface border border-border rounded-2xl`; text → `text-text`/`text-muted`. Recharts series colors: pass `var(--color-accent)` where a single brand line is drawn; category pie keeps per-category colors.
- **CategoriesBudgetsScreen**: same card/border/text swaps.
- **SignInScreen**: background `bg-bg`, card `bg-surface`, button `bg-accent`.
- **SyncStatus**: the `text-slate-500` → `text-muted`; keep the status dot colors (amber/blue/emerald) — they are semantic state, not theme.

**Step 2: Verify nothing broke**

Run: `npm test`
Expected: PASS (update any test that asserted an old literal class/color; prefer asserting behavior/text over classes).

Run: `npm run build`
Expected: succeeds.

Run: `npm run lint`
Expected: clean (fix any unused imports the swap created).

**Step 3: Commit**

```bash
git add src/screens src/auth src/components/SyncStatus.tsx
git commit -m "feat: reskin all screens onto the design token system"
```

---

### Task 10: Final verification

**Step 1: Full suite + build + lint**

```bash
npm test && npm run build && npm run lint
```
Expected: all green.

**Step 2: Manual smoke (see @run skill or `npm run dev`)**

Verify on a narrow viewport (iPhone width):
- Bottom tab bar reachable; active tab is emerald; center "+" opens Add Entry.
- Calendar day view: busiest day is darkest; ‹ › change months; tapping the title zooms to the year grid; tapping a month zooms back in.
- Tapping a day opens the sheet; "add to this day" opens Add Entry with that date prefilled; saving returns and the day now shows the amount/heat.
- Toggle the OS appearance (light ↔ dark) — the whole app follows, emerald accent adapts, heatmap stays legible in both.

**Step 3: Commit any fixups, then finish**

Use the finishing-a-development-branch skill to decide merge/PR.

---

## Notes

- **Motion:** deliberately minimal per the design — no animation library. Month/year transitions and the sheet are instant/fade only. Do not add springs.
- **Swipe gestures:** the ‹ › buttons are the primary, testable month/year control. Optional touch-swipe (`onTouchStart`/`onTouchEnd` on the grid calling `setMonth(addMonths(...))`) can be layered on later; it is not required for this plan.
- **No schema/sync/auth changes** — everything reads existing Dexie data.
