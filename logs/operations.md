# Operations

## Supabase project
- Project `lmtlsjqixpsfjnuhbcet`, region **ap-southeast-1 (Singapore)**,
  Postgres 17. (A Tokyo project was created first and abandoned empty — delete it.)
- The direct DB host is IPv6-only; from IPv4 networks use the **session pooler**:
  `aws-0-ap-southeast-1.pooler.supabase.com:5432`, user `postgres.lmtlsjqixpsfjnuhbcet`.

### Auth settings (dashboard → Authentication) — do these
- **Sign In / Providers → Email → "Allow new users to sign up": OFF.** Pantrio is
  invite-only (P19); accounts are created by the backoffice and by owners
  (admin API works with sign-ups off). With it on, anyone holding the public
  key could create a login (it would have no restaurant, but still).
- URL Configuration → Site URL: the production URL. Redirect URLs: add
  `https://<prod>/auth/confirm` and each custom domain's `/auth/confirm`.
- Built-in email only reaches your own team's addresses. Nothing in Pantrio
  needs email today; set up custom SMTP (e.g. Resend) before adding
  "forgot password".

## Migrations
1. Write `supabase/migrations/0000000000000N_name.sql`.
2. Validate on a throwaway Postgres (needs Docker):
   ```bash
   docker run -d --name pantrio-pgtest -e POSTGRES_PASSWORD=x postgres:17
   for f in supabase/tests/auth_stub.sql supabase/migrations/*.sql; do
     docker exec -i pantrio-pgtest psql -q -v ON_ERROR_STOP=1 -U postgres < $f; done
   docker exec -i pantrio-pgtest psql -q -t -U postgres < supabase/tests/pos_checks.sql | grep -E "ok|FAIL|expect"
   docker rm -f pantrio-pgtest
   ```
   Every line must be `ok …` or an `(expect N): N` that matches; no `FAIL`.
3. Push: `npx supabase db push --db-url "$SUPABASE_DB_URL"`.
4. Types: `pnpm --filter @pantrio/web types:db`.

## Vercel (one project, all restaurants — P17)
- Live: **https://pantrio-zeta.vercel.app** (project `pantrio`, team
  strandeddevelopers-projects; GitHub `stranded-developer/Pantrio`, `main` deploys).
- Import the GitHub repo. **Root Directory: `apps/web`** (leave "include files
  outside root" on — it needs `packages/*`). Framework: Next.js. Node 24.
- Functions run in `sin1` (`apps/web/vercel.json`), next to the database.
- Environment variables: see `apps/web/.env.example`. Required:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SECRET_KEY` (Production + Preview).
- Custom domain per restaurant: Backoffice → restaurant → Connect domain.
  With `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` set it is added to the project
  automatically; otherwise also add it in Vercel → Domains. The restaurant
  sets the DNS shown (CNAME → `cname.vercel-dns.com`, or A → 76.76.21.21 for
  an apex domain).
- Your own platform domain later: add it to the project and to `PLATFORM_HOSTS`.

## First run
1. Sign in at `https://<prod>/login` with the platform-admin account.
2. `/admin` → New restaurant → name, address, owner login.
3. Owner signs in at `/o/<slug>/login` → Menu → Settings (tax, receipt) →
   Settings → Staff → Settings → Printers.

## Backups (P23)
Nightly at 05:30 WIB by GitHub Actions (`.github/workflows/db-backup.yml`):
`pg_dump -Fc` of `public`, `auth`, `supabase_migrations` (FOKAS's method),
verified with `pg_restore --list`, **encrypted (AES-256, gpg)**, kept 30 days
as workflow artifacts.

- Secrets in GitHub → Settings → Secrets and variables → Actions:
  `SUPABASE_DB_URL` (session pooler URL with password) and
  `BACKUP_PASSPHRASE` (16+ chars, in the password manager — a backup cannot
  be opened without it). **Reset the DB password → update `SUPABASE_DB_URL`**,
  or backups stop (the run fails and GitHub emails you).
- Run one now: Actions → Database backup → Run workflow.
- Restore: download the artifact, `scripts/restore-backup.sh <file>.dump.gpg
  [new-db-url]` — into a fresh project, never over live data.
- Not on restaurant STBs: one box would then hold the password to every
  restaurant's data.
- Later: Supabase Pro adds daily backups + point-in-time restore on top.

## Print bridge
See `bridge/README.md`. Each box gets a token from Settings → Printers. The
receipt logo comes from Settings → Logo automatically (`LOGO=auto`).

Never put the Supabase secret key or DB password on a venue box (P18, P23);
backups run centrally (see Backups).

### Venue boxes
| Restaurant | Host | IP | MAC | Printer | Notes |
|---|---|---|---|---|---|
| FOKAS (old FOKAS DB) | `aml-s9xx-box` | 192.168.100.28 | 62:42:d7:0e:df:2b | `/dev/usb/lp0` (Panda PRJ-R58D, 58mm) | Still runs `focas-bridge` + `focas-backup` for the FOKAS repo; switch to `pantrio-bridge` when FOKAS goes live on Pantrio. |

### New STB — who does what (`/setup-stb`)
Split decided 2026-10-26: Wilson does only what needs hands or a password;
Claude does the rest over SSH from the Mac (same network as the box).

1. **Wilson — plug in:** Armbian flashed (plain image), power (5V 2A), LAN
   cable to the router/modem, printer by USB, paper loaded.
2. **Claude — find the box:** scan the LAN from the Mac, report its IP.
3. **Wilson — first login** (interactive, Claude can't type into it):
   `ssh root@<ip>` → set the root password (password manager) → exit →
   `ssh-copy-id root@<ip>`. Never give Claude the password.
4. **Claude — set up:** timezone, Node 24 (NodeSource), rsync, check
   `/dev/usb/lp0` (`modprobe usblp` if missing), install bridge + systemd
   unit per `bridge/README.md`.
5. **Token** — Settings → Printers → Add printer (shown once). Either Claude
   fetches it in Chrome (token then sits in the chat transcript; revocable,
   branch-scoped) or Wilson pastes it into `/etc/pantrio-bridge.env` directly.
   Replacing a box → Revoke the old one on the same page.
6. **Claude — start + check:** restart service, read `journalctl -u
   pantrio-bridge`, confirm it's polling and the printer is reachable.
7. **Wilson — test print:** one small POS payment, check the paper.
8. **Claude — finish:** report MAC for a DHCP reservation (Wilson sets it on
   the modem), record hostname/IP/MAC/printer here.
