# Multi-Account Support & Edit-Entry — Design

## Goal

Two changes:

1. **Make the client safe for multiple accounts.** The backend is already
   multi-user (email OTP auth, `user_id` on every table, RLS "own rows only",
   sync scoped per user). The gap is entirely client-side: the local
   IndexedDB and sync watermark are single-user, and there is no sign-out.
   Model chosen: **one account per device** — a clean sign-out plus a
   per-user reset guarantee no data bleed. (Same-device account switching is
   explicitly deferred.)
2. **Edit an existing entry.** The `/entry/:id` route exists but
   `AddEditEntryScreen` only ever creates. Wire it to load, update, and
   delete a transaction.

**No backend/schema changes** — `user_id`, RLS, and OTP are already correct.

## Current state (verified)

- `AuthProvider` already uses `supabase.auth.signInWithOtp` + `verifyOtp`;
  `SignInScreen` already does email → 6-digit code → verify. OTP is done.
- `supabase/schema.sql`: every table has `user_id uuid default auth.uid()`,
  RLS policy `auth.uid() = user_id`, server-side `updated_at` trigger. Data
  is isolated per account server-side.
- `syncEngine.syncAll()` stamps `user_id` on push and pulls only own rows.

Single-user assumptions that remain, all client-side:
- `src/data/db.ts`: fixed Dexie database name `'budget-manager'`, shared by
  whoever uses the device.
- `syncEngine.ts`: `LAST_SYNCED_KEY = 'budget-manager:lastSyncedAt'` is global,
  not per-user.
- No sign-out anywhere; no account switch.
- `App.tsx` startup runs *seed → catch-up → sync*.

Consequence today: on the same device/browser, if account B signs in after A,
B's pulled rows merge into A's leftover local rows → mixed data.

## Section 1 — Account isolation & sign-out

### 1a. Sign-out

Add a signed-in indicator (the account email) and a **Sign out** button to the
top header in `App.tsx` (currently holds only `SyncStatus`).

On sign-out:
- **Online:** run a final `syncAll()` (push any pending local edits up), then
  `supabase.auth.signOut()`.
- **Offline:** confirm first ("You're offline; unsynced changes may be lost"),
  then `supabase.auth.signOut()`.

`AuthProvider` gains a `signOut()` method encapsulating the online/offline
logic. `onAuthStateChange` already clears the session → `App.tsx` falls back to
`SignInScreen`.

### 1b. Per-user fingerprint guard (the real guarantee)

Store the active user id under `localStorage['budget-manager:activeUserId']`.
When a session resolves at startup, compare it to the stored id:
- **Same user** → normal startup.
- **Different user / first login on this device** → clear all Dexie tables
  (`categories`, `transactions`, `budgets`, `recurring_rules`) and reset the
  sync watermark, then record the new user id.

This makes account bleed impossible regardless of how the session changed —
even if the sign-out path was skipped or interrupted. It is the correctness
lynchpin, not the sign-out flow.

Implementation: a `resetLocalDataForUser(userId)` helper (in a small
`src/data/localReset.ts` or on the sync/data layer) that reads the stored id,
and if it differs, clears tables + watermark + stores the new id. Returns
whether a reset happened (useful for tests and for deciding seed timing).

### 1c. Fixed startup orchestration

New order in `App.tsx`, keyed on `session.user.id`:
1. `resetLocalDataForUser(userId)` — wipe iff the user changed.
2. `syncAll()` — pull server state first. Push of an empty local DB is a
   no-op, so a returning user's server rows arrive before anything is seeded.
3. `seedDefaultCategoriesIfEmpty()` — now only seeds for a genuinely new user
   with zero server categories (prevents re-seeding + pushing duplicate
   default categories for a returning user).
4. `catchUpRecurringTransactions(today)` — after pull, so it sees synced rules.

This reorder is required: the old *seed-before-sync* order would, after a
wipe, create 10 fresh default categories locally and push duplicates to the
server for a returning user.

## Section 2 — Edit an existing entry (`/entry/:id`)

Make `AddEditEntryScreen` mode-aware:
- Read `id` via `useParams`. If present, load the transaction from Dexie
  (`db.transactions.get(id)`) and prefill all fields: type, category, amount,
  description, date, time.
- Submit branches: `id` present → `updateTransaction(id, changes)`; absent →
  `createTransaction(...)` (unchanged).
- **Delete:** in edit mode show a Delete button → `deleteTransaction(id)` →
  navigate back. (`deleteTransaction` already exists.)
- **Entry points:** make transaction rows tappable, linking to `/entry/:id`,
  on **Home** and in the **DaySheet**.
- The "make recurring" toggle stays create-only (editing a past instance into
  a rule is out of scope).
- After save/delete, navigate back (Home, or the calendar day the user came
  from).

## Section 3 — Testing

- **Account isolation (critical):** unit-test `resetLocalDataForUser` — same
  id preserves local data; different id clears all tables, resets the
  watermark, and stores the new id; first-login (no stored id) records it
  without needing prior data.
- **Sign-out:** `AuthProvider.signOut` triggers a final sync when online then
  `supabase.auth.signOut()`; offline path gated on confirmation. Header
  button component test.
- **Edit entry:** edit mode prefills from an existing transaction; save
  performs an update (not a second create); delete removes it.
- **Anti-duplicate startup order:** seeding is skipped when the pull already
  produced categories (no duplicate default categories for returning users).
- Existing 66 tests remain green.

## Out of scope

- Same-device account switching / keeping multiple accounts' offline data
  side by side (deferred; would namespace the Dexie DB per user id).
- Collaborative/shared budgets (accounts are isolated, per the requirement).
- Any schema, RLS, or auth-provider change.
