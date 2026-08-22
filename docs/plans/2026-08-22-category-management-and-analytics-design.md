# Category Management & Customizable Analytics — Design

Date: 2026-08-22
Status: Approved

## Problems

1. **Duplicate categories on the UI.** Every fresh browser/device runs `seedDefaultCategoriesIfEmpty()` *before* the first sync pull, generating the 10 defaults with new random IDs. Sync pushes them to Supabase and pulls back every prior device's set — each fresh install adds a full duplicate set.
2. **Categories are fixed.** No UI to add/rename/recolor/delete categories. Worse, `deleteCategory()` only deletes locally: the sync engine has no delete propagation, so a deleted category reappears on the next pull. Remote FKs (`on delete restrict` from transactions/budgets/recurring_rules) block naive hard deletes.
3. **Analytics comparisons are fixed.** "This month vs last month" is hardcoded; users can't pick which categories or months to compare.

## Decisions (user-confirmed)

- Deleted categories: transactions are **kept** and shown under a single built-in **Uncategorized** bucket.
- Analytics: **one comparison builder** replacing the fixed month-vs-month section; pie, trend, and budget-vs-actual stay.
- Existing duplicates: **auto-merge** on boot, no confirmation screen.

## Approach

Soft-delete + pull-before-seed + deterministic seed IDs. Rejected alternatives: tombstone table with hard deletes (new infra, FK fights, overkill for a personal app) and server-side seeding via trigger (breaks offline-first first-run, still needs dedupe).

### 1. Dedupe migration

`mergeDuplicateCategories()` runs on every app boot after sync, idempotently:

- Group non-deleted categories by `(name, type)`.
- Canonical winner per group: the deterministic-ID row if present, else lexicographically smallest `id` — deterministic so all devices converge on the same winner.
- Re-point transactions, budgets, and recurring rules from losers to the canonical ID (bumps `updatedAt` so re-pointing syncs).
- Budgets: after re-pointing, collapse same `(categoryId, month)` collisions keeping the latest `updatedAt` (remote has `unique (user_id, category_id, month)`).
- Delete loser categories locally and remotely (`supabase.from('categories').delete()`). A remote delete blocked by FK (another device's unpushed rows) is swallowed and retried next boot.

Running every boot also folds in dupes pushed later by stale offline devices.

### 2. Seed fix

- Boot order becomes: **sync (pull) → dedupe → seed only if still empty → push**.
- Seed IDs become deterministic per user: `def-<slug>-<userId>` (e.g. `def-food-1a2b…`). Two truly-fresh offline devices seed identical rows that upsert-converge instead of duplicating. `categories.id` is a global PK, hence the userId suffix.
- Offline first run still seeds locally (sync no-ops); deterministic IDs guarantee convergence later.

### 3. Category management (CRUD + soft delete)

- `Category` gains `deletedAt?: number`; remote gains `deleted_at timestamptz` (nullable). One-time SQL for the user to run: `alter table categories add column deleted_at timestamptz;` (also added to `supabase/schema.sql`).
- Sync maps the field like any other column — deletes propagate through the existing push/pull with no engine changes.
- Categories screen gains: add (name, color, expense/income type), rename, recolor, delete. Any category can be deleted, including seeded defaults.
- Delete behavior: set `deletedAt`; leave transactions untouched; deactivate recurring rules pointing at it; hide its budgets.
- Rendering: everywhere a category is resolved by ID, deleted-or-missing resolves to a single grey **Uncategorized** bucket (sentinel ID) — analytics lumps all such spend together. Category pickers and budget lists exclude deleted categories.

### 4. Comparison builder (analytics)

- New "Compare" section replacing "This month vs last month".
- Two chip-row pickers: months (last 12, multi-select) and categories (multi-select, non-deleted expense categories + Uncategorized when present).
- Output: grouped bar chart (x = category, one bar per selected month) + totals table with deltas.
- Selection persists in `localStorage`; default = this month vs last month across top categories (matches today's behavior).

## Testing

- Merge migration: duplicates with references, budget-unique collisions, idempotency (second run is a no-op), canonical-winner determinism.
- Soft delete: delete → Uncategorized rendering in breakdown/comparison, rule deactivation, budgets hidden, pickers exclude deleted.
- Seed ordering: no seed when pull returns categories; deterministic IDs; offline first-run still seeds.
- Builder: aggregation across selected months/categories, persistence, defaults.
- Extend existing screen tests for the new CRUD UI.
