-- Pantrio — Row Level Security
--
-- Unlike FOKAS (where money writes go through the service role), Pantrio's
-- dashboard writes as the signed-in user and RLS is the boundary (P14).
-- The service role is used only by the public API, which scopes every query
-- by the org resolved from the API key.
--
-- Roles: owner > manager > cashier.
--   cashier read the catalogue and recipes; may record a new price; sells.
--   manager edit catalogue, recipes, settings, fixed costs; read wages.
--   owner   everything, incl. members and POS connections / API keys.
-- Wages are manager+ only: cashiers should not see each other's pay.

create function org_role_of(p_org uuid) returns org_role
  language sql stable security definer set search_path = public as $$
    select role from org_members
     where org_id = p_org and user_id = auth.uid() and active
  $$;

create function is_org_member(p_org uuid) returns boolean
  language sql stable security definer set search_path = public as $$
    select org_role_of(p_org) is not null
  $$;

create function is_org_manager(p_org uuid) returns boolean
  language sql stable security definer set search_path = public as $$
    select org_role_of(p_org) in ('owner', 'manager')
  $$;

create function is_org_owner(p_org uuid) returns boolean
  language sql stable security definer set search_path = public as $$
    select org_role_of(p_org) = 'owner'
  $$;

-- ── Organisations & members ──────────────────────────────────────────────

alter table organizations enable row level security;
alter table org_members enable row level security;
alter table tax_settings enable row level security;

create policy "members read their org" on organizations
  for select using (is_org_member(id));
create policy "owners update their org" on organizations
  for update using (is_org_owner(id)) with check (is_org_owner(id));
-- No insert policy: organisations are created by admin_create_organization().

create policy "members read memberships" on org_members
  for select using (is_org_member(org_id));
create policy "owners manage memberships" on org_members
  for all using (is_org_owner(org_id)) with check (is_org_owner(org_id));

create policy "members read tax settings" on tax_settings
  for select using (is_org_member(org_id));
create policy "managers update tax settings" on tax_settings
  for update using (is_org_manager(org_id)) with check (is_org_manager(org_id));

-- ── Catalogue & recipes: members read, managers write ────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'suppliers', 'ingredients', 'ingredient_conversions', 'ingredient_products',
    'recipes', 'recipe_lines', 'fixed_costs', 'fixed_cost_rates', 'fixed_cost_actuals',
    'external_menu_items'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "members read" on %I for select using (is_org_member(org_id))', t);
    execute format(
      'create policy "managers write" on %I for all using (is_org_manager(org_id)) with check (is_org_manager(org_id))', t);
  end loop;
end $$;

-- ── Prices: append-only. Any member may record one; nobody edits one. ────

alter table product_prices enable row level security;
create policy "members read prices" on product_prices
  for select using (is_org_member(org_id));
create policy "members record prices" on product_prices
  for insert with check (is_org_member(org_id) and recorded_by = auth.uid());
-- No update/delete policies: history is immutable (P6).

-- ── Staff & wages: managers only ─────────────────────────────────────────

alter table staff_members enable row level security;
alter table staff_wages enable row level security;
create policy "managers manage staff" on staff_members
  for all using (is_org_manager(org_id)) with check (is_org_manager(org_id));
create policy "managers manage wages" on staff_wages
  for all using (is_org_manager(org_id)) with check (is_org_manager(org_id));

-- ── POS connections: owners only ─────────────────────────────────────────

alter table pos_connections enable row level security;
create policy "owners manage pos connections" on pos_connections
  for all using (is_org_owner(org_id)) with check (is_org_owner(org_id));

-- ── Audit: managers read; written by functions / server only ─────────────

alter table audit_log enable row level security;
create policy "managers read audit log" on audit_log
  for select using (is_org_manager(org_id));

-- Organisations are created by platform admins only (invite-only, P19):
-- see admin_create_organization() in migration 3.
