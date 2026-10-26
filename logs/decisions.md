# Decision log

Format follows FOKAS: decision, what was rejected, and why.
**PROPOSED** = awaiting user confirmation.

---

### P1 — Pantrio is a separate app and Supabase project, not part of FOKAS (PROPOSED)
It has to serve many restaurants and many POS systems. **Rejected:** building
it inside `focas-pos-website`, which would tie a multi-tenant product to one
venue's database, auth and RLS model.

### P2 — Multi-tenant from day one: `org_id` + RLS on every table (PROPOSED)
Retrofitting tenancy onto live data is the expensive kind of migration (same
reasoning as FOKAS D18).

### P3 — The POS owns name and selling price; Pantrio owns recipe and cost (PROPOSED)
Two-way price sync creates conflicts. Pantrio maps to POS items by
`external_id` and never writes prices back.

### P4 — A sale never calls Pantrio (PROPOSED)
The POS caches cost (webhook + nightly pull) and snapshots it onto the order
line. **Rejected:** a live cost lookup during checkout, which would make
Pantrio downtime block the till.

### P5 — Money as bigint minor units; fractional intermediates; round once per dish (PROPOSED)
Mirrors FOKAS D2/D13. Per-gram prices are fractional, and rounding each line
drifts.

### P6 — Prices are versioned by `effective_from`, append-only (PROPOSED)
Mirrors FOKAS D31: past costs never restate.

### P7 — Unknown cost is `null`, never `0` (PROPOSED)
A zero would read as a 100% margin.

### P8 — Overhead is not allocated per dish (CONFIRMED 2026-10-20, see P11)
Allocation depends on arbitrary volume assumptions. Overhead shows at
period/P&L level. "Fixed cost per dish" can be displayed, never stored.

### P9 — Monorepo: apps/web + packages/core + packages/sdk (CONFIRMED 2026-10-20)
So other POSes can install a typed SDK and reuse the cost math.

### P10 — Price search is on demand, cached and quota'd; no self-built marketplace scrapers (PROPOSED)
Shopee/Tokopedia ToS and anti-bot measures make DIY scraping fragile and
risky. Start with one SERP API, then add paid scraper APIs or affiliate APIs.
Normalise pack sizes with a small LLM structured-output call.

### P11 — Labour, electricity, rent are fixed monthly costs (CONFIRMED 2026-10-20)
User decision. Staff are entered **by name with a monthly wage** (wage history
versioned by `effective_from`). Rent, electricity, water, gas and others have a
**default monthly average** (versioned, so a change applies going forward
only) plus an optional **actual for a specific month** that overrides the
default for that month. Rent may be entered yearly and is shown monthly.
**Rejected:** per-dish labour minutes. Too much data entry for small
restaurants, and it gives false precision.
Dish cost = materials + packaging only (HPP). Fixed costs enter at the P&L.

### P12 — Margin before *and* after tax, Indonesian tax rules (CONFIRMED 2026-10-20)
User decision. Per-org tax settings: price inclusive/exclusive, PB1/PBJT rate
(default 10%, set per Perda), service charge rate plus whether it counts as
revenue, PB1-on-service (default on, matching FOKAS D13), and income tax mode
(default PPh Final UMKM 0.5% of turnover, or custom, or none).
PB1 is a pass-through and is **never** revenue or cost. It is backed out of
inclusive prices before any margin is calculated. "After tax" deducts income
tax. Defaults must be confirmed with a tax consultant; all rates are editable.

### P13 — Modifier costing deferred (CONFIRMED 2026-10-20)
User: later, a small addition. Schema leaves room (recipe variants keyed by
modifier).

### P14 — Dashboard writes go through the user's session; RLS is the boundary (DECIDED in build, 2026-10-20)
Unlike FOKAS, which writes money with the service role inside RPCs, Pantrio
has no till and no payments. Catalogue, recipe and cost edits are ordinary
writes as the signed-in user, and RLS (`is_org_member` / `is_org_manager` /
`is_org_owner`) decides. The service role is reserved for the public API
(phase 3), which scopes every query to the org of the API key. Multi-step
writes that must be atomic (`create_organization`) are still Postgres
functions.
Child tables reference parents by `(id, org_id)`, so cross-tenant references
are impossible even for code that bypasses RLS (verified as superuser).

### P15 — Cost math lives only in packages/core, not mirrored in SQL (DECIDED in build, 2026-10-20)
FOKAS mirrors its money math in SQL because the till and the database both
compute totals. In Pantrio only the server computes cost, so one
implementation (exact bigint fractions, `Q`) avoids two that can drift. SQL
stores inputs (prices, quantities, yields) and, from phase 3, computed
snapshots. Revisit if a report must aggregate cost inside Postgres.

### P16 — The cashier POS moves into Pantrio; one multi-tenant product (PROPOSED 2026-10-20)
User idea, recommended with conditions. Full proposal:
[docs/pos-multitenant.md](../docs/pos-multitenant.md). Sale + cost snapshot +
stock deduction become one transaction. Mahjong/split/booking not ported.
Conditions: FOKAS keeps running until parity, then a verified one-time data
migration; the print bridge moves from the secret key to per-device,
per-outlet tokens **before any second tenant**; Supabase Pro for backups.
Refines P1: Pantrio is still separate from the FOKAS *repo*, but it now
replaces FOKAS rather than sitting beside it. The public API (P4) stays for
third-party POSes.

### P17 — One Vercel project, many domains (PROPOSED 2026-10-20)
Wildcard subdomain per tenant plus optional custom domains via the Vercel
API; `proxy.ts` resolves Host → org. **Rejected as default:** a Vercel project
per tenant (N deploys, N rollbacks, fixes shipped N times) and a DB per tenant
(N migrations). A single-tenant deployment stays possible via env, for a
customer who requires isolation.

### P18 — STB print bridge: keep the secret key for now; device tokens before shared use (CONFIRMED 2026-10-20)
User: keep the current FOKAS STB setup as-is. Acceptable because FOKAS has its
own database holding one restaurant: the key on the box can only reach FOKAS
data. **Trigger for the fix:** the moment the bridge points at Pantrio's
shared database, it must stop using the secret key. Fix: each bridge gets its
own device token (issued and revoked from the dashboard), which only lets it
claim and finish print jobs for its own outlet. No other table access.

### P19 — Invite-only; owners create staff logins with a password (CONFIRMED 2026-10-20)
User: invite only. Restaurants are created in the backoffice (platform
admins) with an owner login; owners create staff logins (email + starting
password) in Settings → Staff — no email delivery needed, which matters
because Supabase's built-in mailer only reaches the project team. An email
that already has a login is *linked*, never re-passworded, since that person
may work for another restaurant. Public sign-up must be switched off in
Supabase Auth (logs/operations.md).

### P20 — Sign-in/out finish with a full navigation, not a Server Action redirect (2026-10-20)
Found in testing: a Server Action `redirect()` is rendered internally and
skips `proxy.ts`, so on a restaurant's own domain "/" rendered the platform
landing page. Sign-in returns the destination and the browser navigates.
Rule: no `redirect()` from a Server Action to a tenant path that relies on
the Host rewrite.

### P21 — Authorisation in every page, never only in a layout (2026-10-20)
Found in review: layouts and pages render in parallel, so a layout-only
platform-admin gate still let the page run its service-key queries. Every
backoffice page calls `requirePlatformAdminPage()`; every tenant page calls
`requireMembershipPage()` itself. Actions and SQL functions check again.

### P22 — POS writes run as the cashier, not the service key (2026-10-20)
FOKAS calls money RPCs with the secret key and a trusted `p_staff_id`. In a
multi-tenant system that parameter would let one tenant's server code act
as anyone. Pantrio's `create_order` etc. are SECURITY DEFINER functions that
take identity from `auth.uid()` and check membership themselves; the server
calls them with the user's session. The secret key is only for creating
logins and the backoffice (P14 extended).

### P23 — Backups: FOKAS's pg_dump method, run centrally and encrypted (2026-10-26)
User asked to keep FOKAS's nightly backup method. Kept: `pg_dump -Fc` of
public/auth/supabase_migrations, `pg_restore --list` check, 30 kept, 05:30
WIB. Changed: it runs in GitHub Actions, not on a restaurant's STB — the
Pantrio database holds every restaurant, so its password on one venue box
would expose all of them (same reasoning as P18). The repo is public, so each
dump is gpg-encrypted (AES-256) with a passphrase only the user holds before
upload. **Rejected:** STB-local full dumps (above); unencrypted artifacts
(downloadable by anyone with a GitHub account while the repo is public).
