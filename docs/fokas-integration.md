# FOKAS ↔ Pantrio integration

> **Superseded for FOKAS (2026-10-20):** FOKAS will move onto Pantrio's own POS
> (docs/pos-multitenant.md) instead of integrating over the API. This document
> remains the design for *third-party* POS systems using the public API.

Scanned `../focas-pos-website` at commit `9014dde` (2026-10-20). Findings
and proposed changes. **Nothing in FOKAS has been changed yet.**

## What FOKAS has today (relevant parts)

- `menu_items(id uuid, category_id, name, price bigint, sku, active, available_floor)`.
  Prices are bigint rupiah, items are never hard-deleted (D12). There is
  **no cost column anywhere**.
- `order_items` snapshots `name_snapshot`, `unit_price`, `tax_rate`,
  `service_rate`, `revenue_stream`, `revenue_kind` at sale time. Snapshotting
  is a core convention.
- Sales are written **only** through Postgres functions
  (`create_cafe_order`, the mahjong F&B and close RPCs), which re-read prices
  from `menu_items` server-side (D7, D8).
- Analytics come from `sales_summary(p_from, p_to)` (migration 11), which
  returns totals, by_day, by_hour, top_items and by_method. It covers
  revenue only.
- `menu_modifiers` table exists, but the POS currently writes only free-text
  notes into `modifiers_json`.
- Mahjong time lines have `menu_item_id = NULL` and `revenue_kind = 'time'`.
  They have no material cost.
- Env convention: `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SECRET_KEY`, synced to
  Vercel by hand (D5).

## Proposed changes in FOKAS

Ordered by dependency. Each item gets a FOKAS decision-log entry when built.

### 1. Migration: cached cost on menu items
```sql
alter table menu_items
  add column unit_cost        bigint check (unit_cost >= 0),   -- null = unknown, NOT zero
  add column cost_updated_at  timestamptz,
  add column cost_source      text;                            -- 'pantrio' | 'manual'
```
FOKAS keeps its own copy, so a sale never waits on Pantrio.

### 2. Migration: cost snapshot on order lines
```sql
alter table order_items add column unit_cost bigint check (unit_cost >= 0);  -- nullable
```
- `create_cafe_order` and the mahjong add-F&B RPC copy `menu_items.unit_cost`
  into the line, alongside `unit_price`. It follows the same snapshot rule,
  so a later cost change never restates past margin.
- Time lines leave it `null` (or `0` by explicit rule, to be decided). They
  must not be counted as "missing cost".
- Historical lines stay `null`. Reports show **cost coverage %** instead of
  pretending.
- Mirror any change in `src/lib/money/` + tests, per the FOKAS convention.

### 3. `sales_summary` → add COGS and margin
New keys: `totals.cogs`, `totals.gross_profit`, `totals.margin_bps`,
`totals.cost_coverage_bps` (share of F&B revenue whose lines have a cost),
plus `cogs`/`margin` on `top_items` and `by_day`. Margin is computed on
**subtotal (pre-tax, pre-service)**. `/admin/sales` gets a margin column and
a "lowest-margin items" list.

### 4. Pantrio webhook receiver
`src/app/api/integrations/pantrio/route.ts`:
- Verify the HMAC signature (`PANTRIO_WEBHOOK_SECRET`) and reject stale
  timestamps.
- On `menu_item.cost_changed`: update `menu_items.unit_cost` by `external_id`
  (= FOKAS `menu_items.id`) using the service client, and write `audit_log`.
- Make it idempotent on the event id. Pattern: the existing
  `payment_events` table design.

### 5. Nightly reconcile (backstop)
A Vercel Cron job pulls `GET /v1/menu-items` and fixes any drift. This is the
same lesson as D15: push channels miss events, so a sweep is required.

### 6. Menu push
When a menu item is created, renamed or repriced in `menu/actions.ts`, push
it to Pantrio (`PUT /v1/menu-items`) **after** the local write succeeds. A
failure is non-fatal and shows a "not synced" badge; the nightly job retries.
FOKAS remains the source of truth for name and price.

### 7. UI
- Menu manager: cost, margin % and a "no recipe" badge per item, plus an
  "Edit recipe in Pantrio" deep link.
- Settings: a Pantrio connection panel (status and last sync). Paste the API
  key here, or env-only.

### 8. Env
```
PANTRIO_API_URL=
PANTRIO_API_KEY=          # server-only
PANTRIO_WEBHOOK_SECRET=   # server-only
```

### 9. Docs in FOKAS
Update `AGENTS.md` non-negotiables (cost snapshot, null ≠ 0, a sale never
calls Pantrio), `logs/architecture.md`, `logs/decisions.md` (new D-entry) and
`logs/progress.md`.

## Optional later: push sales to Pantrio
For cross-POS analytics in Pantrio itself, FOKAS adds a `sync_outbox` table
written in the same transaction as the order, and a cron drains it to
`POST /v1/sales`. This is not needed if FOKAS shows margin in its own
`/admin/sales`.

## Settled
- **No owner split, no mahjong** (FOKAS D38, 2026-10-20). COGS and margin
  are reported for the whole venue, and mahjong time lines are out of scope.
  The mahjong code is only hidden (D33). Removing it is a separate cleanup in
  FOKAS.
- FOKAS tax/service settings (`venue_settings.tax_rate`, `service_rate`)
  should map onto Pantrio's tax settings (plan §3.1). FOKAS prices are
  **exclusive** (tax added on top), and PB1 is charged on subtotal + service
  (D13).

## Still open
- Is a manual cost override in FOKAS allowed (`cost_source = 'manual'`) when
  Pantrio isn't connected?

## Risk notes
- Touching `create_cafe_order` touches the money path. Validate against a
  throwaway Postgres first (FOKAS operations.md), regenerate types, and keep
  the change additive: one nullable column, one extra field in the insert.
- No HTTP call may be added inside any order RPC or order Server Action.
