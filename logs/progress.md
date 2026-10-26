# Progress

Newest first. What shipped, and **how it was verified** (separate claims).

---

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
