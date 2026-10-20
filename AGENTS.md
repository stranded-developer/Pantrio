# Pantrio

Multi-restaurant cashier POS + recipe costing, one product, one database
(ported from FOKAS, `../focas-pos-website`, cafe only). Public API/SDK for
third-party POSes later.

Read before changing anything:
- [docs/plan.md](docs/plan.md) — costing scope, domain model, tax, phases
- [docs/pos-multitenant.md](docs/pos-multitenant.md) — the POS + tenancy design
- [logs/decisions.md](logs/decisions.md) — decisions (P1–P22) and what was rejected.
  FOKAS's own `logs/decisions.md` (D1–D38) explains most POS rules.
- [logs/operations.md](logs/operations.md) — Supabase, migrations, Vercel, first run
- [logs/progress.md](logs/progress.md) — what exists and how it was verified

## Layout
- `apps/web` — Next.js 16.4 (App Router, **Cache Components on**, `proxy.ts`).
  Read `node_modules/next/dist/docs/` before Next-specific work.
  - `/o/[org]/…` tenant app (POS, orders, kitchen, sales, menu, settings);
    on a restaurant's own domain `proxy.ts` rewrites `/x` → `/o/<slug>/x`.
  - `/admin` backoffice (platform admins), `/login`, `/dashboard`, `/account`.
- `packages/core` — all money/cost/tax/date math. Pure, tested, mirrored by SQL.
- `packages/sdk` — client for third-party POSes.
- `bridge/` — receipt print bridge (device tokens).
- `supabase/migrations`, `supabase/tests` (SQL behaviour checks).

## Non-negotiables
- Money is integer rupiah; cost intermediates exact (`Q`), rounded once (P5).
  Till totals round on aggregates (FOKAS D13). `pos.ts` ≡ `create_order()`.
- Unknown cost is `null`, never `0` (P7).
- Every table has `org_id` + RLS; child FKs include `org_id` (P2).
- POS money writes are SQL functions taking identity from `auth.uid()` —
  never the secret key, never a client-supplied staff id (P22). Server re-prices (D8),
  idempotent (D10), snapshots name/price/cost/tax rules onto the order.
- Voids: manager, same business day, audited (D11). Never hard-delete menu items (D12).
- Auth checked in every page and action, not only layouts (P21); SQL is the boundary.
- No Server Action `redirect()` to a tenant path that needs the Host rewrite (P20).
- Print bridges use device tokens only (P18).
- A POS sale never calls an external service.

## Conventions
- Node 24 (`nvm use`), pnpm 11. `pnpm turbo run typecheck lint test build`.
- Session/DB reads sit inside `<Suspense>` or under a `loading.tsx`;
  `createClient()` (server) calls `connection()`.
- Links inside a tenant use `base` (`tenantBase()` / `useTenant()`), never a
  hard-coded `/o/<slug>`.
- Validate migrations on throwaway Postgres with `supabase/tests` before pushing.
