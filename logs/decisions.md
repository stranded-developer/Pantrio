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

### P24 — Custom roles with permission checkboxes; owners stay special (2026-10-26)
User asked for per-role permissions and custom roles. `org_roles` holds a
name + permission list per restaurant; non-owner members point at one.
Defaults "Manager" (all) and "Cashier" (POS, Orders, Kitchen) reproduce the
old enum roles, so the migration changed nobody's access. Owners always
have everything and alone manage staff, roles and branches — **rejected:**
a "manage roles" permission, since its holder could grant themselves
anything. Enforced in SQL via `has_perm()` in every write policy and money
function (`create_order` needs pos.sell, `void_order` orders.void, …); pages
redirect to the member's first allowed screen; nav hides the rest. Wages
are visible only to roles with Profit. Owners can rename staff who work
only for their restaurant (`owner_rename_member`). Menu cost re-costing and
recipe linking go through `set_menu_costs` / `link_menu_recipe` so Recipes /
Ingredients editors don't need Menu permission.

### P25 — Registered terminals, PIN sign-in, time clock with photos (2026-11-05)
User asked for clock in/out "only on the main device", with staff using
their own identity and an auto-logout, and asked to go straight to PIN
switching for sales, plus a buddy-punch photo. Decided:
- **The device is trusted, not an owner login.** A member with
  `timesheets.manage` registers a browser (laptop or iPad) as a *terminal*
  for one branch: a random token in an httpOnly cookie, only its hash
  stored, revoked from Settings → Terminals (any time, by the restaurant —
  not only by Pantrio). The token alone opens nothing but the PIN pad.
  iPad note: a home-screen web app has its own cookies, so register from
  inside the app that will be used.
- **PIN sign-in mints a normal session.** On a terminal, `/login` shows a
  PIN pad. `terminal_pin_sign_in()` (service role only, never PostgREST
  callable by anon) checks terminal + PIN; the server then mints a session
  for that person with `auth.admin.generateLink` → `verifyOtp` (no email is
  sent). Everything after runs as that person exactly as today, so P22 holds:
  `create_order`, `void_order` etc. still take identity from `auth.uid()`
  and nothing on the money path changed. The secret key is used only to
  mint the session after SQL said yes (P14/P22 extended).
  **Rejected:** a terminal-scoped "acting staff" id passed to every money
  function (rewrites P22 and every function); owner logged in permanently
  on the till (any cashier gets owner powers).
- **PINs:** 4–6 digits, unique per restaurant (so no name picking), set by
  the owner in Settings → Staff, stored as sha256(org:pin) in a table no
  client can read. 5 wrong PINs within 15 minutes lock that terminal for 15
  minutes and are audit-logged. Known limit: a 4-digit PIN is guessable by
  someone standing at the till for hours — the lockout and the audit trail
  are the defence; owners can choose 6 digits.
- **Idle lock, not a PIN every 15 minutes.** On a terminal the session is
  signed out after N idle minutes (default 5, per restaurant) and optionally
  after every sale; the next person enters their PIN. Off a terminal
  (phone, home laptop) nothing changes.
- **Time clock:** clock in/out only with a terminal token, time is the
  database's `now()`, branch is the terminal's. A webcam photo is taken at
  clock in/out (private bucket, visible only to `timesheets.manage`); if the
  camera is unavailable the entry is kept and marked "no photo".
- **Forgotten clock-out:** an open shift from an earlier business day is
  marked `missing_out` (hours unknown, P7 spirit — never guessed). Managers
  correct it; every edit is audit-logged with before/after, and a manager
  cannot edit their own entries (owners can).

### P26 — Till staff are PIN-only; Lock ≠ Clock out; hard lock after repeated wrong PINs (2026-11-05)
User, after testing P25: less confusing, and security should rest on the PIN
+ registered device. Decided:
- **Lock and Clock out are separate.** Lock (also the idle / after-sale
  lock) hands the till over and keeps the shift open; Clock out ends the
  shift (photo) and locks. **Rejected:** "logging out clocks you out" — the
  till locks itself many times a shift, which would chop hours into pieces.
- **Staff without "can sign in away from the till" have no password.** New
  staff are created with name, role and PIN; Pantrio gives them a hidden
  address that cannot receive mail and a random password nobody sees.
  Owners always have email + password; a role can be ticked "can sign in
  away from the till" (Manager by default). Moving someone onto a PIN-only
  role switches their password off and ends their sessions — except people
  who also work for another restaurant, whose login is shared.
- **No email sign-in on a terminal's PIN screen.**
- **Wrong PINs (user's rule):** 5 wrong in a row → the terminal is locked.
  It unlocks only when an owner's password is **reset** — by the reset
  email the locked screen can send to the owners, or by a platform admin in
  the backoffice. The reset itself unlocks that restaurant's terminals.
  **Rejected:** unlocking with the current owner password or an "Unlock"
  button — whoever can already sign in may be the one guessing (user:
  "if they can login they know password already"); a timed pause.
  Needs custom SMTP for the email route (built-in mail only reaches the
  Supabase team); the backoffice route works without it.

### P27 — Menu discounts: % or Rp off, chosen items or all, automatic in their window (2026-11-06)
User: discount days with checkboxes per menu item (or all). Decided:
- A discount is **percent** (bps) or a **fixed rupiah amount off each
  unit**, on chosen menu items or **all items**, from a start date to an
  optional end date, optionally only on chosen weekdays.
- **Automatic**: create_order applies it on the order's business day; the
  cashier can't add or skip one. The till shows the discounted prices.
- Overlapping discounts don't stack: each line gets the **largest** one.
- Rounded once per line (half away from zero); a fixed amount never takes a
  line below 0. Service and PB1 are on the price **after** discount
  (usual Indonesian treatment; confirmed by the user).
- Each line snapshots `unit_price` (menu price), `line_discount` and the
  discount; `line_subtotal` is after discount, so Sales and margins use the
  money actually charged; ingredient cost is unchanged.
- Managed by roles with Menu permission (menu.manage).
- pos.ts mirrors create_order (lineDiscount / bestDiscount).
