# Multi-Account Support & Edit-Entry Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Make the local-first client safe for multiple accounts (sign-out + per-user local reset + correct startup order), and wire the existing `/entry/:id` route to load, update, and delete a transaction.

**Architecture:** The backend is already multi-user (OTP auth, `user_id` + RLS, per-user sync). All work here is client-side. A per-user "fingerprint" in `localStorage` triggers a wipe of the local Dexie DB when the signed-in user changes, guaranteeing no data bleed regardless of the sign-out path. Startup is reordered to pull-before-seed so returning users don't re-seed duplicate default categories.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind v4, Dexie + dexie-react-hooks, react-router-dom v7, Supabase JS, vitest + @testing-library/react + fake-indexeddb.

**Reference the design:** `docs/plans/2026-07-23-multi-account-and-edit-entry-design.md`

**Conventions:** camelCase local model / snake_case remote; currency `₹{n.toFixed(0)}`; tests colocated `*.test.ts(x)`; single test file `npx vitest run <path>`; full suite `npm test`; `npm run lint`, `npm run build`, `npx tsc --noEmit`.

---

### Task 1: Extract sync-watermark helpers into their own module

**Why:** `resetLocalDataForUser` (Task 2, in the data layer) must reset the sync watermark without importing `syncEngine.ts` (which imports the Supabase client and would force Supabase mocking into a pure data-layer test). Move the watermark helpers to a dependency-free module.

**Files:**
- Create: `src/sync/watermark.ts`
- Modify: `src/sync/syncEngine.ts` (import from and re-export the watermark helpers)
- Existing test that must keep passing: `src/sync/syncEngine.test.ts` (imports `getLastSyncedAt` from `./syncEngine`)

**Step 1: Create `src/sync/watermark.ts`:**

```ts
const LAST_SYNCED_KEY = 'budget-manager:lastSyncedAt'

export function getLastSyncedAt(): number {
  return Number(localStorage.getItem(LAST_SYNCED_KEY) ?? 0)
}

export function setLastSyncedAt(value: number): void {
  localStorage.setItem(LAST_SYNCED_KEY, String(value))
}

export function resetSyncWatermark(): void {
  localStorage.removeItem(LAST_SYNCED_KEY)
}
```

**Step 2: Update `src/sync/syncEngine.ts`:**
- Remove the local `LAST_SYNCED_KEY`, `getLastSyncedAt`, and `setLastSyncedAt` definitions (lines ~5–13).
- Add at the top: `import { getLastSyncedAt, setLastSyncedAt } from './watermark'`
- Re-export so existing importers of `./syncEngine` keep working: `export { getLastSyncedAt } from './watermark'`
- The body of `syncAll` already calls `getLastSyncedAt()` and `setLastSyncedAt(startedAt)` — those now resolve to the imported versions. No other change.

**Step 3: Verify**

Run: `npx vitest run src/sync/syncEngine.test.ts`
Expected: PASS (unchanged behavior).
Run: `npx tsc --noEmit` — clean.

**Step 4: Commit**

```bash
git add src/sync/watermark.ts src/sync/syncEngine.ts
git commit -m "refactor: extract sync watermark helpers into watermark module"
```

---

### Task 2: Per-user local reset guard

**Files:**
- Create: `src/data/localReset.ts`
- Test: `src/data/localReset.test.ts`

**Step 1: Write the failing test** `src/data/localReset.test.ts`:

```ts
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
```

**Step 2:** Run `npx vitest run src/data/localReset.test.ts` — expect FAIL (module missing).

**Step 3: Write `src/data/localReset.ts`:**

```ts
import { db } from './db'
import { resetSyncWatermark } from '../sync/watermark'

export const ACTIVE_USER_KEY = 'budget-manager:activeUserId'

// One account per device: the local (offline) DB belongs to whichever user last signed in on this
// device. If a different user signs in, the previous user's rows must not leak into their view —
// wipe every table and reset the sync cursor so the new user re-pulls a clean copy from the server.
// A first login (no stored id) also counts as a reset so the active-user fingerprint gets recorded.
// Returns true when a reset happened.
export async function resetLocalDataForUser(userId: string): Promise<boolean> {
  const stored = localStorage.getItem(ACTIVE_USER_KEY)
  if (stored === userId) return false
  await Promise.all([
    db.transactions.clear(),
    db.categories.clear(),
    db.budgets.clear(),
    db.recurringRules.clear(),
  ])
  resetSyncWatermark()
  localStorage.setItem(ACTIVE_USER_KEY, userId)
  return true
}
```

**Step 4:** Run `npx vitest run src/data/localReset.test.ts` — expect PASS. `npx tsc --noEmit` clean.

**Step 5: Commit**

```bash
git add src/data/localReset.ts src/data/localReset.test.ts
git commit -m "feat: add per-user local reset guard for account isolation"
```

---

### Task 3: Sign-out in AuthProvider

**Files:**
- Modify: `src/auth/AuthProvider.tsx`
- Test: `src/auth/AuthProvider.test.tsx` (create)

**Behavior:** `signOut()` — if online, run a best-effort final `syncAll()` (swallow its errors so a sync failure can't trap the user in a signed-in state), then always call `supabase.auth.signOut()`. The offline confirmation prompt lives in the header (Task 4), not here.

**Step 1: Write the failing test** `src/auth/AuthProvider.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'

const signOutMock = vi.fn().mockResolvedValue({ error: null })
const getSessionMock = vi.fn().mockResolvedValue({ data: { session: null } })
const onAuthStateChangeMock = vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      signOut: signOutMock,
    },
  },
}))
const syncAllMock = vi.fn().mockResolvedValue(undefined)
vi.mock('../sync/syncEngine', () => ({ syncAll: syncAllMock }))

import { AuthProvider, useAuth } from './AuthProvider'

function SignOutButton() {
  const { signOut } = useAuth()
  return <button onClick={() => signOut()}>sign out</button>
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value })
}

describe('AuthProvider.signOut', () => {
  beforeEach(() => {
    signOutMock.mockClear()
    syncAllMock.mockClear()
  })

  it('runs a final sync then signs out when online', async () => {
    setOnline(true)
    render(<AuthProvider><SignOutButton /></AuthProvider>)
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))
    await waitFor(() => expect(signOutMock).toHaveBeenCalled())
    expect(syncAllMock).toHaveBeenCalled()
  })

  it('signs out without syncing when offline', async () => {
    setOnline(false)
    render(<AuthProvider><SignOutButton /></AuthProvider>)
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))
    await waitFor(() => expect(signOutMock).toHaveBeenCalled())
    expect(syncAllMock).not.toHaveBeenCalled()
    setOnline(true)
  })
})
```

**Step 2:** Run `npx vitest run src/auth/AuthProvider.test.tsx` — expect FAIL (`signOut` not on context).

**Step 3: Modify `src/auth/AuthProvider.tsx`:**
- Add `import { syncAll } from '../sync/syncEngine'`.
- Add `signOut: () => Promise<void>` to `AuthContextValue`.
- Implement inside the provider:

```tsx
  async function signOut() {
    if (navigator.onLine) {
      try {
        await syncAll()
      } catch {
        // Best-effort: a failed final sync must not block sign-out.
      }
    }
    await supabase.auth.signOut()
  }
```

- Add `signOut` to the context `value`.

**Step 4:** Run `npx vitest run src/auth/AuthProvider.test.tsx` — expect PASS. `npx tsc --noEmit` clean.

**Step 5: Commit**

```bash
git add src/auth/AuthProvider.tsx src/auth/AuthProvider.test.tsx
git commit -m "feat: add sign-out with best-effort final sync to AuthProvider"
```

---

### Task 4: Header sign-out button + startup reorder in App.tsx

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Step 1: Update the startup effect** in `src/App.tsx`.

Add imports:
```tsx
import { resetLocalDataForUser } from './data/localReset'
```

Replace the existing startup `useEffect` with this order — reset → pull → seed → catch-up → push:

```tsx
  useEffect(() => {
    const userId = session?.user.id
    if (!userId) return
    setSyncing(true)
    resetLocalDataForUser(userId)
      .then(() => syncAll()) // pull server state first, before any seeding
      .then(() => seedDefaultCategoriesIfEmpty()) // only seeds a genuinely new user (empty after pull)
      .then(() => catchUpRecurringTransactions(todayDateString()))
      .then(() => syncAll()) // push seeded defaults / caught-up recurring rows
      .finally(() => setSyncing(false))
    // Depend on the user id only — see note below.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id])
```

Keep the existing explanatory comment about depending on `session?.user.id` (TOKEN_REFRESHED). The two `syncAll()` calls are intentional: the first pulls so `seedDefaultCategoriesIfEmpty` can tell a new user (zero server categories) from a returning one; the second pushes anything seeding/catch-up just created.

**Step 2: Add the header sign-out UI.** Pull `signOut` and `session` from `useAuth` (session already available). Replace the header block:

```tsx
  const { session, loading, signOut } = useAuth()
```

```tsx
      <header className="flex items-center justify-between gap-2 p-3">
        <span className="truncate text-sm text-muted">{session.user.email}</span>
        <div className="flex items-center gap-3">
          <SyncStatus syncing={syncing} />
          <button onClick={handleSignOut} className="text-sm text-accent">Sign out</button>
        </div>
      </header>
```

Add the handler (inside `App`, after the effect):

```tsx
  async function handleSignOut() {
    if (!navigator.onLine && !window.confirm("You're offline. Unsynced changes may be lost. Sign out anyway?")) return
    await signOut()
  }
```

Note: `session` is guaranteed non-null here because the `if (!session) return <SignInScreen />` guard runs before this JSX.

**Step 3: Update `src/App.test.tsx`.**
- The signed-in test already stubs `./data/categories`, `./data/recurring`, `./sync/syncEngine`. Add a stub for the new dependency: `vi.mock('./data/localReset', () => ({ resetLocalDataForUser: vi.fn().mockResolvedValue(false) }))`.
- Ensure the mocked `useAuth`/session for the signed-in case provides `user.email` (e.g. `{ user: { id: 'u1', email: 'me@example.com' } }`) and a `signOut: vi.fn()`.
- Add a test: in the signed-in state, the header shows the email and a "Sign out" button, and clicking it calls the `signOut` mock. If the test mocks `useAuth` directly, assert the provided `signOut` mock is invoked; keep `navigator.onLine = true` so no confirm dialog appears.
- Keep existing assertions meaningful; do not weaken them.

**Step 4: Verify**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS.
Run: `npx tsc --noEmit` — clean. `npm run lint` — no new warnings.

**Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: add header sign-out and reorder startup to pull-before-seed"
```

---

### Task 5: Edit & delete an existing entry in AddEditEntryScreen

**Files:**
- Modify: `src/screens/AddEditEntryScreen.tsx`
- Test: `src/screens/AddEditEntryScreen.test.tsx` (append)

**Behavior:** When the route is `/entry/:id`, load that transaction, prefill all fields, and on submit call `updateTransaction(id, changes)` instead of `createTransaction`. Show a Delete button in edit mode. Hide the "make recurring" toggle in edit mode. After save/delete, `navigate(-1)`.

**Step 1: Append failing tests** to `src/screens/AddEditEntryScreen.test.tsx` (reuse existing imports; add `createTransaction`, `updateTransaction`? no — assert via db; add `Routes`, `Route` if needed. The existing file imports `MemoryRouter`, `db`, `createCategory`, `userEvent`). Add:

```tsx
import { createTransaction } from '../data/transactions'

describe('AddEditEntryScreen edit mode', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    await db.categories.clear()
  })

  it('prefills an existing transaction and updates it (no second row)', async () => {
    await createCategory({ name: 'Food', color: '#f59e0b', type: 'expense' })
    const txn = await createTransaction({ type: 'expense', categoryId: 'c1', amount: 100, description: 'Old', date: '2026-07-09', time: '10:00' })

    render(<MemoryRouter initialEntries={[`/entry/${txn.id}`]}>
      <Routes><Route path="/entry/:id" element={<AddEditEntryScreen />} /></Routes>
    </MemoryRouter>)

    const desc = (await screen.findByLabelText(/description/i)) as HTMLInputElement
    await waitFor(() => expect(desc.value).toBe('Old'))
    await userEvent.clear(desc)
    await userEvent.type(desc, 'New')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    const rows = await db.transactions.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].description).toBe('New')
    expect(rows[0].id).toBe(txn.id)
  })

  it('deletes the transaction in edit mode', async () => {
    await createCategory({ name: 'Food', color: '#f59e0b', type: 'expense' })
    const txn = await createTransaction({ type: 'expense', categoryId: 'c1', amount: 100, description: 'X', date: '2026-07-09', time: '10:00' })

    render(<MemoryRouter initialEntries={[`/entry/${txn.id}`]}>
      <Routes><Route path="/entry/:id" element={<AddEditEntryScreen />} /></Routes>
    </MemoryRouter>)

    await userEvent.click(await screen.findByRole('button', { name: /delete/i }))
    await waitFor(async () => expect(await db.transactions.count()).toBe(0))
  })
})
```

Add `waitFor`, `Routes`, `Route` to the existing imports if not present (merge, no duplicates).

**Step 2:** Run `npx vitest run src/screens/AddEditEntryScreen.test.tsx` — expect the 2 new tests FAIL.

**Step 3: Modify `src/screens/AddEditEntryScreen.tsx`:**

- Imports: add `useEffect` to the `react` import; add `useParams` to the `react-router-dom` import; add `updateTransaction, deleteTransaction` to the `../data/transactions` import.
- Inside the component, after `const navigate = useNavigate()`:

```tsx
  const { id } = useParams()
  const editMode = Boolean(id)
  const existing = useLiveQuery(() => (id ? db.transactions.get(id) : undefined), [id])
  const [loaded, setLoaded] = useState(false)
```

- After the existing `useState` declarations, add an effect to prefill once the record loads:

```tsx
  useEffect(() => {
    if (existing && !loaded) {
      setType(existing.type)
      setCategoryId(existing.categoryId)
      setAmount(String(existing.amount))
      setDescription(existing.description)
      setDate(existing.date)
      setTime(existing.time)
      setLoaded(true)
    }
  }, [existing, loaded])
```

- In `handleSubmit`, branch on edit mode before the create path:

```tsx
    if (editMode && id) {
      await updateTransaction(id, { type, categoryId: effectiveCategoryId, amount: numericAmount, description, date, time })
      navigate(-1)
      return
    }
```

(The existing create + optional-recurring logic stays below, unchanged, for the non-edit path.)

- Gate the "make recurring" toggle and its frequency select on `{!editMode && ( ... )}`.
- Add a Delete button in edit mode, right before or after Save:

```tsx
      {editMode && (
        <button type="button" onClick={async () => { await deleteTransaction(id!); navigate(-1) }}
          className="rounded-lg border border-border p-3 font-medium text-red-500">Delete</button>
      )}
```

**Step 4:** Run `npx vitest run src/screens/AddEditEntryScreen.test.tsx` — expect ALL pass (old create tests + 2 new). `npx tsc --noEmit` clean.

**Step 5: Commit**

```bash
git add src/screens/AddEditEntryScreen.tsx src/screens/AddEditEntryScreen.test.tsx
git commit -m "feat: edit and delete existing entries via /entry/:id"
```

---

### Task 6: Make transaction rows tappable (Home + DaySheet)

**Files:**
- Modify: `src/screens/HomeScreen.tsx`
- Modify: `src/components/DaySheet.tsx`
- Test: `src/screens/HomeScreen.test.tsx` (append a link assertion)

**Step 1: Append a failing test** to `src/screens/HomeScreen.test.tsx` (match the file's existing render/setup helper; it already renders Home inside a router and seeds a transaction). Assert a transaction row links to its edit route:

```tsx
it('links each transaction row to its edit route', async () => {
  // (reuse the file's existing setup that creates a transaction; capture its id)
  // After render:
  const link = await screen.findByRole('link', { name: /coffee|<the row text used in this file>/i })
  expect(link.getAttribute('href')).toMatch(/^\/entry\/.+/)
})
```

Adapt the query text to whatever the existing HomeScreen test seeds. If the existing test already creates a known transaction, reuse its description/category text for the accessible name.

**Step 2:** Run `npx vitest run src/screens/HomeScreen.test.tsx` — expect the new test FAIL.

**Step 3: Modify `src/screens/HomeScreen.tsx`:** the transaction list currently renders `<li className="flex justify-between rounded-lg border border-border p-3">`. Wrap the row content in a `Link` to `/entry/${t.id}` (keep `Link` imported — it may have been removed when the inline "Add entry" button was deleted; re-add `import { Link } from 'react-router-dom'` if absent):

```tsx
        {transactions.map((t) => (
          <li key={t.id}>
            <Link to={`/entry/${t.id}`} className="flex justify-between rounded-lg border border-border p-3">
              <span>{t.description || categoryName(t.categoryId)}</span>
              <span className={t.type === 'expense' ? 'text-red-500' : 'text-accent'}>
                {t.type === 'expense' ? '-' : '+'}₹{t.amount.toFixed(0)}
              </span>
            </Link>
          </li>
        ))}
```

**Step 4: Modify `src/components/DaySheet.tsx`:** the sheet already imports `useNavigate`. Wrap each transaction `<li>` row content in a `Link` to `/entry/${t.id}` (add `Link` to the existing `react-router-dom` import). Navigating away unmounts the sheet, so no explicit close needed:

```tsx
            <li key={t.id}>
              <Link to={`/entry/${t.id}`} className="flex justify-between rounded-lg border border-border p-3">
                <span>{t.description || name(t.categoryId)}</span>
                <span className={t.type === 'expense' ? 'text-red-500' : 'text-accent'}>
                  {t.type === 'expense' ? '-' : '+'}₹{t.amount.toFixed(0)}
                </span>
              </Link>
            </li>
```

**Step 5: Verify**

Run: `npx vitest run src/screens/HomeScreen.test.tsx src/components/DaySheet.test.tsx`
Expected: PASS.
Run: `npx tsc --noEmit` — clean.

**Step 6: Commit**

```bash
git add src/screens/HomeScreen.tsx src/components/DaySheet.tsx src/screens/HomeScreen.test.tsx
git commit -m "feat: tap a transaction row to edit it (Home + day sheet)"
```

---

### Task 7: Final verification

**Step 1: Full suite + build + lint + types**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
```
Expected: all green (the pre-existing `AuthProvider` `only-export-components` lint warning is acceptable; do not chase it).

**Step 2: Manual smoke (`npm run dev`)**

- Sign in with your email + OTP. Confirm the header shows your email + Sign out.
- Add/edit/delete an entry; tap a row on Home and in a calendar day sheet → it opens prefilled; save updates in place (no duplicate); delete removes it.
- Sign out (online) → returns to sign-in. Sign back in → your data reappears (pulled from server).
- **Isolation check:** sign in as a *second* email → you should see a clean/empty account (default categories only), NOT the first account's transactions. Sign back into the first → its data is intact (re-pulled).

**Step 3: Finish**

Use the finishing-a-development-branch skill.

---

## Notes

- **No schema/RLS/auth-provider change** — the server is already multi-user; this is purely the client catching up.
- **Double `syncAll()` at startup** is intentional (pull-before-seed, then push-new-local); at personal data scale the second call is near-instant.
- **Same-device account switching** and keeping multiple accounts' offline data side-by-side remain out of scope (would namespace the Dexie DB by user id).
