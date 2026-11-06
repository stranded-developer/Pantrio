-- Menu discounts (decision P27): percent or a fixed rupiah amount off each
-- unit, on chosen menu items or all, in a date window (optionally only on
-- some weekdays). Applied automatically by create_order on the order's
-- business day; the largest one wins per line, they never stack. Service
-- and PB1 are on the price after discount.
-- Mirrored by packages/core/src/pos.ts (bestDiscount, lineDiscount).

create type discount_kind as enum ('percent', 'amount');

create table discounts (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null check (btrim(name) <> '' and length(name) <= 60),
  kind       discount_kind not null,
  -- percent: basis points (2000 = 20%); amount: rupiah off each unit.
  value      bigint not null check (value > 0),
  all_items  boolean not null default false,
  starts_on  date not null,
  ends_on    date,
  -- ISO weekdays (1 = Monday … 7 = Sunday); null = every day.
  weekdays   int[] check (weekdays is null or (cardinality(weekdays) > 0 and weekdays <@ array[1,2,3,4,5,6,7])),
  active     boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, org_id),
  check (kind <> 'percent' or value <= 10000),
  check (ends_on is null or ends_on >= starts_on)
);

create table discount_items (
  discount_id  uuid not null,
  org_id       uuid not null,
  menu_item_id uuid not null,
  primary key (discount_id, menu_item_id),
  foreign key (discount_id, org_id) references discounts(id, org_id) on delete cascade,
  foreign key (menu_item_id, org_id) references menu_items(id, org_id) on delete cascade
);
create index discount_items_item_idx on discount_items(menu_item_id);

alter table discounts enable row level security;
alter table discount_items enable row level security;
create policy "members read discounts" on discounts for select using (is_org_member(org_id));
create policy "menu managers write discounts" on discounts
  for all using (has_perm(org_id, 'menu.manage')) with check (has_perm(org_id, 'menu.manage'));
create policy "members read discount items" on discount_items for select using (is_org_member(org_id));
create policy "menu managers write discount items" on discount_items
  for all using (has_perm(org_id, 'menu.manage')) with check (has_perm(org_id, 'menu.manage'));

-- What each order line got (snapshot; the discount may change later).
alter table order_items
  add column line_discount bigint not null default 0 check (line_discount >= 0),
  add column discount_id   uuid,
  add column discount_name text;

-- The largest discount for one line on a business day (ties: lowest id).
create function best_discount(p_org uuid, p_item uuid, p_price bigint, p_qty int, p_day date)
returns table (id uuid, name text, amount bigint)
  language sql stable security definer set search_path = public as $$
    select d.id, d.name,
           case d.kind
             when 'percent' then round((p_price * p_qty)::numeric * d.value / 10000)::bigint
             else least(d.value, p_price) * p_qty
           end as amount
      from discounts d
     where d.org_id = p_org and d.active
       and d.starts_on <= p_day and (d.ends_on is null or d.ends_on >= p_day)
       and (d.weekdays is null or extract(isodow from p_day)::int = any(d.weekdays))
       and (d.all_items or exists (select 1 from discount_items di
                                    where di.discount_id = d.id and di.menu_item_id = p_item))
     order by 3 desc, d.id
     limit 1
  $$;
revoke execute on function best_discount(uuid, uuid, bigint, int, date) from public, anon, authenticated;

-- create_order: as in migration 8, plus discounts.
create or replace function create_order(
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
  v_disc     bigint := 0;
  v_line_disc bigint;
  v_d_id     uuid;
  v_d_name   text;
begin
  if v_uid is null or not has_perm(p_org, 'pos.sell') then
    raise exception 'Not allowed to take orders here' using errcode = 'insufficient_privilege';
  end if;

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
  -- Before the lines: which discounts apply depends on the business day.
  v_day := business_date(now(), v_set.timezone, v_set.day_cutover_hour);

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
    select amount into v_line_disc from best_discount(p_org, v_menu.id, v_menu.price, v_qty, v_day);
    v_disc := v_disc + coalesce(v_line_disc, 0);
    if v_menu.unit_cost is null then
      v_costed := false;
    else
      v_cost := v_cost + v_menu.unit_cost * v_qty;
    end if;
  end loop;

  -- Service and PB1 are on the price after discount (P27).
  v_lines := v_lines - v_disc;

  if v_tax.price_mode = 'exclusive' then
    v_base    := v_lines;
    v_service := round(v_base::numeric * v_tax.service_bps / 10000)::bigint;
    v_pb1     := round((v_base + case when v_tax.pb1_on_service then v_service else 0 end)::numeric
                       * v_tax.pb1_bps / 10000)::bigint;
    v_grand   := v_base + v_service + v_pb1;
  else
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

  perform pg_advisory_xact_lock(hashtext('order_no'), hashtext(p_org::text));
  select coalesce(max(order_no), 0) + 1 into v_order_no from orders where org_id = p_org;

  perform pg_advisory_xact_lock(hashtext('queue_no:' || p_outlet::text), (v_day - date '2000-01-01'));
  select coalesce(max(queue_no), 0) + 1 into v_queue_no
    from orders where outlet_id = p_outlet and business_date = v_day;

  insert into orders (
    org_id, outlet_id, order_no, status, subtotal, discount_total, service_total, tax_total, grand_total,
    cost_total, price_mode, service_bps, tax_bps, pb1_on_service, business_date,
    client_request_id, queue_no, priority, opened_by, closed_at
  ) values (
    p_org, p_outlet, v_order_no, 'paid', v_base, v_disc, v_service, v_pb1, v_grand,
    case when v_costed then v_cost end, v_tax.price_mode, v_tax.service_bps, v_tax.pb1_bps,
    v_tax.pb1_on_service, v_day, p_client_request_id, v_queue_no, coalesce(p_priority, false),
    v_uid, now()
  ) returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_menu from menu_items
     where id = (v_item->>'menu_item_id')::uuid and org_id = p_org;
    v_qty  := (v_item->>'qty')::int;
    v_note := nullif(btrim(coalesce(v_item->>'note', '')), '');
    v_d_id := null; v_d_name := null; v_line_disc := 0;
    select id, name, amount into v_d_id, v_d_name, v_line_disc
      from best_discount(p_org, v_menu.id, v_menu.price, v_qty, v_day);
    v_line_disc := coalesce(v_line_disc, 0);
    insert into order_items (
      org_id, order_id, menu_item_id, name_snapshot, qty, unit_price, line_subtotal,
      line_discount, discount_id, discount_name, unit_cost, modifiers_json
    ) values (
      p_org, v_order.id, v_menu.id, v_menu.name, v_qty, v_menu.price, v_menu.price * v_qty - v_line_disc,
      v_line_disc, v_d_id, v_d_name, v_menu.unit_cost,
      case when v_note is null then '[]'::jsonb
           else jsonb_build_array(jsonb_build_object('note', left(v_note, 200))) end
    );
  end loop;

  insert into payments (org_id, order_id, provider, method, amount, status, paid_at,
                        amount_tendered, change_given)
  values (p_org, v_order.id, 'cash', 'cash', v_grand, 'paid', now(),
          p_amount_tendered, p_amount_tendered - v_grand);

  insert into print_jobs (org_id, outlet_id, order_id, kind, payload, requested_by)
  values (p_org, p_outlet, v_order.id, 'receipt', jsonb_build_object('order_id', v_order.id), v_uid);

  return v_order;
end;
$$;

-- The printer gets each line's discount (receipt shows it under the line).
create or replace function device_receipt_data(p_token text, p_order uuid) returns jsonb
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
                'line_subtotal', line_subtotal, 'line_discount', line_discount,
                'discount_name', discount_name, 'voided', voided, 'modifiers_json', modifiers_json)
                order by name_snapshot, id)
              from order_items where order_id = p_order), '[]'::jsonb),
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
revoke execute on function device_receipt_data(text, uuid) from public;
grant execute on function device_receipt_data(text, uuid) to anon;


-- Save a discount and its item list in one go (Menu → Discounts).
create function save_discount(
  p_org uuid, p_id uuid, p_name text, p_kind discount_kind, p_value bigint, p_all_items boolean,
  p_items uuid[], p_starts date, p_ends date, p_weekdays int[], p_active boolean
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid := p_id;
begin
  if not has_perm(p_org, 'menu.manage') then
    raise exception 'Your role cannot manage discounts' using errcode = 'insufficient_privilege';
  end if;
  if not p_all_items and coalesce(cardinality(p_items), 0) = 0 then
    raise exception 'Pick at least one menu item, or All menu items';
  end if;
  if v_id is null then
    insert into discounts (org_id, name, kind, value, all_items, starts_on, ends_on, weekdays, active, created_by)
    values (p_org, btrim(p_name), p_kind, p_value, p_all_items, p_starts, p_ends, p_weekdays, p_active, auth.uid())
    returning id into v_id;
  else
    update discounts set name = btrim(p_name), kind = p_kind, value = p_value, all_items = p_all_items,
                         starts_on = p_starts, ends_on = p_ends, weekdays = p_weekdays, active = p_active
     where id = v_id and org_id = p_org;
    if not found then
      raise exception 'Discount not found';
    end if;
    delete from discount_items where discount_id = v_id;
  end if;
  if not p_all_items then
    insert into discount_items (discount_id, org_id, menu_item_id)
    select v_id, p_org, m.id from menu_items m where m.org_id = p_org and m.id = any(p_items);
  end if;
  insert into audit_log (org_id, actor, action, entity, entity_id, after)
  values (p_org, auth.uid(), case when p_id is null then 'create_discount' else 'update_discount' end,
          'discounts', v_id, (select to_jsonb(d) from discounts d where d.id = v_id));
  return v_id;
end;
$$;
revoke execute on function save_discount(uuid, uuid, text, discount_kind, bigint, boolean, uuid[], date, date, int[], boolean) from public, anon;
grant execute on function save_discount(uuid, uuid, text, discount_kind, bigint, boolean, uuid[], date, date, int[], boolean) to authenticated;
