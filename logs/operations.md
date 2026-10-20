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
1. Sign in at `https://<prod>/login` as the platform admin
   (wilsonhusen78@gmail.com — temporary password given in chat; change it at
   `/account` immediately).
2. `/admin` → New restaurant → name, address, owner login.
3. Owner signs in at `/o/<slug>/login` → Menu → Settings (tax, receipt) →
   Settings → Staff → Settings → Printers.

## Print bridge
See `bridge/README.md`. Each box gets a token from Settings → Printers.
