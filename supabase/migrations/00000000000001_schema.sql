-- Pantrio — core schema
-- See docs/plan.md §3. Money is bigint rupiah (minor units); quantities are
-- numeric; ratios are integer basis points. Cost math lives in
-- packages/core (TypeScript) only — see logs/decisions.md P15.
--
-- Tenancy: every row carries org_id, and child→parent foreign keys include
-- org_id, so a recipe in one restaurant can never reference another
-- restaurant's product — not even through a bug in a Server Action.

create extension if not exists pgcrypto;

-- ── Enums ────────────────────────────────────────────────────────────────

create type org_role as enum ('owner', 'manager', 'cashier');
create type unit_code as enum ('mg', 'g', 'ons', 'kg', 'ml', 'l', 'pcs', 'lusin');
create type recipe_kind as enum ('menu_item', 'prep');
create type fixed_cost_category as enum ('rent', 'electricity', 'water', 'gas', 'internet', 'other');
create type cost_period as enum ('monthly', 'yearly');
create type price_mode as enum ('exclusive', 'inclusive');
create type income_tax_mode as enum ('pph_final_umkm', 'custom', 'none');

create function set_updated_at() returns trigger
  language plpgsql as $$
  begin
    new.updated_at = now();
    return new;
  end;
  $$;

-- ── Organisations ────────────────────────────────────────────────────────

create table organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (btrim(name) <> ''),
  slug       text not null unique check (slug ~ '^[a-z0-9](-?[a-z0-9])*$'),
  currency   text not null default 'IDR',
  created_at timestamptz not null default now()
);

create table org_members (
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       org_role not null default 'cashier',
  -- Deactivated, not deleted: their name stays on past orders (FOKAS D12).
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_idx on org_members(user_id);

-- Indonesian tax settings (decision P12). Defaults mirror
-- DEFAULT_TAX_SETTINGS in packages/core/src/tax.ts.
create table tax_settings (
  org_id                          uuid primary key references organizations(id) on delete cascade,
  price_mode                      price_mode not null default 'exclusive',
  pb1_bps                         int not null default 1000 check (pb1_bps between 0 and 10000),
  service_bps                     int not null default 0    check (service_bps between 0 and 10000),
  pb1_on_service                  boolean not null default true,
  service_is_revenue              boolean not null default false,
  income_tax_mode                 income_tax_mode not null default 'pph_final_umkm',
  income_tax_bps                  int not null default 50   check (income_tax_bps between 0 and 10000),
  income_tax_free_annual_turnover bigint not null default 0 check (income_tax_free_annual_turnover >= 0),
  updated_at                      timestamptz not null default now()
);
create trigger tax_settings_updated before update on tax_settings
  for each row execute function set_updated_at();

-- ── Suppliers & ingredients ──────────────────────────────────────────────

create table suppliers (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null check (btrim(name) <> ''),
  phone      text,
  notes      text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, org_id)
);

-- Generic material: "Tepung terigu", "Telur ayam".
create table ingredients (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null check (btrim(name) <> ''),
  category   text,
  notes      text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create unique index ingredients_org_name_idx on ingredients(org_id, lower(name));
create trigger ingredients_updated before update on ingredients
  for each row execute function set_updated_at();

-- Per-ingredient cross-dimension facts: 1 pcs = 55 g.
create table ingredient_conversions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  ingredient_id uuid not null,
  qty           numeric not null check (qty > 0),
  unit          unit_code not null,
  equals_qty    numeric not null check (equals_qty > 0),
  equals_unit   unit_code not null,
  foreign key (ingredient_id, org_id) references ingredients(id, org_id) on delete cascade
);

-- Brand-specific product as bought: "Segitiga Biru, 1 kg".
create table ingredient_products (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  ingredient_id uuid not null,
  brand         text,
  name          text not null check (btrim(name) <> ''),
  pack_qty      numeric not null check (pack_qty > 0),
  pack_unit     unit_code not null,
  yield_bps     int not null default 10000 check (yield_bps between 1 and 10000),
  supplier_id   uuid,
  source_url    text,
  sku           text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, org_id),
  foreign key (ingredient_id, org_id) references ingredients(id, org_id) on delete restrict,
  foreign key (supplier_id, org_id) references suppliers(id, org_id) on delete restrict
);
create index ingredient_products_ingredient_idx on ingredient_products(ingredient_id);
create trigger ingredient_products_updated before update on ingredient_products
  for each row execute function set_updated_at();

-- Append-only price history (P6). Never updated or deleted: a correction is
-- a new row, and the latest row for a date wins (created_at breaks ties).
create table product_prices (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  product_id     uuid not null,
  price          bigint not null check (price >= 0),
  effective_from date not null default current_date,
  note           text,
  recorded_by    uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  foreign key (product_id, org_id) references ingredient_products(id, org_id) on delete cascade
);
create index product_prices_lookup_idx on product_prices(product_id, effective_from desc, created_at desc);

-- Price in force for each product today.
create view current_product_prices with (security_invoker = true) as
  select distinct on (product_id) product_id, org_id, price, effective_from, created_at
    from product_prices
   where effective_from <= current_date
   order by product_id, effective_from desc, created_at desc;

-- ── Recipes ──────────────────────────────────────────────────────────────

create table recipes (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  kind       recipe_kind not null,
  name       text not null check (btrim(name) <> ''),
  yield_qty  numeric not null default 1 check (yield_qty > 0),
  yield_unit unit_code not null default 'pcs',
  notes      text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create trigger recipes_updated before update on recipes
  for each row execute function set_updated_at();

create table recipe_lines (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  recipe_id     uuid not null,
  sort          int not null default 0,
  product_id    uuid,
  sub_recipe_id uuid,
  qty           numeric not null check (qty > 0),
  unit          unit_code not null,
  waste_bps     int not null default 0 check (waste_bps between 0 and 10000),
  check ((product_id is null) <> (sub_recipe_id is null)),
  check (sub_recipe_id is distinct from recipe_id),
  foreign key (recipe_id, org_id) references recipes(id, org_id) on delete cascade,
  foreign key (product_id, org_id) references ingredient_products(id, org_id) on delete restrict,
  foreign key (sub_recipe_id, org_id) references recipes(id, org_id) on delete restrict
);
create index recipe_lines_recipe_idx on recipe_lines(recipe_id, sort);

-- A recipe may not (transitively) contain itself. Checked on write so the
-- costing code never meets a cycle in stored data.
create function recipe_lines_no_cycle() returns trigger
  language plpgsql as $$
  begin
    if new.sub_recipe_id is null then
      return new;
    end if;
    if exists (
      with recursive descendants(id, depth) as (
        select new.sub_recipe_id, 1
        union
        select rl.sub_recipe_id, d.depth + 1
          from recipe_lines rl
          join descendants d on rl.recipe_id = d.id
         where rl.sub_recipe_id is not null and d.depth < 50
      )
      select 1 from descendants where id = new.recipe_id
    ) then
      raise exception 'A recipe cannot contain itself' using errcode = 'check_violation';
    end if;
    return new;
  end;
  $$;

create trigger recipe_lines_no_cycle before insert or update on recipe_lines
  for each row execute function recipe_lines_no_cycle();

-- ── Fixed monthly costs (P11) ─────────────────────────────────────────────
-- Months are stored as the first day of the month.

create table staff_members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null check (btrim(name) <> ''),
  role       text,
  end_month  date check (end_month = date_trunc('month', end_month)::date),
  created_at timestamptz not null default now(),
  unique (id, org_id)
);

create table staff_wages (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  staff_id       uuid not null,
  monthly_wage   bigint not null check (monthly_wage >= 0),
  effective_from date not null check (effective_from = date_trunc('month', effective_from)::date),
  created_at     timestamptz not null default now(),
  unique (staff_id, effective_from),
  foreign key (staff_id, org_id) references staff_members(id, org_id) on delete cascade
);

create table fixed_costs (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null check (btrim(name) <> ''),
  category   fixed_cost_category not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, org_id)
);

create table fixed_cost_rates (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  fixed_cost_id  uuid not null,
  amount         bigint not null check (amount >= 0),
  period         cost_period not null default 'monthly',
  effective_from date not null check (effective_from = date_trunc('month', effective_from)::date),
  created_at     timestamptz not null default now(),
  unique (fixed_cost_id, effective_from),
  foreign key (fixed_cost_id, org_id) references fixed_costs(id, org_id) on delete cascade
);

create table fixed_cost_actuals (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  fixed_cost_id uuid not null,
  month         date not null check (month = date_trunc('month', month)::date),
  amount        bigint not null check (amount >= 0),
  created_at    timestamptz not null default now(),
  unique (fixed_cost_id, month),
  foreign key (fixed_cost_id, org_id) references fixed_costs(id, org_id) on delete cascade
);

-- ── POS integration (phase 3; shape fixed now, D18-style) ────────────────

create table pos_connections (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  name           text not null,
  provider       text not null default 'custom',
  -- API key: shown once, stored as sha256 hex. Prefix kept for display.
  api_key_prefix text not null,
  api_key_hash   text not null unique,
  webhook_url    text,
  -- Needed in clear to sign outbound webhooks. Owner-only via RLS; move to
  -- Supabase Vault before phase 3 ships (see docs/plan.md §4).
  webhook_secret text,
  created_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  unique (id, org_id)
);

-- POS menu items as the POS reports them (POS owns name/price, P3).
create table external_menu_items (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  connection_id uuid not null,
  external_id   text not null,
  name          text not null,
  selling_price bigint not null check (selling_price >= 0),
  category      text,
  active        boolean not null default true,
  recipe_id     uuid,
  updated_at    timestamptz not null default now(),
  unique (connection_id, external_id),
  foreign key (connection_id, org_id) references pos_connections(id, org_id) on delete cascade,
  foreign key (recipe_id, org_id) references recipes(id, org_id) on delete set null (recipe_id)
);
create trigger external_menu_items_updated before update on external_menu_items
  for each row execute function set_updated_at();

-- ── Audit ────────────────────────────────────────────────────────────────

create table audit_log (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references organizations(id) on delete cascade,
  actor     uuid references auth.users(id) on delete set null,
  action    text not null,
  entity    text not null,
  entity_id uuid,
  before    jsonb,
  after     jsonb,
  at        timestamptz not null default now()
);
create index audit_log_org_idx on audit_log(org_id, at desc);
