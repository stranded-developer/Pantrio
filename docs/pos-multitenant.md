# Proposal: the cashier POS inside Pantrio (multi-tenant)

Status: **CONFIRMED and built 2026-10-20** (phases 1–3 below). See logs/progress.md.
Answers: platform on *.vercel.app for now; invite-only; branches from day one
(one by default); FOKAS unchanged until cutover; subscriptions later.
Supersedes the "Pantrio is a costing service; POSes integrate over the API"
framing in plan.md §1 **for our own POS**. The public API stays for third-party
POSes.

## The idea
One product, one database, many restaurants:
- **Cashier POS:** ported from FOKAS. Cafe only; mahjong, owner split and
  booking are dropped.
- **Costing:** ingredients, brands, recipes, margin (already in Pantrio).
- **Stock:** ingredient stock that sales deduct automatically, via recipes.

Each restaurant gets its own name, logo, receipt text and domain.

## Why it's better than POS + API
- A sale, its cost snapshot and its stock deduction happen in **one
  transaction**. No webhooks, no cost cache, no nightly reconcile, no "not
  synced" states. Most of [fokas-integration.md](fokas-integration.md)
  disappears for our own POS.
- Menu items *are* recipes' parents. There is no `external_menu_items`
  mapping and no double entry.
- One codebase to fix and deploy, instead of FOKAS + Pantrio drifting apart.

## Costs and risks (honest)
1. **FOKAS is live.** Real sales, receipts printing, nightly backups on the
   STB. Moving it is a data migration with a cutover, not a refactor. → Keep
   FOKAS running untouched until Pantrio POS reaches parity, then migrate its
   data once with a script and verify totals match to the rupiah.
2. **The print bridge uses the Supabase secret key** (`bridge/index.mjs:28`),
   which bypasses RLS. In a shared database, a stolen STB would expose every
   tenant. → Per-device tokens: each bridge gets a revocable token bound to
   one org/outlet, and `claim_print_jobs` only returns that outlet's jobs.
   **Non-negotiable before a second tenant goes live.**
3. **A POS for many restaurants is a bigger responsibility.** Downtime stops
   other people's tills. → Supabase Pro (backups, PITR) instead of free tier
   plus STB `pg_dump` (FOKAS D6 no longer holds). Error monitoring. Status
   alerts.
4. **Offline.** FOKAS is online-only. Fine for one venue you control. Other
   restaurants will eventually ask for it. Not now, but don't design it out:
   keep client request ids (idempotency) on every write, which FOKAS already
   does.
5. **Scope growth.** POS + costing + stock is three products. → Strict
   phase order (below), with each phase shippable.

## Domains: one repo, one Vercel project, many domains
Recommended, and the pattern Vercel's Platforms starter uses:
- **Subdomain per tenant by default:** `fokas.pantrio.app`, via a wildcard
  domain `*.pantrio.app` on the one project.
- **Optional custom domain per tenant:** `pos.fokascafe.com`. Added to the same
  Vercel project through the Vercel API from the tenant's settings page.
  The tenant adds a CNAME, and Vercel issues TLS automatically.
- `proxy.ts` reads the `Host` header → looks up `org_domains` → rewrites to
  the internal `/o/[org]/…` routes. The tenant's URL never shows `/o/`.
- Staff log in on their restaurant's domain. Supabase cookies are per-domain,
  so tenants are also separated at the browser level.

**Alternatives considered:**
- **A separate Vercel project per restaurant (same repo):** works, but N
  deploys, N env setups, N places to roll back, and every fix shipped N times.
  Only worth it for a customer who demands isolated infra. Keep that *possible*
  (a `SINGLE_TENANT_ORG` env var could pin a deployment to one org) but not the
  default.
- **A separate database per restaurant:** strongest isolation, but migrations ×
  N and no cross-tenant tooling. Rejected for now. RLS + org-scoped FKs
  (already built and verified) is the standard approach.

## What gets ported from FOKAS (cashier only)
| FOKAS piece | In Pantrio |
|---|---|
| `src/lib/money` (totals, tax on subtotal+service, rounding) | `packages/core`, reconciled with the tax module |
| `create_cafe_order` (atomic, idempotent, server re-prices) | `create_order(org, outlet, …)`: also snapshots unit cost and writes stock movements, same transaction |
| `void_order` (manager, same business day, audit) | Same, per org, and reverses stock movements |
| Menu manager, categories, never hard-delete | Menu items with an optional recipe link |
| POS terminal, cart in localStorage, paid screen | Same, tenant-branded |
| Orders history, any day | Same |
| `sales_summary` (SQL aggregate) | Same, plus COGS and margin |
| Kitchen screen, daily customer number | Same, per outlet |
| Receipt printing: `print_jobs` + bridge | Same, with **per-device tokens** (risk 2) |
| Business day 05:00 cutover | Per-org setting (cutover hour + timezone: WIB/WITA/WIT) |
| Staff roles owner/manager/cashier | Merged with org roles: owner / manager / cashier (+ stock clerk later) |
| Mahjong, rate cards, owner splits, bookings | **Not ported** |

New: `outlets` (a restaurant may have branches; stock and printers are per
outlet), `org_domains`, tenant branding (logo, receipt header/footer).

## Stock (the "warehouse" part)
- `stock_movements` is an append-only ledger per outlet and ingredient
  product: `purchase`, `sale` (auto from recipe × qty sold), `waste`,
  `adjustment` (from a stock count), `transfer`.
- On-hand = Σ movements. Low-stock alerts per product.
- **Sale deduction runs in the same transaction as the order.** Theoretical
  usage vs counted stock shows the variance (theft, over-portioning).
- A purchase entry also records a new price in `product_prices`, so costing
  stays current without separate data entry.
- External "warehouse API": the same `/api/v1` with stock endpoints, for a
  central kitchen or another system.

## Proposed phase order
1. **Tenancy + branding:** outlets, `org_domains`, host-based routing,
   settings (name, logo, receipt text, timezone/cutover, tax).
2. **Menu + cashier POS + orders + void + sales recap:** FOKAS parity, cash.
3. **Printing + kitchen screen:** per-device bridge tokens.
4. **Costing:** ingredients/brands/prices, recipes, cost snapshot on sale,
   margin in the sales recap.
5. **Stock:** ledger, purchases, auto-deduction, counts, variance.
6. **FOKAS cutover:** migrate data, point the STB bridge at Pantrio,
   `pos.fokas…` domain. FOKAS repo becomes read-only.
7. Fixed costs + monthly P&L. QRIS (Midtrans) whenever FOKAS needs it, per
   tenant merchant keys.
8. Public API/SDK for third-party POSes; price search.

## Questions for the user
1. Main domain for the platform (`pantrio.app`? something else?). Is it on
   Vercel nameservers? Wildcard subdomains need that.
2. Do restaurants sign themselves up, or do you create each tenant (invite
   only)? Invite-only is simpler and safer to start.
3. Branches (outlets) now, or one outlet per restaurant to start (schema ready
   for more)?
4. OK to keep FOKAS running unchanged until cutover (phase 6)?
5. Billing tenants (subscriptions) now or later?
