-- Table service (decision P29, docs/table-service.md). One switch per
-- branch. Off (FOKAS): every sale is create_order, paid at once — unchanged.
-- On: a floor plan of tables, and a sale can be an open bill on a table:
-- rounds are sent to the kitchen as they are ordered, and the whole bill is
-- paid at the end. Pay-now sales (create_order) keep working at the same
-- branch for takeaway and walk-ins.
--
-- Money rules, same as create_order:
--   * prices and the discount are snapshotted per line when it is added;
--   * service and PB1 are on the whole bill, rounded once on aggregates
--     (FOKAS D13) — bill_totals() is create_order's formula, so a bill of the
--     same lines totals exactly what a pay-now order would;
--   * the bill counts on the business day it is paid;
--   * removing a line that was already sent: orders.void + reason, audited.

-- ── Floor plan ──────────────────────────────────────────────────────────

alter table outlets add column table_service boolean not null default false;

create table floor_areas (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  outlet_id  uuid not null,
  name       text not null check (btrim(name) <> '' and length(name) <= 40),
  sort       int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (outlet_id, org_id) references outlets(id, org_id) on delete cascade
);

create type table_shape as enum ('square', 'round', 'long');

-- Positions are grid cells on the plan (the editor's grid is 24 × 16).
create table dining_tables (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  outlet_id  uuid not null,
  area_id    uuid not null,
  name       text not null check (btrim(name) <> '' and length(name) <= 12),
  seats      int not null default 4 check (seats between 1 and 50),
  shape      table_shape not null default 'square',
  x          int not null default 0 check (x between 0 and 23),
  y          int not null default 0 check (y between 0 and 15),
  w          int not null default 2 check (w between 1 and 8),
  h          int not null default 2 check (h between 1 and 8),
  -- Never deleted once a bill used it (like menu items, D12): hidden instead.
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (outlet_id, org_id) references outlets(id, org_id) on delete cascade,
  foreign key (area_id, org_id) references floor_areas(id, org_id) on delete restrict
);
-- Table numbers are what staff say out loud: unique per branch.
create unique index dining_tables_name_idx on dining_tables(outlet_id, lower(btrim(name))) where active;

alter table floor_areas enable row level security;
alter table dining_tables enable row level security;
create policy "members read areas" on floor_areas for select using (is_org_member(org_id));
create policy "settings managers write areas" on floor_areas
  for all using (has_perm(org_id, 'settings.manage')) with check (has_perm(org_id, 'settings.manage'));
create policy "members read tables" on dining_tables for select using (is_org_member(org_id));
-- Tables are written by save_floor_plan() only (it guards tables in use).

-- ── Bills ───────────────────────────────────────────────────────────────

alter table orders
  add column table_id        uuid,
  add column guests          int check (guests between 1 and 200),
  add column bill_printed_at timestamptz,
  -- Who took the money. A table bill is often opened by one waiter and paid
  -- with another; opened_by stays the first, each round keeps its sender.
  add column closed_by       uuid references auth.users(id),
  add constraint orders_table_fk foreign key (table_id, org_id)
    references dining_tables(id, org_id) on delete restrict;
-- One open bill per table.
create unique index orders_open_table_idx on orders(table_id) where status = 'open' and table_id is not null;
create index orders_open_outlet_idx on orders(outlet_id) where status = 'open';

-- A round = what was sent to the kitchen in one go. One kitchen ticket each.
create table order_rounds (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null,
  outlet_id         uuid not null,
  order_id          uuid not null,
  round_no          int not null,
  client_request_id uuid not null,
  created_by        uuid not null references auth.users(id),
  created_at        timestamptz not null default now(),
  kitchen_done_at   timestamptz,
  kitchen_done_by   uuid references auth.users(id),
  unique (id, org_id),
  unique (order_id, round_no),
  unique (org_id, client_request_id),
  foreign key (order_id, org_id) references orders(id, org_id) on delete cascade
);
create index order_rounds_kitchen_idx on order_rounds(outlet_id, kitchen_done_at);

alter table order_rounds enable row level security;
create policy "members read rounds" on order_rounds for select using (is_org_member(org_id));

alter table order_items
  add column round_id  uuid,
  add column added_by  uuid references auth.users(id),
  add column voided_by uuid references auth.users(id),
  add column voided_at timestamptz,
  add constraint order_items_round_fk foreign key (round_id, org_id)
    references order_rounds(id, org_id) on delete cascade;

-- ── Arithmetic: create_order's formula, for a whole bill ────────────────

create function bill_totals(p_lines bigint, p_disc bigint, p_mode price_mode, p_service_bps int,
                            p_pb1_bps int, p_pb1_on_service boolean,
                            out base bigint, out service bigint, out pb1 bigint, out grand bigint)
language plpgsql immutable as $$
declare v_net bigint := p_lines - p_disc;
begin
  if p_mode = 'exclusive' then
    base    := v_net;
    service := round(base::numeric * p_service_bps / 10000)::bigint;
    pb1     := round((base + case when p_pb1_on_service then service else 0 end)::numeric
                     * p_pb1_bps / 10000)::bigint;
    grand   := base + service + pb1;
  else
    grand   := v_net;
    base    := round(grand::numeric * 100000000
                     / (100000000 + p_service_bps * 10000
                        + p_pb1_bps * (10000 + case when p_pb1_on_service then p_service_bps else 0 end)))::bigint;
    service := round(base::numeric * p_service_bps / 10000)::bigint;
    pb1     := grand - base - service;
  end if;
end;
$$;

-- Re-total an open bill from its lines that aren't voided.
create function recalc_bill(p_order uuid) returns orders
language plpgsql security definer set search_path = public
as $$
declare
  v_o orders;
  v_lines bigint; v_disc bigint; v_cost bigint; v_uncosted boolean;
  t record;
begin
  select * into v_o from orders where id = p_order;
  select coalesce(sum(unit_price * qty), 0), coalesce(sum(line_discount), 0),
         coalesce(sum(unit_cost * qty), 0), coalesce(bool_or(unit_cost is null), false)
    into v_lines, v_disc, v_cost, v_uncosted
    from order_items where order_id = p_order and not voided;
  select * into t from bill_totals(v_lines, v_disc, v_o.price_mode, v_o.service_bps, v_o.tax_bps, v_o.pb1_on_service);
  update orders set subtotal = t.base, discount_total = v_disc, service_total = t.service,
                    tax_total = t.pb1, grand_total = t.grand,
                    cost_total = case when v_uncosted then null else v_cost end
   where id = p_order returning * into v_o;
  return v_o;
end;
$$;
revoke execute on function recalc_bill(uuid) from public, anon, authenticated;

-- ── Switch, floor plan ──────────────────────────────────────────────────

create function set_table_service(p_outlet uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public
as $$
declare v_org uuid;
begin
  select org_id into v_org from outlets where id = p_outlet;
  if v_org is null or not has_perm(v_org, 'settings.manage') then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  if not p_on and exists (select 1 from orders where outlet_id = p_outlet and status = 'open') then
    raise exception 'Close or pay the open bills before turning table service off';
  end if;
  update outlets set table_service = p_on where id = p_outlet;
  -- First switch-on: one area to put tables in.
  if p_on and not exists (select 1 from floor_areas where outlet_id = p_outlet) then
    insert into floor_areas (org_id, outlet_id, name) values (v_org, p_outlet, 'Main');
  end if;
  insert into audit_log (org_id, actor, action, entity, entity_id, after)
  values (v_org, auth.uid(), 'set_table_service', 'outlets', p_outlet, jsonb_build_object('on', p_on));
end;
$$;

-- Save one area's tables in one go: [{id?, name, seats, shape, x, y, w, h}].
-- A table left out is deleted if no bill ever used it, else hidden; one with
-- an open bill can't be removed.
create function save_floor_plan(p_area uuid, p_tables jsonb) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_area floor_areas;
  v_t    jsonb;
  v_id   uuid;
begin
  select * into v_area from floor_areas where id = p_area;
  if not found or not has_perm(v_area.org_id, 'settings.manage') then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  if p_tables is null or jsonb_typeof(p_tables) <> 'array' then
    raise exception 'Invalid floor plan';
  end if;

  -- Removed ones first, so a name can move to a new table.
  for v_id in select id from dining_tables
               where area_id = p_area and active
                 and id::text not in (select coalesce(e->>'id', '') from jsonb_array_elements(p_tables) e) loop
    if exists (select 1 from orders where table_id = v_id and status = 'open') then
      raise exception 'Table % has an open bill', (select name from dining_tables where id = v_id);
    end if;
    if exists (select 1 from orders where table_id = v_id) then
      update dining_tables set active = false where id = v_id;
    else
      delete from dining_tables where id = v_id;
    end if;
  end loop;

  for v_t in select * from jsonb_array_elements(p_tables) loop
    v_id := nullif(v_t->>'id', '')::uuid;
    if v_id is null then
      insert into dining_tables (org_id, outlet_id, area_id, name, seats, shape, x, y, w, h)
      values (v_area.org_id, v_area.outlet_id, p_area, btrim(v_t->>'name'), (v_t->>'seats')::int,
              (v_t->>'shape')::table_shape, (v_t->>'x')::int, (v_t->>'y')::int, (v_t->>'w')::int, (v_t->>'h')::int)
      returning id into v_id;
    else
      update dining_tables set name = btrim(v_t->>'name'), seats = (v_t->>'seats')::int,
             shape = (v_t->>'shape')::table_shape, x = (v_t->>'x')::int, y = (v_t->>'y')::int,
             w = (v_t->>'w')::int, h = (v_t->>'h')::int, active = true
       where id = v_id and area_id = p_area;
      if not found then
        raise exception 'Table not found in this area';
      end if;
    end if;
  end loop;

  insert into audit_log (org_id, actor, action, entity, entity_id, after)
  values (v_area.org_id, auth.uid(), 'save_floor_plan', 'floor_areas', p_area, p_tables);
end;
$$;

-- ── Selling on a table ──────────────────────────────────────────────────

-- Send a round. Opens the table's bill if it has none. p_order is the bill
-- the waiter was looking at (null = a free table): if that bill was paid or
-- moved meanwhile, refuse rather than start a new bill by surprise.
-- Idempotent on p_client_request_id (D10).
create function send_round(
  p_org uuid, p_outlet uuid, p_table uuid, p_order uuid, p_client_request_id uuid,
  p_items jsonb, p_guests int default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_round order_rounds;
  v_table dining_tables;
  v_order orders;
  v_tax   tax_settings;
  v_set   org_settings;
  v_day   date;
  v_item  jsonb;
  v_menu  menu_items;
  v_qty   int;
  v_note  text;
  v_d_id  uuid; v_d_name text; v_line_disc bigint;
  v_no    bigint;
begin
  if v_uid is null or not has_perm(p_org, 'pos.sell') then
    raise exception 'Not allowed to take orders here' using errcode = 'insufficient_privilege';
  end if;

  select * into v_round from order_rounds where org_id = p_org and client_request_id = p_client_request_id;
  if found then
    select * into v_order from orders where id = v_round.order_id;
    return jsonb_build_object('order_id', v_order.id, 'order_no', v_order.order_no, 'round_no', v_round.round_no);
  end if;

  if not exists (select 1 from outlets where id = p_outlet and org_id = p_org and active and table_service) then
    raise exception 'Table service is off at this branch';
  end if;
  -- The table row is the lock: two waiters on one table take turns.
  select * into v_table from dining_tables
   where id = p_table and org_id = p_org and outlet_id = p_outlet and active for update;
  if not found then
    raise exception 'Unknown table';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Nothing to send';
  end if;

  select * into v_order from orders where table_id = p_table and status = 'open' for update;
  if found and p_order is not null and v_order.id <> p_order then
    raise exception 'This table has a different bill now. Reopen the table';
  end if;
  if not found and p_order is not null then
    raise exception 'This bill was already paid or moved. Reopen the table';
  end if;

  select * into v_set from org_settings where org_id = p_org;
  v_day := business_date(now(), v_set.timezone, v_set.day_cutover_hour);

  if v_order.id is null then
    select * into v_tax from tax_settings where org_id = p_org;
    perform pg_advisory_xact_lock(hashtext('order_no'), hashtext(p_org::text));
    select coalesce(max(order_no), 0) + 1 into v_no from orders where org_id = p_org;
    insert into orders (org_id, outlet_id, order_no, status, price_mode, service_bps, tax_bps,
                        pb1_on_service, business_date, client_request_id, opened_by, table_id, guests)
    values (p_org, p_outlet, v_no, 'open', v_tax.price_mode, v_tax.service_bps, v_tax.pb1_bps,
            v_tax.pb1_on_service, v_day, p_client_request_id, v_uid, p_table, p_guests)
    returning * into v_order;
  elsif p_guests is not null then
    update orders set guests = p_guests where id = v_order.id;
  end if;

  insert into order_rounds (org_id, outlet_id, order_id, round_no, client_request_id, created_by)
  values (p_org, p_outlet, v_order.id,
          coalesce((select max(round_no) from order_rounds where order_id = v_order.id), 0) + 1,
          p_client_request_id, v_uid)
  returning * into v_round;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_menu from menu_items where id = (v_item->>'menu_item_id')::uuid and org_id = p_org;
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
    v_note := nullif(btrim(coalesce(v_item->>'note', '')), '');
    v_d_id := null; v_d_name := null; v_line_disc := 0;
    select id, name, amount into v_d_id, v_d_name, v_line_disc
      from best_discount(p_org, v_menu.id, v_menu.price, v_qty, v_day);
    v_line_disc := coalesce(v_line_disc, 0);
    insert into order_items (
      org_id, order_id, round_id, added_by, menu_item_id, name_snapshot, qty, unit_price, line_subtotal,
      line_discount, discount_id, discount_name, unit_cost, modifiers_json
    ) values (
      p_org, v_order.id, v_round.id, v_uid, v_menu.id, v_menu.name, v_qty, v_menu.price,
      v_menu.price * v_qty - v_line_disc, v_line_disc, v_d_id, v_d_name, v_menu.unit_cost,
      case when v_note is null then '[]'::jsonb
           else jsonb_build_array(jsonb_build_object('note', left(v_note, 200))) end
    );
  end loop;

  -- More was ordered after the bill was printed: that print is out of date.
  update orders set bill_printed_at = null where id = v_order.id;
  perform recalc_bill(v_order.id);
  return jsonb_build_object('order_id', v_order.id, 'order_no', v_order.order_no, 'round_no', v_round.round_no);
end;
$$;

-- Take a sent line off an open bill: orders.void, a reason, audited.
create function void_bill_item(p_item uuid, p_reason text) returns orders
language plpgsql security definer set search_path = public
as $$
declare
  v_line  order_items;
  v_order orders;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required';
  end if;
  select * into v_line from order_items where id = p_item;
  if not found or org_role_of(v_line.org_id) is null then
    raise exception 'Item not found';
  end if;
  select * into v_order from orders where id = v_line.order_id for update;
  if not has_perm(v_order.org_id, 'orders.void') then
    raise exception 'Ask a manager to remove an item that was sent to the kitchen' using errcode = 'insufficient_privilege';
  end if;
  if v_order.status <> 'open' then
    raise exception 'Only items on an open bill can be removed (void the paid order instead)';
  end if;
  if v_line.voided then
    return v_order;
  end if;
  update order_items set voided = true, void_reason = left(btrim(p_reason), 300),
                         voided_by = auth.uid(), voided_at = now()
   where id = p_item;
  update orders set bill_printed_at = null where id = v_order.id;
  insert into audit_log (org_id, actor, action, entity, entity_id, before, after)
  values (v_order.org_id, auth.uid(), 'void_bill_item', 'order_items', p_item, to_jsonb(v_line),
          jsonb_build_object('reason', btrim(p_reason)));
  return recalc_bill(v_order.id);
end;
$$;

create function move_bill(p_order uuid, p_table uuid) returns orders
language plpgsql security definer set search_path = public
as $$
declare
  v_order orders;
  v_from  text;
begin
  select * into v_order from orders where id = p_order for update;
  if not found or not has_perm(v_order.org_id, 'pos.sell') then
    raise exception 'Bill not found';
  end if;
  if v_order.status <> 'open' then
    raise exception 'This bill is already closed';
  end if;
  perform 1 from dining_tables where id = p_table and outlet_id = v_order.outlet_id and active for update;
  if not found then
    raise exception 'Unknown table';
  end if;
  if exists (select 1 from orders where table_id = p_table and status = 'open') then
    raise exception 'That table already has a bill';
  end if;
  select name into v_from from dining_tables where id = v_order.table_id;
  update orders set table_id = p_table where id = p_order returning * into v_order;
  insert into audit_log (org_id, actor, action, entity, entity_id, after)
  values (v_order.org_id, auth.uid(), 'move_bill', 'orders', p_order,
          jsonb_build_object('from', v_from, 'to', (select name from dining_tables where id = p_table)));
  return v_order;
end;
$$;

-- Pre-bill ("check") for the guests. The printer gets an ordinary receipt
-- job for an open order; the bridge prints it as BILL, not paid.
create function print_bill(p_order uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare v_order orders;
begin
  select * into v_order from orders where id = p_order for update;
  if not found or not has_perm(v_order.org_id, 'pos.sell') then
    raise exception 'Bill not found';
  end if;
  if v_order.status <> 'open' then
    raise exception 'This bill is already closed';
  end if;
  update orders set bill_printed_at = now() where id = p_order;
  insert into print_jobs (org_id, outlet_id, order_id, kind, payload, requested_by)
  values (v_order.org_id, v_order.outlet_id, p_order, 'receipt',
          jsonb_build_object('order_id', p_order, 'bill', true), auth.uid());
end;
$$;

-- Pay the whole bill (cash, as create_order). It counts on today's business
-- day. A second tap after it was paid returns the paid bill.
create function settle_bill(p_order uuid, p_amount_tendered bigint) returns orders
language plpgsql security definer set search_path = public
as $$
declare
  v_order orders;
  v_set   org_settings;
begin
  select * into v_order from orders where id = p_order for update;
  if not found or not has_perm(v_order.org_id, 'pos.sell') then
    raise exception 'Bill not found';
  end if;
  if v_order.status = 'paid' then
    return v_order;
  end if;
  if v_order.status <> 'open' then
    raise exception 'This bill is already closed';
  end if;
  v_order := recalc_bill(p_order);
  if p_amount_tendered is null or p_amount_tendered < v_order.grand_total then
    raise exception 'Amount tendered is less than the total due';
  end if;
  select * into v_set from org_settings where org_id = v_order.org_id;
  update orders set status = 'paid', closed_at = now(), closed_by = auth.uid(),
                    business_date = business_date(now(), v_set.timezone, v_set.day_cutover_hour)
   where id = p_order returning * into v_order;
  insert into payments (org_id, order_id, provider, method, amount, status, paid_at, amount_tendered, change_given)
  values (v_order.org_id, p_order, 'cash', 'cash', v_order.grand_total, 'paid', now(),
          p_amount_tendered, p_amount_tendered - v_order.grand_total);
  insert into print_jobs (org_id, outlet_id, order_id, kind, payload, requested_by)
  values (v_order.org_id, v_order.outlet_id, p_order, 'receipt', jsonb_build_object('order_id', p_order), auth.uid());
  return v_order;
end;
$$;

create function set_round_done(p_round uuid, p_done boolean) returns void
language plpgsql security definer set search_path = public
as $$
declare v_org uuid;
begin
  select org_id into v_org from order_rounds where id = p_round;
  if v_org is null or not (has_perm(v_org, 'kitchen.view') or has_perm(v_org, 'pos.sell')) then
    raise exception 'Round not found';
  end if;
  update order_rounds
     set kitchen_done_at = case when p_done then now() end,
         kitchen_done_by = case when p_done then auth.uid() end
   where id = p_round;
end;
$$;

-- void_order as in migration 8, plus: an open bill can be cancelled too
-- (guests left, everything taken off). Paid orders: same business day only.
create or replace function void_order(p_order uuid, p_reason text) returns orders
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
  if not has_perm(v_order.org_id, 'orders.void') then
    raise exception 'Your role cannot void orders' using errcode = 'insufficient_privilege';
  end if;
  if v_order.status not in ('paid', 'open') then
    raise exception 'Only a paid order or an open bill can be voided';
  end if;
  if v_order.status = 'paid' and v_order.business_date <> org_business_date(v_order.org_id) then
    raise exception 'Only same-day orders can be voided';
  end if;

  v_before := to_jsonb(v_order);
  update orders set status = 'voided', voided_at = now(), voided_by = auth.uid(),
                    void_reason = btrim(p_reason), closed_at = coalesce(closed_at, now())
   where id = p_order returning * into v_order;
  update order_items set voided = true, void_reason = coalesce(void_reason, btrim(p_reason))
   where order_id = p_order;
  update payments set status = 'refunded' where order_id = p_order;
  insert into audit_log (org_id, actor, action, entity, entity_id, before, after)
  values (v_order.org_id, auth.uid(), 'void_order', 'orders', p_order, v_before, to_jsonb(v_order));
  return v_order;
end;
$$;

-- Receipt data: as in migration 11, plus the table, and a table bill's
-- rounds merged into one line per item (the guest sees "3 x Latte", not
-- three rounds of one).
create or replace function device_receipt_data(p_token text, p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_dev   print_devices;
  v_order orders;
  v_items jsonb;
begin
  v_dev := device_from_token(p_token);
  if v_dev.id is null then
    raise exception 'Invalid or revoked device token' using errcode = 'insufficient_privilege';
  end if;
  select * into v_order from orders where id = p_order and outlet_id = v_dev.outlet_id;
  if not found then
    raise exception 'Order not found for this printer';
  end if;

  if v_order.table_id is null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'name_snapshot', name_snapshot, 'qty', qty, 'unit_price', unit_price,
             'line_subtotal', line_subtotal, 'line_discount', line_discount,
             'discount_name', discount_name, 'voided', voided, 'modifiers_json', modifiers_json)
             order by name_snapshot, id), '[]'::jsonb)
      into v_items from order_items where order_id = p_order;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
             'name_snapshot', name_snapshot, 'qty', qty, 'unit_price', unit_price,
             'line_subtotal', line_subtotal, 'line_discount', line_discount,
             'discount_name', discount_name, 'voided', false, 'modifiers_json', modifiers_json)
             order by name_snapshot), '[]'::jsonb)
      into v_items
      from (select name_snapshot, unit_price, discount_name, modifiers_json,
                   sum(qty)::int as qty, sum(line_subtotal) as line_subtotal,
                   sum(line_discount) as line_discount
              from order_items where order_id = p_order and not voided
             group by name_snapshot, unit_price, discount_name, modifiers_json) g;
  end if;

  return jsonb_build_object(
    'order', to_jsonb(v_order) - 'client_request_id' - 'cost_total'
             || jsonb_build_object('cashier', (select full_name from profiles
                                                   where id = coalesce(v_order.closed_by, v_order.opened_by)),
                                   'table_name', (select name from dining_tables where id = v_order.table_id)),
    'items', v_items,
    'payment', (select jsonb_build_object('method', method, 'amount_tendered', amount_tendered,
                                          'change_given', change_given)
                  from payments where order_id = p_order order by created_at limit 1),
    'settings', (select jsonb_build_object('receipt_header', receipt_header,
                                           'receipt_footer', receipt_footer, 'timezone', timezone,
                                           'receipt_logo_url', receipt_logo_url)
                   from org_settings where org_id = v_order.org_id)
  );
end;
$$;

-- ── Realtime: the floor plan and the kitchen follow rounds live ─────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table order_rounds;
  end if;
end $$;

-- ── Grants ──────────────────────────────────────────────────────────────

revoke execute on function bill_totals(bigint, bigint, price_mode, int, int, boolean) from public, anon;
revoke execute on function set_table_service(uuid, boolean) from public, anon;
revoke execute on function save_floor_plan(uuid, jsonb) from public, anon;
revoke execute on function send_round(uuid, uuid, uuid, uuid, uuid, jsonb, int) from public, anon;
revoke execute on function void_bill_item(uuid, text) from public, anon;
revoke execute on function move_bill(uuid, uuid) from public, anon;
revoke execute on function print_bill(uuid) from public, anon;
revoke execute on function settle_bill(uuid, bigint) from public, anon;
revoke execute on function set_round_done(uuid, boolean) from public, anon;
grant execute on function bill_totals(bigint, bigint, price_mode, int, int, boolean) to authenticated;
grant execute on function set_table_service(uuid, boolean) to authenticated;
grant execute on function save_floor_plan(uuid, jsonb) to authenticated;
grant execute on function send_round(uuid, uuid, uuid, uuid, uuid, jsonb, int) to authenticated;
grant execute on function void_bill_item(uuid, text) to authenticated;
grant execute on function move_bill(uuid, uuid) to authenticated;
grant execute on function print_bill(uuid) to authenticated;
grant execute on function settle_bill(uuid, bigint) to authenticated;
grant execute on function set_round_done(uuid, boolean) to authenticated;
