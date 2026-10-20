# Pantrio — Plan

Status: **draft for discussion** (2026-10-20). Nothing is built yet. Open
questions are at the bottom; decisions marked PROPOSED in
[../logs/decisions.md](../logs/decisions.md) are not final until the user confirms them.

---

## 1. What Pantrio is

A standalone, multi-restaurant **recipe costing and margin** service that any
POS can connect to.

- A restaurant enters its **raw materials**: name, brand, pack size and price
  (per kg, per litre, per piece, per pack).
- It builds **recipes** for its menu items from those materials. One generic
  material such as "flour" can have several brand-specific products (for
  example Segitiga Biru for cakes and Cakra Kembar for bread), and each recipe
  line picks the exact product.
- Pantrio computes the **exact raw cost per dish**, adds labour, packaging and
  optional overhead, and shows **cost, gross profit and margin** against the
  POS selling price.
- POS systems connect over a **public API with API keys and webhooks**, so
  their analytics can show COGS and margin next to revenue. FOKAS is the
  first integration, but it is not a special case.

What it is **not** (at least at first): an inventory or stock-count system,
an accounting ledger, or a POS.

---

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 App Router + TypeScript (strict) | Same stack as FOKAS, so conventions and knowledge carry over |
| UI | Tailwind CSS 4 + shadcn/ui | Accessible components you own, easy to extend |
| Forms / validation | react-hook-form + zod | One zod schema validates the form, the Server Action **and** the public API |
| DB / Auth | Supabase (Postgres 17, Auth, RLS), **separate project from FOKAS** | Pantrio serves many restaurants and must not share a database with one POS |
| Hosting | Vercel (`sin1`, next to Supabase `ap-southeast-1`) | Same as FOKAS |
| Tables | TanStack Table | Ingredient and recipe lists get long |
| Charts | Recharts (or the FOKAS hand-rolled bar chart) | Margin trends |
| Tests | Vitest (unit, cost math) + Playwright (critical flows) | Cost math needs the same rigor as FOKAS money math |
| Background jobs | Vercel Cron, plus Vercel Queues or Workflow when webhooks/price search arrive | Retries for outbound webhooks |
| API docs | OpenAPI generated from the zod schemas | So other POS developers can integrate without reading our code |

### Repo shape: a small monorepo (pnpm workspaces + Turborepo)

```
apps/
  web/              Next.js: dashboard + /api/v1 public API
packages/
  core/             Pure cost math, unit conversion, zod schemas (no I/O, fully tested)
  sdk/              @pantrio/sdk, a typed TS client other POS apps can install
supabase/
  migrations/
docs/  logs/
```

Why not a single app: "other apps should be able to use this" means a
published SDK and a math package with no dependencies that a POS could
even run offline. Splitting them later is a painful refactor; starting with
three folders costs very little.

---

## 3. Domain model

All tables carry `org_id`, and RLS isolates organisations from each other.

```
organizations ─┬─ org_members (user_id, role: owner | manager | staff)
               ├─ outlets (optional: per-branch prices later)
               ├─ suppliers
               │
               ├─ ingredients               generic material: "Tepung terigu", "Telur", "Gula aren"
               │    └─ ingredient_products  brand-specific product: brand, pack_qty, pack_unit,
               │         │                   supplier, source_url, yield_pct
               │         └─ product_prices  price history: price, effective_from (append-only)
               │
               ├─ units / unit_conversions  g↔kg, ml↔l, plus per-ingredient: 1 egg = 55 g, 1 cup flour = 120 g
               │
               ├─ recipes                   kind: menu_item | prep (sub-recipe, e.g. "dough", "sambal")
               │    ├─ yield_qty, yield_unit (a prep batch makes 2 kg; a menu item makes 1 portion)
               │    └─ recipe_lines         → ingredient_product_id OR sub_recipe_id, qty, unit, waste_pct
               │
               ├─ staff_members             name, role (free text), active
               │    └─ staff_wages          monthly_wage, effective_from (append-only history)
               ├─ fixed_costs               name, category: rent | electricity | water | gas | internet | other
               │    ├─ fixed_cost_rates     default amount + period (monthly | yearly), effective_from
               │    └─ fixed_cost_actuals   month, actual amount (overrides the default for that month only)
               │
               ├─ tax_settings              price_mode, pb1_rate, service_rate, income_tax_mode (see §3.1)
               │
               ├─ pos_connections           provider, api_key_hash, webhook_url, webhook_secret
               ├─ external_menu_items       pos_connection_id, external_id, name, selling_price → recipe_id
               ├─ sales_lines (phase 3)     sales pushed by the POS, with a cost snapshot
               └─ cost_snapshots            recipe_id, computed cost breakdown, computed_at (what webhooks send)
```

### Costing rules (the "non-negotiables" in draft)

1. **Money is stored as `bigint` minor units** (rupiah), with a `currency`
   per organisation. Same rule as FOKAS D2.
2. **Intermediates are fractional, and rounding happens once, at the dish
   total.** Rp 14,500/kg × 120 g = Rp 1,740 exactly, but Rp 23,900 per 30
   eggs × 2 eggs = Rp 1,593.33. Rounding every line drifts (FOKAS D13 has the
   same lesson). Implemented as exact bigint fractions (`Q`) in
   `packages/core`. The database stores inputs only and does not re-implement
   the math (P15).
3. **Prices are versioned (`effective_from`) and never overwritten.** "What
   did this dish cost in March?" must still have an answer after a price
   change. Same pattern as FOKAS D31.
4. **Unknown cost is `null`, never `0`.** A dish with a missing price has to
   show "incomplete", not "100% margin".
5. **Yield/waste is explicit.** 1 kg of chicken that becomes 750 g usable
   costs 1.33× per usable gram. `yield_pct` sits on the product (trim loss)
   and `waste_pct` on the recipe line (process loss).
6. **Sub-recipes are costed recursively, and cycles are rejected** (a check
   at save time plus a recursive CTE with a depth guard).
7. **The POS owns name and selling price, and Pantrio owns recipe and cost.**
   Pantrio imports or syncs menu items from the POS and never writes back
   prices.

### Cost per dish (variable cost only)

```
material   = Σ (line qty in base unit ÷ yield_pct × (1 + waste_pct)) × product price per base unit
             (+ sub-recipe cost × qty ÷ sub-recipe yield)
packaging  = ordinary recipe lines that point at packaging "ingredients" (cup, lid, box)
dish cost  = material + packaging                    (COGS / HPP)
```

**Labour, electricity, rent and other overheads are fixed monthly costs**
(confirmed 2026-10-20). They are not costed per dish. Staff are entered by
name with a monthly wage. Rent, electricity and the rest are entered as a
**default monthly average** that can be changed going forward (versioned) or
overridden with an actual figure for a single month (for example a high PLN
bill). Rent can be entered yearly and is shown as a monthly equivalent.

### Period P&L

```
Net sales            (selling prices excl. PB1 and service charge, see §3.1)
− COGS               (Σ dish cost × qty sold)
= Gross profit                       → gross margin %
− Fixed costs        (wages + rent + electricity + … for the month, actuals override defaults)
= Operating profit (before tax)      → margin before tax
− Income tax         (e.g. PPh Final UMKM 0.5% of turnover)
= Net profit (after tax)             → margin after tax

Break-even sales / month = fixed costs ÷ gross margin %
```

A dish view can *optionally* show "fixed cost per dish = month's fixed costs ÷
dishes sold". This is display only and never stored.

### 3.1 Indonesian tax handling

Per-org settings, defaulting to common Indonesian restaurant practice.
**Rates vary by regency and taxpayer status, so the app must let the user set
them, and the defaults should be confirmed with a tax consultant.**

| Setting | Default | Notes |
|---|---|---|
| `price_mode` | `exclusive` | `inclusive`: menu prices already contain PB1/service and Pantrio backs them out to get net sales |
| `pb1_rate` | 10% | PB1, now **PBJT makanan & minuman** (UU 1/2022 HKPD). The 10% maximum is set per regency by Perda. It is a pass-through to the regional government and **never** counted as revenue |
| `service_rate` | 0% | Not a tax. `service_is_revenue` toggle: many restaurants pass it to staff, so it defaults to excluded from revenue |
| `pb1_on_service` | true | PB1 is charged on subtotal + service (same as FOKAS D13) |
| `income_tax_mode` | `pph_final_umkm` | PPh Final 0.5% of gross turnover (PP 55/2022) for small businesses, `custom_rate`, or `none`. Optional annual tax-free threshold (Rp 500 juta for individual taxpayers) |

Margin is shown **both ways**, chosen by a toggle on reports:
- **Before tax:** net sales − COGS (and − fixed costs at P&L level).
- **After tax:** additionally deducts income tax. PB1 never appears as a
  cost, because it was never the restaurant's money. With inclusive pricing
  it is removed from the price before any margin is computed.

---

## 4. Public API (for any POS)

Versioned REST under `/api/v1`, authenticated with an org-scoped API key
(`pk_live_…`, stored as a SHA-256 hash and shown once, the same pattern as
Stripe and Supabase keys).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/menu-items` | All mapped items with current cost, price and margin |
| `GET` | `/v1/menu-items/{external_id}/cost` | One item's cost breakdown |
| `PUT` | `/v1/menu-items` | POS pushes its menu (external_id, name, price). Idempotent upsert |
| `POST` | `/v1/sales` | POS pushes sold lines (phase 3). Idempotent on `(connection, external_line_id)` |
| `GET` | `/v1/reports/margin?from&to` | Margin analytics for POSes that don't want to build their own |

**Outbound webhook** `menu_item.cost_changed` (HMAC-SHA256 signed, retried
with backoff) fires when a price or recipe change moves a dish's cost. This
lets a POS keep a **local cached cost** and never call Pantrio during a sale.

Rate limiting per key; every write is audit-logged.

### Integration principle

> **A POS must never need Pantrio to be up in order to take a sale.**

The POS caches cost per menu item (refreshed by webhook, with a nightly pull
as a backstop) and **snapshots it onto the order line** at sale time. Pantrio
being down only means cost data can go a little stale, never a blocked till.

---

## 5. Phases

| Phase | Scope |
|---|---|
| 0 | Monorepo scaffold, Supabase project, auth, orgs + members, RLS, CI, `packages/core` with unit conversion + cost math + tests |
| 1 | Ingredients → brand products → price history; units and conversions; suppliers. CSV import (most restaurants have a spreadsheet already) |
| 2 | Recipes + sub-recipes; live cost/margin per dish; "what-if" (change a price and see which dishes move); staff wages + fixed costs + tax settings; monthly P&L and break-even |
| 3 | Public API + API keys + webhooks + SDK + OpenAPI docs; **FOKAS integration** (see [fokas-integration.md](fokas-integration.md)) |
| 4 | Sales ingestion, period margin reports, theoretical usage (sales × recipe = how much flour you *should* have used) |
| 5 | **Price search / cheaper alternatives** (§6) |
| later | Inventory and stock counts (actual vs theoretical variance), purchase orders, multi-outlet pricing, more POS adapters |

---

## 6. Expansion: "find cheaper alternatives" — feasibility and cost

The idea: on an ingredient product, click **Find alternatives** to see up to
10 results per source (web, Shopee, Tokopedia) for the same or a similar
product, ranked by **normalised price per base unit**, for both the same
brand cheaper elsewhere and other brands.

### The hard parts (not the search itself)

1. **Getting the data legally and reliably.** Shopee and Tokopedia (now
   under TikTok Shop) actively block scraping, and their ToS forbid it.
   Self-built scrapers break every few weeks and need rotating proxies.
   Realistic options:
   - **Paid scraper APIs** (for example Apify actors for Shopee/Tokopedia,
     priced per result) — fastest to ship, but you are still downstream of
     scraping and its ToS risk.
   - **Google Shopping via a SERP API** (for example SerpApi, `gl=id`) —
     covers many marketplaces and is legally cleaner. Indonesian coverage is
     patchier.
   - **Official affiliate APIs** (Shopee Affiliate, TikTok Shop affiliate) —
     most legitimate, but need approval and expose limited fields.
2. **Normalising pack sizes.** "Tepung Segitiga Biru 1kg", "… 500gr isi 2",
   "… karung 25kg". Comparing per-kg prices needs title parsing. A small
   LLM call (Haiku-class via AI Gateway) extracts `{brand, qty, unit,
   pack_count}` as structured output. That costs a fraction of a cent per
   listing and is cacheable forever per listing.
3. **Relevance.** Searching "murah" brings in junk. Use
   `{ingredient name} {pack size}` plus the brand for "same brand", and
   filter by the LLM-extracted category.
4. **Shipping and minimum order.** The cheapest listing per kg is often not
   the cheapest delivered. Show seller location; leave shipping estimates
   for later.

### Cost control

- **On demand only** (button click), never a background crawl of every
  ingredient.
- **Cache results per query for 24h–7d** in Postgres. Many restaurants
  search "tepung terigu 1kg", so one fetch serves everyone.
- **Per-org monthly quota**, which becomes a paid-tier feature.
- Rough order of magnitude, **to verify against current pricing before
  committing**: tens of USD per month for a SERP API at low volume, plus
  per-result scraper fees, plus negligible LLM parsing. That is cheap at
  10 restaurants and needs quotas at 1,000.

**Recommendation:** design the `ingredient_products.source_url` and
`price_quotes` tables now, build the feature in phase 5, and start with one
SERP-API source before adding marketplace scrapers.

---

## 7. Questions

### Answered 2026-10-20
- **Owner split:** none. FOKAS is food only, with no mahjong and no split
  (FOKAS D38), so COGS is reported for the venue as a whole.
- **Labour / electricity / rent:** fixed monthly costs (P11).
- **Margin:** both before and after tax, following Indonesian taxes (P12).
- **Modifiers:** later. It is a small addition and the schema leaves room.
- **Monorepo:** yes (P9).

### Still open
1. **Menu source of truth:** the proposal is that the POS owns name and price
   and Pantrio only maps to them (P3). Confirm.
2. **Pricing model / tiers** (if this becomes a product): free tier limits,
   and price search as the paid feature?
3. **Supabase project:** a new project under your account, in Singapore like
   FOKAS. You create it, or give me CLI access.
