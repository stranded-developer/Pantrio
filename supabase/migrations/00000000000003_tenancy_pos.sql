-- Pantrio — tenancy + the cashier POS (ported from FOKAS, cafe only)
--
-- FOKAS references (../focas-pos-website): migrations 4, 8, 9, 11 and
-- logs/decisions.md. What carried over unchanged in spirit:
--   * money is bigint rupiah; writes are single-transaction functions (D7)
--   * the server re-prices from the database; clients send ids + qty (D8)
--   * idempotency via client_request_id (D10)
--   * voids: manager only, same business day, audit-logged (D11)
--   * menu items never hard-deleted (D12); prices snapshotted onto lines
--   * tax on subtotal + service, rounding on aggregates (D13)
--   * daily customer number + kitchen done (D35); print queue (D36)
-- What changed for multi-tenancy:
--   * every row has org_id; orders/printers/kitchen are per outlet (branch)
--   * functions take identity from auth.uid(), never a p_staff_id parameter,
--     so they run as the signed-in user — no secret key on the money path
--   * business day uses each org's timezone and cutover hour
--   * order_no is sequential per org; queue_no per outlet per business day
--   * print bridges authenticate with per-device tokens (P18), never the
--     secret key, and can only touch their own outlet's jobs
--   * tax settings: price inclusive/exclusive and PB1-on-service per org
--   * each line snapshots unit_cost (from Pantrio costing) for margin

-- ── Platform admins (backoffice) ─────────────────────────────────────────

create table platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table platform_admins enable row level security;

create function is_platform_admin() returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (select 1 from platform_admins where user_id = auth.uid())
  $$;

create policy "admins read admins" on platform_admins for select using (is_platform_admin());

-- ── Profiles (a person's name, shared across the orgs they work for) ─────

create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null,
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;

create function handle_new_auth_user() returns trigger
  language plpgsql security definer set search_path = public as $$
  begin
    insert into public.profiles (id, full_name)
    values (new.id, coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
                             split_part(new.email, '@', 1)));
    return new;
  end;
  $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

create function shares_org_with(p_user uuid) returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (
      select 1 from org_members a
        join org_members b on b.org_id = a.org_id
       where a.user_id = auth.uid() and a.active and b.user_id = p_user
    )
  $$;

create policy "read own profile" on profiles for select using (id = auth.uid());
create policy "read co-workers" on profiles for select using (shares_org_with(id));
create policy "update own profile" on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- ── The last active owner cannot be removed or demoted ───────────────────

create function org_members_keep_an_owner() returns trigger
  language plpgsql as $$
  declare v_org uuid := coalesce(old.org_id, new.org_id);
  begin
    if old.role = 'owner' and old.active
       and (tg_op = 'DELETE' or new.role <> 'owner' or not new.active)
       and not exists (
         select 1 from org_members
          where org_id = v_org and role = 'owner' and active and user_id <> old.user_id
       )
    then
      raise exception 'A restaurant needs at least one active owner';
    end if;
    return coalesce(new, old);
  end;
  $$;

create trigger org_members_keep_an_owner before update or delete on org_members
  for each row execute function org_members_keep_an_owner();

-- ── Org settings: business day, branding, receipt ────────────────────────

create function is_valid_timezone(tz text) returns boolean
  language sql stable as $$ select exists (select 1 from pg_timezone_names where name = tz) $$;

create table org_settings (
  org_id           uuid primary key references organizations(id) on delete cascade,
  timezone         text not null default 'Asia/Jakarta' check (is_valid_timezone(timezone)),
  -- Business day cutover (FOKAS D3): a late shift stays in one day's report.
  day_cutover_hour int not null default 5 check (day_cutover_hour between 0 and 23),
  receipt_header   text not null default '',
  receipt_footer   text not null default 'Terima kasih!',
  logo_url         text,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users(id) on delete set null
);
alter table org_settings enable row level security;
create trigger org_settings_updated before update on org_settings
  for each row execute function set_updated_at();

create policy "members read org settings" on org_settings
  for select using (is_org_member(org_id));
create policy "managers update org settings" on org_settings
  for update using (is_org_manager(org_id)) with check (is_org_manager(org_id));

create function business_date(ts timestamptz, tz text, cutover_hour int) returns date
  language sql immutable as $$
    select ((ts at time zone tz) - make_interval(hours => cutover_hour))::date
  $$;

create function org_business_date(p_org uuid, ts timestamptz default now()) returns date
  language sql stable security definer set search_path = public as $$
    select business_date(ts, timezone, day_cutover_hour) from org_settings where org_id = p_org
  $$;

-- ── Outlets (branches) ───────────────────────────────────────────────────

create table outlets (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null check (btrim(name) <> ''),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, org_id)
);
alter table outlets enable row level security;
create policy "members read outlets" on outlets for select using (is_org_member(org_id));
create policy "owners manage outlets" on outlets
  for all using (is_org_owner(org_id)) with check (is_org_owner(org_id));

-- ── Custom domains ───────────────────────────────────────────────────────
-- Written by the backoffice (service role) only; it also registers the
-- domain with Vercel. proxy.ts resolves Host → org via resolve_tenant_host().

create table org_domains (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  hostname   text not null unique
             check (hostname = lower(hostname) and hostname ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  created_at timestamptz not null default now()
);
alter table org_domains enable row level security;
create policy "members read domains" on org_domains for select using (is_org_member(org_id));

create function resolve_tenant_host(p_host text) returns text
  language sql stable security definer set search_path = public as $$
    select o.slug from org_domains d join organizations o on o.id = d.org_id
     where d.hostname = lower(split_part(p_host, ':', 1))
  $$;

-- Name + logo for a tenant's login page. Deliberately minimal: it confirms
-- a slug exists and shows its public name, nothing else.
create function tenant_public_info(p_slug text)
returns table (name text, slug text, logo_url text)
  language sql stable security definer set search_path = public as $$
    select o.name, o.slug, s.logo_url
      from organizations o left join org_settings s on s.org_id = o.id
     where o.slug = lower(p_slug)
  $$;

revoke execute on function resolve_tenant_host(text) from public;
revoke execute on function tenant_public_info(text) from public;
grant execute on function resolve_tenant_host(text) to anon, authenticated;
grant execute on function tenant_public_info(text) to anon, authenticated;

-- ── Menu ─────────────────────────────────────────────────────────────────

create table menu_categories (
  id     uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name   text not null check (btrim(name) <> ''),
  sort   int not null default 0,
  active boolean not null default true,
  unique (id, org_id)
);

create table menu_items (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  category_id     uuid not null,
  name            text not null check (btrim(name) <> ''),
  price           bigint not null check (price >= 0),
  sku             text,
  active          boolean not null default true,
  image_url       text,
  -- Costing link. unit_cost is computed by packages/core (P15) and cached
  -- here so a sale only copies a number; null = unknown (P7).
  recipe_id       uuid,
  unit_cost       bigint check (unit_cost >= 0),
  cost_updated_at timestamptz,
  created_at      timestamptz not null default now(),
  unique (id, org_id),
  foreign key (category_id, org_id) references menu_categories(id, org_id) on delete restrict,
  foreign key (recipe_id, org_id) references recipes(id, org_id) on delete set null (recipe_id)
);
create index menu_items_org_idx on menu_items(org_id, category_id);

alter table menu_categories enable row level security;
alter table menu_items enable row level security;
create policy "members read categories" on menu_categories for select using (is_org_member(org_id));
create policy "managers write categories" on menu_categories
  for all using (is_org_manager(org_id)) with check (is_org_manager(org_id));
create policy "members read menu" on menu_items for select using (is_org_member(org_id));
create policy "managers write menu" on menu_items
  for all using (is_org_manager(org_id)) with check (is_org_manager(org_id));

-- ── Orders ───────────────────────────────────────────────────────────────

create type order_status as enum ('open', 'awaiting_payment', 'paid', 'voided', 'refunded');
create type payment_provider as enum ('cash', 'midtrans', 'edc');
create type payment_method as enum ('cash', 'qris', 'va', 'card');
create type payment_status as enum ('pending', 'paid', 'expired', 'failed', 'refunded');
create type print_kind as enum ('receipt', 'reprint', 'kitchen');
create type print_status as enum ('queued', 'claimed', 'printed', 'failed');

create table orders (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete restrict,
  outlet_id         uuid not null,
  order_no          bigint not null,
  status            order_status not null default 'open',
  -- subtotal is always the pre-service, pre-PB1 base (DPP). With exclusive
  -- prices it equals the sum of lines; with inclusive prices it is backed out.
  subtotal          bigint not null default 0,
  discount_total    bigint not null default 0,
  service_total     bigint not null default 0,
  tax_total         bigint not null default 0,
  grand_total       bigint not null default 0,
  -- Σ unit_cost × qty; null when any line's cost is unknown (P7).
  cost_total        bigint,
  -- Tax rules in force at the sale, so a settings change never restates it.
  price_mode        price_mode not null,
  service_bps       int not null,
  tax_bps           int not null,
  pb1_on_service    boolean not null,
  business_date     date not null,
  client_request_id uuid not null,
  queue_no          int,
  priority          boolean not null default false,
  opened_by         uuid not null references auth.users(id),
  opened_at         timestamptz not null default now(),
  closed_at         timestamptz,
  kitchen_done_at   timestamptz,
  kitchen_done_by   uuid references auth.users(id),
  voided_at         timestamptz,
  voided_by         uuid references auth.users(id),
  void_reason       text,
  unique (id, org_id),
  unique (org_id, order_no),
  unique (org_id, client_request_id),
  foreign key (outlet_id, org_id) references outlets(id, org_id) on delete restrict
);
create unique index orders_outlet_day_queue_key on orders(outlet_id, business_date, queue_no)
  where queue_no is not null;
create index orders_org_day_idx on orders(org_id, business_date);
create index orders_kitchen_idx on orders(outlet_id, kitchen_done_at) where queue_no is not null;

create table order_items (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  order_id       uuid not null,
  menu_item_id   uuid,
  name_snapshot  text not null,
  qty            int not null check (qty > 0),
  unit_price     bigint not null check (unit_price >= 0),
  line_subtotal  bigint not null check (line_subtotal >= 0),
  unit_cost      bigint check (unit_cost >= 0),
  modifiers_json jsonb not null default '[]',
  voided         boolean not null default false,
  void_reason    text,
  foreign key (order_id, org_id) references orders(id, org_id) on delete cascade,
  foreign key (menu_item_id, org_id) references menu_items(id, org_id) on delete set null (menu_item_id)
);
create index order_items_order_idx on order_items(order_id);

create table payments (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  order_id        uuid not null,
  provider        payment_provider not null,
  method          payment_method not null,
  amount          bigint not null check (amount >= 0),
  status          payment_status not null default 'pending',
  provider_ref    text,
  amount_tendered bigint,
  change_given    bigint,
  paid_at         timestamptz,
  raw_response    jsonb,
  created_at      timestamptz not null default now(),
  foreign key (order_id, org_id) references orders(id, org_id) on delete restrict
);
create index payments_order_idx on payments(order_id);

-- ── Printing: devices with their own tokens (P18) ────────────────────────

create table print_devices (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  outlet_id    uuid not null,
  name         text not null check (btrim(name) <> ''),
  token_prefix text not null,
  token_hash   text not null unique,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  foreign key (outlet_id, org_id) references outlets(id, org_id) on delete cascade
);

create table print_jobs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  outlet_id    uuid not null,
  order_id     uuid,
  kind         print_kind not null,
  payload      jsonb not null default '{}',
  status       print_status not null default 'queued',
  attempts     int not null default 0,
  last_error   text,
  claimed_at   timestamptz,
  claimed_by   uuid references print_devices(id) on delete set null,
  printed_at   timestamptz,
  requested_by uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  foreign key (order_id, org_id) references orders(id, org_id) on delete cascade,
  foreign key (outlet_id, org_id) references outlets(id, org_id) on delete cascade
);
create index print_jobs_queue_idx on print_jobs(outlet_id, status, created_at);
create index print_jobs_order_idx on print_jobs(order_id, created_at desc);

-- Business data: members read; there are no write policies. Every write is
-- one of the functions below.
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;
alter table print_jobs enable row level security;
alter table print_devices enable row level security;
create policy "members read orders" on orders for select using (is_org_member(org_id));
create policy "members read order items" on order_items for select using (is_org_member(org_id));
create policy "members read payments" on payments for select using (is_org_member(org_id));
create policy "members read print jobs" on print_jobs for select using (is_org_member(org_id));
create policy "managers read print devices" on print_devices for select using (is_org_manager(org_id));

-- ═════════════════════════════════════════════════════════════════════════
-- Money functions. SECURITY DEFINER, identity from auth.uid(). Totals
-- mirror calculateOrderTotals() in packages/core/src/pos.ts exactly — the
-- tests there and supabase/tests encode the shared contract.
-- ═════════════════════════════════════════════════════════════════════════

create function create_order(
  p_org               uuid,
  p_outlet            uuid,
  p_client_request_id uuid,
  p_items             jsonb,
  p_amount_tendered   bigint,
  p_priority          boolean default false
) returns orders
language plpgsql security definer set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_existing orders;
  v_order    orders;
  v_tax      tax_settings;
  v_set      org_settings;
  v_item     jsonb;
  v_menu     menu_items;
  v_qty      int;
  v_lines    bigint := 0;
  v_cost     bigint := 0;
  v_costed   boolean := true;
  v_base     bigint;
  v_service  bigint;
  v_pb1      bigint;
  v_grand    bigint;
  v_day      date;
  v_order_no bigint;
  v_queue_no int;
  v_note     text;
begin
  if v_uid is null or org_role_of(p_org) is null then
    raise exception 'Not a member of this restaurant' using errcode = 'insufficient_privilege';
  end if;

  -- 1. Idempotency (D10): the same request id returns the same order.
  select * into v_existing from orders where org_id = p_org and client_request_id = p_client_request_id;
  if found then
    return v_existing;
  end if;

  if not exists (select 1 from outlets where id = p_outlet and org_id = p_org and active) then
    raise exception 'Unknown or inactive outlet';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  select * into v_tax from tax_settings where org_id = p_org;
  select * into v_set from org_settings where org_id = p_org;

  -- 2. Re-price from the database (D8).
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_menu from menu_items
     where id = (v_item->>'menu_item_id')::uuid and org_id = p_org;
    if not found then
      raise exception 'Menu item no longer exists';
    end if;
    if not v_menu.active then
      raise exception 'Menu item "%" is no longer available', v_menu.name;
    end if;
    v_qty := (v_item->>'qty')::int;
    if v_qty is null or v_qty <= 0 or v_qty > 999 then
      raise exception 'Invalid quantity for "%"', v_menu.name;
    end if;
    v_lines := v_lines + v_menu.price * v_qty;
    if v_menu.unit_cost is null then
      v_costed := false;
    else
      v_cost := v_cost + v_menu.unit_cost * v_qty;
    end if;
  end loop;

  -- 3. Totals. Rounding on aggregates, never per line (D13).
  if v_tax.price_mode = 'exclusive' then
    v_base    := v_lines;
    v_service := round(v_base::numeric * v_tax.service_bps / 10000)::bigint;
    v_pb1     := round((v_base + case when v_tax.pb1_on_service then v_service else 0 end)::numeric
                       * v_tax.pb1_bps / 10000)::bigint;
    v_grand   := v_base + v_service + v_pb1;
  else
    -- Prices include service and PB1: back the base out, and give the
    -- rounding remainder to PB1 so the parts always sum to what was charged.
    v_grand   := v_lines;
    v_base    := round(v_grand::numeric * 100000000
                       / (100000000 + v_tax.service_bps * 10000
                          + v_tax.pb1_bps * (10000 + case when v_tax.pb1_on_service then v_tax.service_bps else 0 end)))::bigint;
    v_service := round(v_base::numeric * v_tax.service_bps / 10000)::bigint;
    v_pb1     := v_grand - v_base - v_service;
  end if;

  if p_amount_tendered is null or p_amount_tendered < v_grand then
    raise exception 'Amount tendered is less than the total due';
  end if;

  v_day := business_date(now(), v_set.timezone, v_set.day_cutover_hour);

  -- 4. Numbers. Locks serialise numbering per org / per outlet-day and are
  --    released at commit.
  perform pg_advisory_xact_lock(hashtext('order_no'), hashtext(p_org::text));
  select coalesce(max(order_no), 0) + 1 into v_order_no from orders where org_id = p_org;

  perform pg_advisory_xact_lock(hashtext('queue_no:' || p_outlet::text), (v_day - date '2000-01-01'));
  select coalesce(max(queue_no), 0) + 1 into v_queue_no
    from orders where outlet_id = p_outlet and business_date = v_day;

  insert into orders (
    org_id, outlet_id, order_no, status, subtotal, service_total, tax_total, grand_total,
    cost_total, price_mode, service_bps, tax_bps, pb1_on_service, business_date,
    client_request_id, queue_no, priority, opened_by, closed_at
  ) values (
    p_org, p_outlet, v_order_no, 'paid', v_base, v_service, v_pb1, v_grand,
    case when v_costed then v_cost end, v_tax.price_mode, v_tax.service_bps, v_tax.pb1_bps,
    v_tax.pb1_on_service, v_day, p_client_request_id, v_queue_no, coalesce(p_priority, false),
    v_uid, now()
  ) returning * into v_order;

  -- 5. Lines, snapshotting name, price and cost.
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_menu from menu_items
     where id = (v_item->>'menu_item_id')::uuid and org_id = p_org;
    v_qty  := (v_item->>'qty')::int;
    v_note := nullif(btrim(coalesce(v_item->>'note', '')), '');
    insert into order_items (
      org_id, order_id, menu_item_id, name_snapshot, qty, unit_price, line_subtotal,
      unit_cost, modifiers_json
    ) values (
      p_org, v_order.id, v_menu.id, v_menu.name, v_qty, v_menu.price, v_menu.price * v_qty,
      v_menu.unit_cost,
      case when v_note is null then '[]'::jsonb
           else jsonb_build_array(jsonb_build_object('note', left(v_note, 200))) end
    );
  end loop;

  insert into payments (org_id, order_id, provider, method, amount, status, paid_at,
                        amount_tendered, change_given)
  values (p_org, v_order.id, 'cash', 'cash', v_grand, 'paid', now(),
          p_amount_tendered, p_amount_tendered - v_grand);

  -- Same transaction: a paid order without a receipt job cannot exist (D36).
  insert into print_jobs (org_id, outlet_id, order_id, kind, payload, requested_by)
  values (p_org, p_outlet, v_order.id, 'receipt', jsonb_build_object('order_id', v_order.id), v_uid);

  return v_order;
end;
$$;

-- Manager only, same business day only (D11). Enforced here, not just in UI.
create function void_order(p_order uuid, p_reason text) returns orders
language plpgsql security definer set search_path = public
as $$
declare
  v_order  orders;
  v_before jsonb;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to void an order';
  end if;

  select * into v_order from orders where id = p_order for update;
  if not found or org_role_of(v_order.org_id) is null then
    raise exception 'Order not found';
  end if;
  if not is_org_manager(v_order.org_id) then
    raise exception 'Only a manager or owner can void an order' using errcode = 'insufficient_privilege';
  end if;
  if v_order.status <> 'paid' then
    raise exception 'Only a paid order can be voided';
  end if;
  if v_order.business_date <> org_business_date(v_order.org_id) then
    raise exception 'Only same-day orders can be voided';
  end if;

  v_before := to_jsonb(v_order);

  update orders set status = 'voided', voided_at = now(), voided_by = auth.uid(),
                    void_reason = btrim(p_reason)
   where id = p_order returning * into v_order;
  update order_items set voided = true, void_reason = btrim(p_reason) where order_id = p_order;
  update payments set status = 'refunded' where order_id = p_order;

  insert into audit_log (org_id, actor, action, entity, entity_id, before, after)
  values (v_order.org_id, auth.uid(), 'void_order', 'orders', p_order, v_before, to_jsonb(v_order));

  return v_order;
end;
$$;

-- Kitchen Done / Undo (D35). Not money, but still scoped to the member's org.
create function set_kitchen_done(p_order uuid, p_done boolean) returns void
language plpgsql security definer set search_path = public
as $$
declare v_org uuid;
begin
  select org_id into v_org from orders where id = p_order and queue_no is not null;
  if v_org is null or org_role_of(v_org) is null then
    raise exception 'Order not found';
  end if;
  update orders
     set kitchen_done_at = case when p_done then now() end,
         kitchen_done_by = case when p_done then auth.uid() end
   where id = p_order;
end;
$$;

-- Another copy of a receipt, printed marked SALINAN / REPRINT.
create function queue_reprint(p_order uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare v_order orders;
begin
  select * into v_order from orders where id = p_order;
  if not found or org_role_of(v_order.org_id) is null then
    raise exception 'Order not found';
  end if;
  insert into print_jobs (org_id, outlet_id, order_id, kind, payload, requested_by)
  values (v_order.org_id, v_order.outlet_id, p_order, 'reprint',
          jsonb_build_object('order_id', p_order), auth.uid());
end;
$$;

-- ── Print devices: issue / revoke (managers) ─────────────────────────────

create function create_print_device(p_org uuid, p_outlet uuid, p_name text) returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare v_token text;
begin
  if not is_org_manager(p_org) then
    raise exception 'Only a manager or owner can add a printer' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from outlets where id = p_outlet and org_id = p_org) then
    raise exception 'Unknown outlet';
  end if;
  -- 192 random bits. Only the hash is stored; the token is shown once.
  v_token := 'pdt_' || encode(gen_random_bytes(24), 'hex');
  insert into print_devices (org_id, outlet_id, name, token_prefix, token_hash)
  values (p_org, p_outlet, btrim(p_name), left(v_token, 12), encode(digest(v_token, 'sha256'), 'hex'));
  insert into audit_log (org_id, actor, action, entity, after)
  values (p_org, auth.uid(), 'create_print_device', 'print_devices',
          jsonb_build_object('name', btrim(p_name), 'outlet_id', p_outlet));
  return v_token;
end;
$$;

create function revoke_print_device(p_device uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare v_org uuid;
begin
  select org_id into v_org from print_devices where id = p_device;
  if v_org is null or not is_org_manager(v_org) then
    raise exception 'Printer not found';
  end if;
  update print_devices set revoked_at = now() where id = p_device and revoked_at is null;
  insert into audit_log (org_id, actor, action, entity, entity_id)
  values (v_org, auth.uid(), 'revoke_print_device', 'print_devices', p_device);
end;
$$;

-- ── The bridge's entire API (called with the publishable key + a token) ──

create function device_from_token(p_token text) returns print_devices
language sql stable security definer set search_path = public, extensions
as $$
  select * from print_devices
   where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and revoked_at is null
$$;

-- Housekeeping as in FOKAS migration 9: a job claimed 2 min ago by a bridge
-- that died goes back to the queue; a job queued 15 min ago is failed, so a
-- bridge switched on in the evening doesn't print the whole afternoon.
create function device_claim_print_jobs(p_token text, p_limit int default 5)
returns table (id uuid, kind print_kind, order_id uuid, attempts int)
language plpgsql security definer set search_path = public
as $$
declare v_dev print_devices;
begin
  v_dev := device_from_token(p_token);
  if v_dev.id is null then
    raise exception 'Invalid or revoked device token' using errcode = 'insufficient_privilege';
  end if;
  update print_devices set last_seen_at = now() where print_devices.id = v_dev.id;

  update print_jobs j set status = 'queued', claimed_at = null, claimed_by = null
   where j.outlet_id = v_dev.outlet_id and j.status = 'claimed'
     and j.claimed_at < now() - interval '2 minutes';

  update print_jobs j set status = 'failed', last_error = 'Expired: not printed within 15 minutes'
   where j.outlet_id = v_dev.outlet_id and j.status = 'queued'
     and j.created_at < now() - interval '15 minutes';

  return query
    update print_jobs j set status = 'claimed', claimed_at = now(), claimed_by = v_dev.id
     where j.id in (
       select q.id from print_jobs q
        where q.outlet_id = v_dev.outlet_id and q.status = 'queued' and q.attempts < 5
        order by q.created_at
        limit least(greatest(coalesce(p_limit, 5), 1), 20)
        for update skip locked
     )
    returning j.id, j.kind, j.order_id, j.attempts;
end;
$$;

create function device_finish_print_job(p_token text, p_job uuid, p_ok boolean, p_error text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_dev print_devices;
begin
  v_dev := device_from_token(p_token);
  if v_dev.id is null then
    raise exception 'Invalid or revoked device token' using errcode = 'insufficient_privilege';
  end if;
  update print_jobs
     set status     = case when p_ok then 'printed'::print_status
                           when attempts + 1 >= 5 then 'failed'::print_status
                           else 'queued'::print_status end,
         printed_at = case when p_ok then now() end,
         attempts   = attempts + case when p_ok then 0 else 1 end,
         last_error = case when p_ok then null else left(p_error, 500) end,
         claimed_at = null
   where id = p_job and outlet_id = v_dev.outlet_id;
end;
$$;

-- Everything a receipt needs, for one order of this device's outlet only.
create function device_receipt_data(p_token text, p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_dev   print_devices;
  v_order orders;
begin
  v_dev := device_from_token(p_token);
  if v_dev.id is null then
    raise exception 'Invalid or revoked device token' using errcode = 'insufficient_privilege';
  end if;
  select * into v_order from orders where id = p_order and outlet_id = v_dev.outlet_id;
  if not found then
    raise exception 'Order not found for this printer';
  end if;

  return jsonb_build_object(
    'order', to_jsonb(v_order) - 'client_request_id' - 'cost_total'
             || jsonb_build_object('cashier', (select full_name from profiles where id = v_order.opened_by)),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                'name_snapshot', name_snapshot, 'qty', qty, 'unit_price', unit_price,
                'line_subtotal', line_subtotal, 'voided', voided, 'modifiers_json', modifiers_json)
                order by name_snapshot, id)
              from order_items where order_id = p_order), '[]'::jsonb),
    'payment', (select jsonb_build_object('method', method, 'amount_tendered', amount_tendered,
                                          'change_given', change_given)
                  from payments where order_id = p_order order by created_at limit 1),
    'settings', (select jsonb_build_object('receipt_header', receipt_header,
                                           'receipt_footer', receipt_footer, 'timezone', timezone)
                   from org_settings where org_id = v_order.org_id)
  );
end;
$$;

-- ── Sales recap (FOKAS migration 11) + cost of goods ─────────────────────
-- SECURITY INVOKER: RLS limits it to the caller's own org.

create function sales_summary(p_org uuid, p_from date, p_to date, p_outlet uuid default null)
returns jsonb
language sql stable security invoker set search_path = public
as $$
  with period_orders as (
    select * from orders
     where org_id = p_org and business_date between p_from and p_to
       and (p_outlet is null or outlet_id = p_outlet)
  ),
  paid as (select * from period_orders where status = 'paid'),
  tz as (select timezone from org_settings where org_id = p_org)
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'totals', (select jsonb_build_object(
        'orders',   count(*),
        'gross',    coalesce(sum(grand_total), 0),
        'subtotal', coalesce(sum(subtotal), 0),
        'service',  coalesce(sum(service_total), 0),
        'tax',      coalesce(sum(tax_total), 0),
        'discount', coalesce(sum(discount_total), 0),
        -- Cost only where every line was costed; coverage says how much.
        'cogs',            coalesce(sum(cost_total), 0),
        'costed_subtotal', coalesce(sum(subtotal) filter (where cost_total is not null), 0)
      ) from paid),
    'voided', (select jsonb_build_object('orders', count(*), 'amount', coalesce(sum(grand_total), 0))
                 from period_orders where status = 'voided'),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object(
                  'date', d::date, 'orders', coalesce(x.orders, 0), 'gross', coalesce(x.gross, 0))
                  order by d), '[]'::jsonb)
                 from generate_series(p_from, p_to, interval '1 day') d
                 left join (select business_date, count(*) orders, sum(grand_total) gross
                              from paid group by business_date) x on x.business_date = d::date),
    'by_hour', (select coalesce(jsonb_agg(jsonb_build_object('hour', hr, 'orders', orders, 'gross', gross)
                  order by hr), '[]'::jsonb)
                  from (select extract(hour from opened_at at time zone (select timezone from tz))::int hr,
                               count(*) orders, sum(grand_total) gross
                          from paid group by 1) h),
    'top_items', (select coalesce(jsonb_agg(jsonb_build_object(
                    'name', name_snapshot, 'qty', qty, 'revenue', revenue,
                    'cost', case when uncosted = 0 then cost end)
                    order by revenue desc, qty desc), '[]'::jsonb)
                    from (select oi.name_snapshot, sum(oi.qty) qty, sum(oi.line_subtotal) revenue,
                                 sum(oi.unit_cost * oi.qty) cost,
                                 count(*) filter (where oi.unit_cost is null) uncosted
                            from order_items oi join paid p on p.id = oi.order_id
                           where not oi.voided
                           group by oi.name_snapshot
                           order by sum(oi.line_subtotal) desc, sum(oi.qty) desc
                           limit 15) t),
    'by_method', (select coalesce(jsonb_agg(jsonb_build_object('method', method, 'orders', orders, 'amount', amount)
                    order by amount desc), '[]'::jsonb)
                    from (select pay.method::text method, count(*) orders, sum(pay.amount) amount
                            from payments pay join paid p on p.id = pay.order_id
                           where pay.status = 'paid' group by pay.method) m)
  );
$$;

-- ── Backoffice: create a restaurant (service role only) ──────────────────

create function admin_create_organization(p_name text, p_slug text, p_owner uuid)
returns organizations
language plpgsql security definer set search_path = public
as $$
declare v_org organizations;
begin
  insert into organizations (name, slug) values (btrim(p_name), lower(btrim(p_slug)))
    returning * into v_org;
  insert into org_settings (org_id, receipt_header) values (v_org.id, btrim(p_name));
  insert into tax_settings (org_id) values (v_org.id);
  insert into outlets (org_id, name) values (v_org.id, 'Main');
  insert into org_members (org_id, user_id, role) values (v_org.id, p_owner, 'owner');
  insert into audit_log (org_id, action, entity, entity_id, after)
  values (v_org.id, 'admin_create_organization', 'organizations', v_org.id, to_jsonb(v_org));
  return v_org;
end;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────
-- Supabase grants EXECUTE on new functions to anon and authenticated by
-- default. Tighten every one explicitly.

revoke execute on function create_order(uuid, uuid, uuid, jsonb, bigint, boolean) from public, anon;
revoke execute on function void_order(uuid, text) from public, anon;
revoke execute on function set_kitchen_done(uuid, boolean) from public, anon;
revoke execute on function queue_reprint(uuid) from public, anon;
revoke execute on function create_print_device(uuid, uuid, text) from public, anon;
revoke execute on function revoke_print_device(uuid) from public, anon;
revoke execute on function sales_summary(uuid, date, date, uuid) from public, anon;
grant execute on function create_order(uuid, uuid, uuid, jsonb, bigint, boolean) to authenticated;
grant execute on function void_order(uuid, text) to authenticated;
grant execute on function set_kitchen_done(uuid, boolean) to authenticated;
grant execute on function queue_reprint(uuid) to authenticated;
grant execute on function create_print_device(uuid, uuid, text) to authenticated;
grant execute on function revoke_print_device(uuid) to authenticated;
grant execute on function sales_summary(uuid, date, date, uuid) to authenticated;

revoke execute on function device_from_token(text) from public, anon, authenticated;
revoke execute on function device_claim_print_jobs(text, int) from public;
revoke execute on function device_finish_print_job(text, uuid, boolean, text) from public;
revoke execute on function device_receipt_data(text, uuid) from public;
grant execute on function device_claim_print_jobs(text, int) to anon;
grant execute on function device_finish_print_job(text, uuid, boolean, text) to anon;
grant execute on function device_receipt_data(text, uuid) to anon;

revoke execute on function admin_create_organization(text, text, uuid) from public, anon, authenticated;

-- ── Realtime: kitchen board, ready alerts, receipt status ────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table orders, print_jobs;
  end if;
end $$;
