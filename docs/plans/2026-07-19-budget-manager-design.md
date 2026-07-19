# Personal Budget Manager — v1 Design

## Goal

A personal budgeting app for individual use on iPhone (installed as a PWA),
with occasional access from a laptop browser. Manual entry for v1; the
long-term goal (out of scope for this design) is AI-agent voice entry in a
later version.

Priorities: dead-simple daily use, minimal/easy-on-the-eyes design, and
detailed data analysis.

## Platform Decision

Progressive Web App (PWA), not a native iOS app. Rationale: free forever (no
Apple Developer Program fee), installable on the home screen via Safari,
works offline, and requires no App Store review — appropriate since this is
for personal use only, not public distribution.

## Architecture

- **Frontend**: React + TypeScript + Vite, styled with Tailwind CSS.
- **PWA**: `vite-plugin-pwa` for installability, offline support, and app
  icon/splash screen.
- **Local storage**: IndexedDB via Dexie.js. All writes go here first, so the
  app is instant and fully usable offline.
- **Sync backend**: Supabase free tier (Postgres + Auth). Background sync
  pushes local changes up and pulls remote changes down when online. Chosen
  over Firebase/Firestore because the "detailed analysis" requirement
  (trends, category breakdowns, budget-vs-actual, month comparisons) maps
  naturally onto SQL queries rather than client-side aggregation.
- **Auth**: One-time magic-link sign-in per device (via email, no password).
  Session persists indefinitely on the device — no login screen appears
  again during normal use. This is required so Supabase's row-level security
  can scope data to you and keep it private, even though the app's public
  (anon) key is embedded in the client code as normal for client apps.
- **Hosting**: Vercel or Cloudflare Pages (free tier), deployed from this
  repo.
- **Charts**: Recharts.

## Data Model

- **Transaction**: `id, type (expense | income), category_id, amount,
  description, date, time, is_recurring_instance_of (nullable ref to
  RecurringRule), created_at, updated_at`
- **Category**: `id, name, icon/color, type (expense | income), is_default`
- **Budget**: `id, category_id, month (YYYY-MM), limit_amount` — monthly cap
  per category.
- **RecurringRule**: `id, category_id, amount, description, frequency
  (weekly | monthly), day_of_month or day_of_week, is_active`. On its due
  date/time, a matching Transaction is created automatically with the saved
  amount — no confirmation prompt (chosen for simplicity; can be revisited
  per-rule later if a recurring amount turns out to vary).

Default categories seeded on first run (all editable/deletable): Food, Rent,
Transport, Shopping, Bills & Utilities, Entertainment, Health, Groceries,
Salary, Other Income.

Currency: INR.

## Core Screens

- **Home / This Month** — running total (spent, income, net), quick "+"
  button for new entry, recent transactions list.
- **Add/Edit Entry** — category (icon grid), amount (numeric keypad),
  description, date/time (defaults to now), optional "make recurring"
  toggle.
- **Analytics** — category breakdown (pie/bar), trends over time (line
  chart across months), budget-vs-actual (progress bar per category vs its
  monthly limit), month-over-month comparison.
- **Categories & Budgets** — manage categories, set/edit monthly limits.

## Visual Design

Minimal and easy on the eyes: light/neutral palette, generous whitespace,
large legible numbers, a soft accent color per category, no visual clutter.

## Offline & Error Handling

- Writes always succeed locally first, regardless of connectivity.
- A small sync-status indicator shows "synced" / "pending sync" / "offline."
- Sync conflicts (possible if a device was offline a long time) resolve by
  last-write-wins on `updated_at` — acceptable since this is single-user
  data, not collaborative editing.
- Failed sync retries automatically with backoff once connectivity returns.

## Out of Scope for v1

- AI/voice-based entry (the long-term goal, to be designed separately later).
- Multiple accounts/payment methods (cash vs. card vs. bank) — not selected
  for v1.
- Per-rule choice between auto-post and confirm-before-post for recurring
  transactions.
