# Progress

Newest first. What shipped, and **how it was verified** (separate claims).

---

## 2026-10-26 (d) — Roles & permissions, staff rename, receipt preview

- Migration 8 (live): `org_roles`, `has_perm()`, every policy/function on
  permissions; FOKAS and Kawa got Manager (11) + Cashier (3); owners intact.
- Settings → Roles (owners): checkbox grid per role, new/rename/delete
  (refused while in use). Staff: role picker lists roles; Rename.
- Pages/actions use `requirePermPage` / `requireMembership(slug, perm)`;
  sign-in lands on the first allowed screen; `/no-access` when a role opens
  nothing.
- Settings → Receipt: live preview drawn from `bridge/receipt.mjs`.
- Verified: SQL checks 35 (custom role limits, no self-escalation, role in
  use kept, rename rules); browser on prod build + live DB (throwaway
  tenant, deleted): Kitchen role lands on /kitchen and is bounced from /pos
  and /sales; Cashier + Ingredients sees exactly POS/Orders/Kitchen/
  Ingredients and can add an ingredient but not open Menu; rename shows in
  the header; empty role → no-access.

## 2026-10-26 (c) — Profit screen, logos everywhere, receipt logo

### Delivered
- **Profit** (`/o/<slug>/profit`, managers): month stepper; net sales (excl.
  PB1; service per settings), ingredient cost (HPP), gross profit, wages,
  rent/bills, profit before tax, income tax (PPh with the yearly tax-free
  band using year-to-date sales), profit after tax, break-even. Coverage
  warning when sales lack costed recipes. Staff wages by name with raises
  from a month; "Left" ends pay after a month. Fixed costs with a usual
  monthly or yearly amount (versioned by month; 0 = stopped) and a
  one-month "actual" override. Past months never restate (P11).
- **Logos** (Settings → Logo, migration 7): main logo (till header), logo
  for dark screens (login, kitchen; else main logo on a white badge), and a
  receipt logo made in the browser as 1-bit PBM (darkness slider, preview,
  ≤ 320 dots, blank rows trimmed). Files in the public `logos` bucket under
  `<org_id>/`, writable only by that restaurant's managers.
- **Bridge**: `LOGO=auto` (default) downloads the receipt logo from
  `device_receipt_data`, cached until its URL changes; failure prints a text
  header. Receipt layout unchanged from FOKAS.
- FOKAS restaurant got its real logos (dark/light PNG + the FOKAS bridge's
  `logo.pbm`).

### Verification
- Browser, production build, live DB, throwaway tenant (deleted with its
  files): two wages + yearly rent + PLN with an actual → wages 5.500.000,
  other 7.350.000, profit before tax −12.825.000, after tax −12.825.125,
  break-even 12.850.000 (hand-worked); previous month 0; coverage warning;
  logos uploaded via the UI, receipt logo 320×104, header and login show
  the right variant.
- Bridge dry-run on the live DB: "Receipt logo loaded (320x104)", logo
  printed in place of the header line.

## 2026-10-26 (b) — Ingredients & Recipes (costing UI)

### Delivered
- **Ingredients** (`/o/<slug>/ingredients`, managers): ingredient → brands /
  packs (size, unit incl. ons/lusin, usable %, supplier) → prices as
  append-only history with an effective date (upcoming prices shown),
  price per kg / L / pcs, per-ingredient conversions (1 pcs = 55 g),
  suppliers, hide/show.
- **Recipes** (`/o/<slug>/recipes`): every menu item with cost per portion,
  food cost % (green / amber > 35% / red > 40%), margin before and after
  income tax; "Create recipe" links a recipe to the menu item. Prep
  (sub-)recipes with batch yield and cost per unit.
- **Recipe editor**: lines from brands or prep recipes, amount, unit,
  waste %; live cost per line, per batch, per portion and margin, computed
  in the browser with the same `@pantrio/core` engine; missing prices /
  conversions listed by name; save is one transaction (`save_recipe`,
  migration 6, RLS-bound).
- Any change to prices, products, conversions or recipes re-costs the menu
  (`recomputeMenuCosts`) → `menu_items.unit_cost` → snapshotted by
  `create_order` on each sale → Sales / Menu margins.
- Fix: a recipe with **no ingredients** now counts as unknown cost, not Rp 0
  / 100% margin (core + test).

### Verification
- core 33 tests (+empty recipe); SQL checks 30 (+save_recipe atomic on a
  cycle error, cashier refused).
- Browser, production build, live DB, throwaway tenant (deleted after):
  beans Rp 250.000/kg 18 g + milk Rp 20.000/L 150 ml (5% waste) + syrup
  prep (500 g gula aren Rp 30.000/kg → Rp 15.000/L) 20 ml = **Rp 7.950**,
  31,8% food cost, 68,2% margin, 67,7% after PPh — matched hand-worked
  figures in the editor, recipes list and menu; a sale recorded cost
  Rp 7.950 and Sales showed 68,2% / 100% coverage; raising beans to
  Rp 300.000 re-costed the menu to Rp 8.850 (35,4%) while the earlier sale
  kept Rp 7.950; an empty recipe showed "unknown".
- Test note: with Cache Components, Next keeps the previous page mounted
  but hidden (React Activity) — e2e selectors must use `:visible`.

## 2026-10-26 — FOKAS restaurant, backoffice links, backups

- FOKAS created in Pantrio (`/o/fokas`, owner login made via the auth admin
  API + `admin_create_organization`, verified by signing in). Starts empty —
  FOKAS was never in production, so nothing was migrated.
- Backoffice lists each restaurant's login link (copy button); the
  restaurant page shows login / kitchen / own-domain links.
- Nightly encrypted backup workflow (P23). Verified locally against the live
  DB: dump 286 KB, 664 objects, 58 tables with data; gpg round trip
  identical, wrong passphrase refused. **Not yet run on GitHub** — needs the
  two secrets.
- Repo found to be **public**; personal email removed from docs (it remains
  in earlier commits until the repo is made private).

## 2026-10-20 (c) — Live on Vercel

- Deployed: https://pantrio-zeta.vercel.app, functions in `sin1`, root
  `apps/web`, Node 24, env vars set (Production + Preview).
- **Verified on production** with a browser, test data deleted afterwards:
  platform admin login → backoffice; secret key works (restaurant + owner
  login created from the backoffice); owner login on `/o/<slug>/login`;
  owner creates a cashier login; menu + sale (10.000 + PB1 10% = 11.000);
  cashier login with limited nav.
- Fixed: the platform login swapped a Suspense fallback form for the real
  one, wiping typed credentials; `?next=` is now read in the browser.
- Sign-up disabled (verified `disable_signup: true`); admin password changed (old one rejected).

---

## 2026-10-20 (b) — Multi-tenant cashier POS (FOKAS port), backoffice, printers

### Decided with the user
- Build the POS inside Pantrio as one multi-tenant product (P16); one Vercel
  project, many domains (P17); invite-only (P19); branches from day one, one
  "Main" branch by default; subscriptions later; FOKAS stays as-is until
  cutover. STB: FOKAS keeps the secret key for now; Pantrio bridges use
  device tokens (P18).
- Supabase moved to **Singapore** (`lmtlsjqixpsfjnuhbcet`).

### Delivered
- Migrations 3–5 (live): platform admins, profiles, org settings (timezone,
  cutover, receipt, logo), outlets, custom domains, menu, orders/items/
  payments, print devices + jobs; functions `create_order`, `void_order`,
  `set_kitchen_done`, `queue_reprint`, `create/revoke_print_device`,
  `device_claim_print_jobs` / `device_receipt_data` /
  `device_finish_print_job`, `sales_summary` (+COGS), `admin_create_organization`,
  `resolve_tenant_host`, `tenant_public_info`, account helpers; last-owner guard.
- `packages/core`: `calculateOrderTotals` (exclusive *and* inclusive prices,
  PB1-on-service switch), tenders, business date per timezone, periods.
- `apps/web`: restaurant login, POS terminal, orders + detail (void, reprint,
  live print status), kitchen screen, ready alerts, sales recap (+ingredient
  cost, gross margin, coverage), menu manager (+cost per dish), settings
  (tax & service with live preview, business day, branding, receipt text,
  staff, printers, branches), account page, dashboard, **backoffice**
  (restaurants, owner logins, custom domains via Vercel API).
  `proxy.ts`: Host → restaurant rewrite, session refresh.
- `bridge/`: FOKAS bridge on device tokens, polling, inclusive receipts,
  timezone-aware, zero dependencies.

### Verification
- core 32 tests, sdk 4, bridge 12 (receipt layout incl. inclusive + WITA time).
- `supabase/tests/pos_checks.sql` on throwaway Postgres 17: 27 checks — totals
  (exclusive 78.540; inclusive 57.750→50.000/2.500/5.250; 33.333 remainder
  case), idempotency, numbering, cross-org denial for every function, cashier
  limits, void rules + audit, sales summary + COGS, device isolation (claims
  only own outlet, cannot read/finish another's), revoke, last-owner guard,
  restaurant delete, inactive member lockout, host lookup.
  TS and SQL agree on the same fixtures.
- Live grants checked: anon can only call device + lookup functions; RLS on
  every table; Realtime on orders + print_jobs.
- **Playwright against the live DB, production build** (`next start`), test
  tenant seeded then deleted: 17 checks — owner login, menu, cart total with
  5% service + 10% PB1, pay + change, priority order, orders list, void,
  kitchen (voided excluded, Done), printer token, sales, settings preview,
  owner gets no backoffice data, cashier nav/route limits, dashboard
  redirect. Custom domain via Host mapping: branded login, clean URLs,
  unknown domain 404, spoofed tenant header ignored.
- Bridge dry-run against the live DB with the issued token printed both
  receipts (voided one marked DIBATALKAN); a wrong token is refused.
- Bugs found and fixed by these runs: backoffice gate was layout-only (pages
  render in parallel — now checked in every page, P21); Server Action
  redirects skip proxy.ts so custom-domain login landed on the platform page
  (now a full navigation, P20); `crypto.randomUUID` missing on plain http
  (fallback); last-owner guard blocked deleting a restaurant (migration 5);
  Geist font variable mismatch.
- **Not verified yet:** creating staff/restaurants through the UI (needs
  `SUPABASE_SECRET_KEY`), Vercel domain API calls (needs a token), a real
  printer over USB/LAN with the new bridge, iPad Safari.

### Next
1. User: Supabase Auth → disable sign-ups; add the secret key to Vercel +
   `.env.local`; create the Vercel project (root `apps/web`); change the admin
   password.
2. Costing UI (ingredients → brands → prices → recipes → menu `unit_cost`).
3. Stock ledger + sale deduction. 4. FOKAS data migration + STB cutover.

---

## 2026-10-20 (a) — Phase 0 scaffold

Monorepo, `packages/core` costing/tax/P&L math (21 tests), `packages/sdk`
(4 tests), migrations 1–2 (costing schema + RLS), web shell. See git history.
