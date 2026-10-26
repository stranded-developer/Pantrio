-- Custom roles with permission checkboxes (decision P24).
--
-- Owners stay special: always everything, and the only ones who manage
-- staff, roles and branches (a role editor that non-owners could use would
-- let them grant themselves anything). Every other member gets a role row
-- holding a list of permissions. Each restaurant starts with "Manager" and
-- "Cashier" roles that reproduce exactly what those enum roles allowed, so
-- nobody's access changes when this ships.
--
-- Enforcement is here, in RLS and in the money functions, through
-- has_perm(); the UI only hides what you cannot open (FOKAS D14, P21).

-- ── Permission vocabulary (mirrored in apps/web/src/lib/permissions.ts) ──

create function permission_keys() returns text[]
  language sql immutable as $$
    select array[
      'pos.sell', 'orders.view', 'orders.void', 'kitchen.view', 'sales.view',
      'profit.manage', 'menu.manage', 'recipes.manage', 'ingredients.manage',
      'settings.manage', 'printers.manage'
    ]
  $$;

create table org_roles (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null check (btrim(name) <> ''),
  permissions text[] not null default '{}' check (permissions <@ permission_keys()),
  created_at  timestamptz not null default now(),
  unique (id, org_id)
);
create unique index org_roles_name_idx on org_roles(org_id, lower(name));

alter table org_members add column role_id uuid;
alter table org_members
  add constraint org_members_role_fk foreign key (role_id, org_id)
  references org_roles(id, org_id) on delete restrict;

-- ── Defaults, and move existing members onto them ────────────────────────

create function create_default_roles(p_org uuid) returns void
  language sql as $$
    insert into org_roles (org_id, name, permissions) values
      (p_org, 'Manager', permission_keys()),
      (p_org, 'Cashier', array['pos.sell', 'orders.view', 'kitchen.view'])
    on conflict do nothing
  $$;

select create_default_roles(id) from organizations;

update org_members m
   set role_id = r.id
  from org_roles r
 where r.org_id = m.org_id
   and m.role <> 'owner'
   and lower(r.name) = m.role::text;

-- Non-owners must have a role; owners need none.
alter table org_members
  add constraint org_members_role_required check (role = 'owner' or role_id is not null);

-- ── The check ────────────────────────────────────────────────────────────

create function has_perm(p_org uuid, p_perm text) returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (
      select 1
        from org_members m
        left join org_roles r on r.id = m.role_id
       where m.org_id = p_org and m.user_id = auth.uid() and m.active
         and (m.role = 'owner' or p_perm = any(r.permissions))
    )
  $$;

-- Permissions of the signed-in user in one org (for the app's nav/pages).
create function my_permissions(p_org uuid) returns text[]
  language sql stable security definer set search_path = public as $$
    select case when m.role = 'owner' then permission_keys() else coalesce(r.permissions, '{}') end
      from org_members m
      left join org_roles r on r.id = m.role_id
     where m.org_id = p_org and m.user_id = auth.uid() and m.active
  $$;

alter table org_roles enable row level security;
create policy "members read roles" on org_roles for select using (is_org_member(org_id));
create policy "owners manage roles" on org_roles
  for all using (is_org_owner(org_id)) with check (is_org_owner(org_id));

-- ── Re-point every write policy from "manager" to a permission ───────────

drop policy "managers update tax settings" on tax_settings;
create policy "settings managers update tax settings" on tax_settings
  for update using (has_perm(org_id, 'settings.manage')) with check (has_perm(org_id, 'settings.manage'));

drop policy "managers update org settings" on org_settings;
create policy "settings managers update org settings" on org_settings
  for update using (has_perm(org_id, 'settings.manage')) with check (has_perm(org_id, 'settings.manage'));

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('suppliers', 'ingredients.manage'),
      ('ingredients', 'ingredients.manage'),
      ('ingredient_conversions', 'ingredients.manage'),
      ('ingredient_products', 'ingredients.manage'),
      ('recipes', 'recipes.manage'),
      ('recipe_lines', 'recipes.manage'),
      ('fixed_costs', 'profit.manage'),
      ('fixed_cost_rates', 'profit.manage'),
      ('fixed_cost_actuals', 'profit.manage'),
      ('external_menu_items', 'menu.manage')
    ) as v(tbl, perm)
  loop
    execute format('drop policy "managers write" on %I', t.tbl);
    execute format(
      'create policy "permitted write" on %I for all using (has_perm(org_id, %L)) with check (has_perm(org_id, %L))',
      t.tbl, t.perm, t.perm);
  end loop;
end $$;

drop policy "managers write categories" on menu_categories;
create policy "menu managers write categories" on menu_categories
  for all using (has_perm(org_id, 'menu.manage')) with check (has_perm(org_id, 'menu.manage'));
drop policy "managers write menu" on menu_items;
create policy "menu managers write menu" on menu_items
  for all using (has_perm(org_id, 'menu.manage')) with check (has_perm(org_id, 'menu.manage'));

-- Prices were "any member may record one"; now whoever manages ingredients.
drop policy "members record prices" on product_prices;
create policy "ingredient managers record prices" on product_prices
  for insert with check (has_perm(org_id, 'ingredients.manage') and recorded_by = auth.uid());

-- Wages are private: only roles that see Profit.
drop policy "managers manage staff" on staff_members;
create policy "profit managers manage staff" on staff_members
  for all using (has_perm(org_id, 'profit.manage')) with check (has_perm(org_id, 'profit.manage'));
drop policy "managers manage wages" on staff_wages;
create policy "profit managers manage wages" on staff_wages
  for all using (has_perm(org_id, 'profit.manage')) with check (has_perm(org_id, 'profit.manage'));

drop policy "managers read print devices" on print_devices;
create policy "printer managers read devices" on print_devices
  for select using (has_perm(org_id, 'printers.manage'));

drop policy "managers read audit log" on audit_log;
create policy "owners read audit log" on audit_log for select using (is_org_owner(org_id));

-- ── Money and device functions ───────────────────────────────────────────
-- Only the permission checks change; bodies are otherwise those of
-- migration 3.

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

  v_day := business_date(now(), v_set.timezone, v_set.day_cutover_hour);

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

  insert into print_jobs (org_id, outlet_id, order_id, kind, payload, requested_by)
  values (p_org, p_outlet, v_order.id, 'receipt', jsonb_build_object('order_id', v_order.id), v_uid);

  return v_order;
end;
$$;

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

create or replace function set_kitchen_done(p_order uuid, p_done boolean) returns void
language plpgsql security definer set search_path = public
as $$
declare v_org uuid;
begin
  select org_id into v_org from orders where id = p_order and queue_no is not null;
  if v_org is null or org_role_of(v_org) is null then
    raise exception 'Order not found';
  end if;
  if not (has_perm(v_org, 'kitchen.view') or has_perm(v_org, 'pos.sell')) then
    raise exception 'Your role cannot use the kitchen screen' using errcode = 'insufficient_privilege';
  end if;
  update orders
     set kitchen_done_at = case when p_done then now() end,
         kitchen_done_by = case when p_done then auth.uid() end
   where id = p_order;
end;
$$;

create or replace function queue_reprint(p_order uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare v_order orders;
begin
  select * into v_order from orders where id = p_order;
  if not found or org_role_of(v_order.org_id) is null then
    raise exception 'Order not found';
  end if;
  if not (has_perm(v_order.org_id, 'pos.sell') or has_perm(v_order.org_id, 'orders.view')) then
    raise exception 'Your role cannot reprint receipts' using errcode = 'insufficient_privilege';
  end if;
  insert into print_jobs (org_id, outlet_id, order_id, kind, payload, requested_by)
  values (v_order.org_id, v_order.outlet_id, p_order, 'reprint',
          jsonb_build_object('order_id', p_order), auth.uid());
end;
$$;

create or replace function create_print_device(p_org uuid, p_outlet uuid, p_name text) returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare v_token text;
begin
  if not has_perm(p_org, 'printers.manage') then
    raise exception 'Your role cannot add printers' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from outlets where id = p_outlet and org_id = p_org) then
    raise exception 'Unknown outlet';
  end if;
  v_token := 'pdt_' || encode(gen_random_bytes(24), 'hex');
  insert into print_devices (org_id, outlet_id, name, token_prefix, token_hash)
  values (p_org, p_outlet, btrim(p_name), left(v_token, 12), encode(digest(v_token, 'sha256'), 'hex'));
  insert into audit_log (org_id, actor, action, entity, after)
  values (p_org, auth.uid(), 'create_print_device', 'print_devices',
          jsonb_build_object('name', btrim(p_name), 'outlet_id', p_outlet));
  return v_token;
end;
$$;

create or replace function revoke_print_device(p_device uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare v_org uuid;
begin
  select org_id into v_org from print_devices where id = p_device;
  if v_org is null or not has_perm(v_org, 'printers.manage') then
    raise exception 'Printer not found';
  end if;
  update print_devices set revoked_at = now() where id = p_device and revoked_at is null;
  insert into audit_log (org_id, actor, action, entity, entity_id)
  values (v_org, auth.uid(), 'revoke_print_device', 'print_devices', p_device);
end;
$$;

-- ── Menu cost cache, writable by whoever changes what costs depend on ────
-- Recipe / ingredient editors may not hold menu.manage, but re-costing the
-- menu after their change must still succeed. Only unit_cost moves.

create function set_menu_costs(p_org uuid, p_costs jsonb) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not (has_perm(p_org, 'recipes.manage') or has_perm(p_org, 'ingredients.manage')
          or has_perm(p_org, 'menu.manage')) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  update menu_items m
     set unit_cost = (c->>'cost')::bigint, cost_updated_at = now()
    from jsonb_array_elements(p_costs) c
   where m.org_id = p_org and m.id = (c->>'id')::uuid;
end;
$$;

-- Linking a recipe to a menu item (Recipes → Create recipe) without menu.manage.
create function link_menu_recipe(p_menu_item uuid, p_recipe uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare v_org uuid;
begin
  select org_id into v_org from menu_items where id = p_menu_item;
  if v_org is null or not has_perm(v_org, 'recipes.manage') then
    raise exception 'Menu item not found';
  end if;
  if not exists (select 1 from recipes where id = p_recipe and org_id = v_org) then
    raise exception 'Recipe not found';
  end if;
  update menu_items set recipe_id = p_recipe where id = p_menu_item;
end;
$$;

-- ── Owners can correct a staff member's name ─────────────────────────────
-- The name is the person's profile (shown on receipts, shared across the
-- restaurants they work for), so only for people who work for this one
-- restaurant alone — same rule as resetting their password.

create function owner_rename_member(p_org uuid, p_user uuid, p_name text) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_org_owner(p_org) then
    raise exception 'Only an owner can rename staff' using errcode = 'insufficient_privilege';
  end if;
  if p_name is null or btrim(p_name) = '' or length(btrim(p_name)) > 100 then
    raise exception 'Enter a name (up to 100 characters)';
  end if;
  if not exists (select 1 from org_members where org_id = p_org and user_id = p_user) then
    raise exception 'Not a member of this restaurant';
  end if;
  if exists (select 1 from org_members where user_id = p_user and org_id <> p_org) then
    raise exception 'This person also works elsewhere; they can change their name under their account';
  end if;
  update profiles set full_name = btrim(p_name) where id = p_user;
end;
$$;

-- ── New restaurants get the default roles ────────────────────────────────

create or replace function admin_create_organization(p_name text, p_slug text, p_owner uuid)
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
  perform create_default_roles(v_org.id);
  insert into org_members (org_id, user_id, role) values (v_org.id, p_owner, 'owner');
  insert into audit_log (org_id, action, entity, entity_id, after)
  values (v_org.id, 'admin_create_organization', 'organizations', v_org.id, to_jsonb(v_org));
  return v_org;
end;
$$;

-- ── Logos: settings permission ───────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    drop policy if exists "managers upload their logos" on storage.objects;
    drop policy if exists "managers replace their logos" on storage.objects;
    drop policy if exists "managers delete their logos" on storage.objects;
    execute $p$
      create policy "settings managers upload logos" on storage.objects for insert to authenticated
        with check (bucket_id = 'logos' and has_perm(((storage.foldername(name))[1])::uuid, 'settings.manage'))
    $p$;
    execute $p$
      create policy "settings managers replace logos" on storage.objects for update to authenticated
        using (bucket_id = 'logos' and has_perm(((storage.foldername(name))[1])::uuid, 'settings.manage'))
    $p$;
    execute $p$
      create policy "settings managers delete logos" on storage.objects for delete to authenticated
        using (bucket_id = 'logos' and has_perm(((storage.foldername(name))[1])::uuid, 'settings.manage'))
    $p$;
  end if;
end $$;

-- ── Grants ───────────────────────────────────────────────────────────────

revoke execute on function has_perm(uuid, text) from public, anon;
revoke execute on function my_permissions(uuid) from public, anon;
revoke execute on function set_menu_costs(uuid, jsonb) from public, anon;
revoke execute on function link_menu_recipe(uuid, uuid) from public, anon;
revoke execute on function owner_rename_member(uuid, uuid, text) from public, anon;
grant execute on function owner_rename_member(uuid, uuid, text) to authenticated;
revoke execute on function create_default_roles(uuid) from public, anon, authenticated;
grant execute on function has_perm(uuid, text) to authenticated;
grant execute on function my_permissions(uuid) to authenticated;
grant execute on function set_menu_costs(uuid, jsonb) to authenticated;
grant execute on function link_menu_recipe(uuid, uuid) to authenticated;

-- is_org_manager() has no callers left; drop it so nothing new relies on it.
drop function is_org_manager(uuid);
