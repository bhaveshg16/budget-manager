# Calendar View & Design Refresh — Design

## Goal

Two changes to the v1 budget manager, driven by everyday usability:

1. **Calendar view** — see how much was spent each day, and consequently each
   month, at a glance.
2. **Design refresh** — the current minimal look feels "dead." Move to a
   modern, engaging look with a first-class light *and* dark theme, without
   relying on heavy animation.

Guiding priority (from v1): dead-simple daily use.

## Navigation shell

Replace the current top text-link nav with a **bottom tab bar** (thumb-reachable,
the mobile standard) plus a floating emerald **"+"** in the center for the most
common action — logging an entry.

Tabs: **Home · Calendar · Analytics · Categories**, with the center "+" between
Calendar and Analytics. The active tab uses the emerald accent. The sync-status
indicator moves to a lightweight top bar / Home rather than the old header.

Rationale: biggest single usability upgrade, and the natural home for the new
Calendar tab.

## Calendar screen

Two zoom levels, emerald-tinted heatmap at both. **The heatmap reflects expenses
only** — income never drives cell color.

### Day view (default)

- One month at a time, standard week grid (Mon–Sun).
- Each day cell shows the date number and that day's **expense** total.
- Cell background = emerald tint scaled to the day's expense total, **normalized
  against the busiest day in the visible month**, so contrast is always
  meaningful. Days with no expense stay bare.
- Header shows the month title plus the month's spent / net summary.
- **Swipe left/right** changes months.
- Today gets a subtle ring.
- **Tapping the month title zooms out** to the year view.

### Year view (zoom out)

- 12 month cells, same heatmap logic applied to monthly expense totals
  (normalized against the busiest month in the year).
- Header shows the year and the year's total spend.
- **Tapping a month zooms into** its day view.

### Day tap → bottom sheet

Tapping a day slides up a sheet listing that day's transactions, with a
**"+ add to this day"** action that opens Add/Edit Entry pre-dated to that date.
Reuses the existing "list transactions for a date" path.

```
──────── Jul 9 · ₹2,100 ────────
 🍴 Lunch                     420
 🛒 Groceries               1,680
        [ + add to this day ]
```

## Design system & reskin (light + dark)

Introduce a small **semantic token layer** so both themes are first-class and
every screen reads from shared variables instead of hardcoded colors
(`bg-white`, `text-slate-900`, etc.). Implemented with Tailwind v4's `@theme` +
CSS custom properties in `src/index.css`, with dark values under
`@media (prefers-color-scheme: dark)` — follows the iPhone system setting
automatically, no in-app toggle.

| Token | Light (warm) | Dark (charcoal) |
|---|---|---|
| `--bg` | warm off-white `#faf9f7` | near-black `#0f1211` |
| `--surface` (cards) | `#ffffff` | `#191d1b` |
| `--text` / `--text-muted` | slate-900 / slate-500 | slate-100 / slate-400 |
| `--border` | warm gray | subtle light-on-dark |
| `--accent` | emerald `#10b981` | mint `#34d399` |
| `--heat-*` | emerald tint ramp (5 steps) | mint-glow ramp on dark |

Making it "engaging, not dead" **without motion**:

- **Depth** — soft rounded cards (`rounded-2xl`) with a gentle shadow (light) /
  subtle elevation (dark), replacing flat bordered boxes.
- **Hierarchy** — big, confident numbers for totals; muted labels; generous
  whitespace retained.
- **Color** — emerald accent on the active tab, the "+", key figures, and chart
  series; category colors stay varied, slightly richer.
- The **heatmap** itself carries much of the visual life.

Motion is deliberately minimal: gentle fades / slide for month swipes and the
day sheet — no springs, bounces, or count-ups.

**Scope:** the reskin touches all existing screens (Home, Add/Edit, Analytics,
Categories, SignIn, SyncStatus) to swap hardcoded colors for tokens. Broad but
mechanical.

## Data layer

Two read-only aggregations over existing Dexie transactions, alongside
`src/data/analytics.ts`. Both filter `type === 'expense'`. No schema or sync
changes.

- `spendByDayForMonth(month: 'YYYY-MM')` → `Map<dateString, number>` — expense
  sum per day; the map's max sets the day-view tint scale.
- `spendByMonthForYear(year: number)` → `Map<'YYYY-MM', number>` — expense sum
  per month; feeds the year-view heatmap.

The day sheet reuses the existing per-date transaction listing.

## Testing

Follows the existing vitest + fake-indexeddb patterns in `src/data/*.test.ts`:

- Unit tests for both aggregations: empty month, income correctly excluded,
  multi-day sums, month/year boundaries.
- Component tests for the Calendar screen: grid renders, heatmap tint reflects
  relative spend, swipe changes month, zoom in/out, day tap opens the sheet with
  the correct transactions.
- Light coverage of the nav shell: tabs render, active state, "+" routes to new
  entry.

## Out of scope

- In-app manual light/dark toggle (system setting only).
- Any change to sync, auth, recurring rules, or the data schema.
- Heavy animation / motion (explicitly chosen to keep minimal).
