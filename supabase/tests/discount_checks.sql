-- Behavioural checks for migration 11 (discounts, P27). Run after all
-- migrations on a throwaway database. Same fixtures as the "discounts"
-- block in packages/core/src/pos.test.ts. Prints "ok …" / "FAIL …".
\set ON_ERROR_STOP 0
\set VERBOSITY terse
\set O '''20000000-0000-0000-0000-000000000001'''
\set K '''20000000-0000-0000-0000-000000000002'''

reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  (:O, 'dc-owner@t', '{"full_name":"Dina"}'), (:K, 'dc-cashier@t', '{"full_name":"Kasir"}');
set role service_role;
select id as org from admin_create_organization('Disc Cafe', 'disccafe', :O) \gset
reset role;
select id as outlet from outlets where org_id = :'org' \gset
insert into org_members (org_id, user_id, role, role_id)
  select :'org', :K, 'cashier', id from org_roles where org_id = :'org' and name = 'Cashier';
select org_business_date(:'org') as today \gset

set role authenticated; select set_config('request.jwt.claim.sub', :O, false);
update tax_settings set service_bps = 500, pb1_bps = 1000, pb1_on_service = true where org_id = :'org';
insert into menu_categories (org_id, name) values (:'org', 'Coffee') returning id as cat \gset
insert into menu_items (org_id, category_id, name, price, unit_cost) values (:'org', :'cat', 'Latte', 25000, 7500) returning id as latte \gset
insert into menu_items (org_id, category_id, name, price) values (:'org', :'cat', 'Croissant', 18000) returning id as croissant \gset

-- 20% on Latte, running today
insert into discounts (org_id, name, kind, value, starts_on, ends_on)
  values (:'org', 'Latte day', 'percent', 2000, :'today'::date - 1, :'today'::date + 1) returning id as d1 \gset
insert into discount_items (discount_id, org_id, menu_item_id) values (:'d1', :'org', :'latte');

-- cashier can't create discounts
select set_config('request.jwt.claim.sub', :K, false);
insert into discounts (org_id, name, kind, value, starts_on) values (:'org', 'Sneaky', 'percent', 10000, :'today');
select 'cashier sees discounts (expect 1): ' || count(*) from discounts;

-- 2 latte + 1 croissant: 68.000 − 10.000 = 58.000; service 2.900; PB1 6.090; total 66.990
select id as o1, subtotal, discount_total, service_total, tax_total, grand_total
  from create_order(:'org', :'outlet', gen_random_uuid(),
    jsonb_build_array(jsonb_build_object('menu_item_id', :'latte', 'qty', 2),
                      jsonb_build_object('menu_item_id', :'croissant', 'qty', 1)), 66990) \gset
select case when :subtotal = 58000 and :discount_total = 10000 and :service_total = 2900
             and :tax_total = 6090 and :grand_total = 66990
            then 'ok totals after discount (same as pos.test.ts)' else 'FAIL totals ' || :grand_total end;
select case when line_discount = 10000 and line_subtotal = 40000 and unit_price = 25000 and discount_name = 'Latte day'
            then 'ok line snapshot' else 'FAIL line ' || line_discount || '/' || line_subtotal end
  from order_items where order_id = :'o1' and name_snapshot = 'Latte';
select case when line_discount = 0 and discount_id is null then 'ok croissant undiscounted' else 'FAIL croissant' end
  from order_items where order_id = :'o1' and name_snapshot = 'Croissant';
select 'ok cost unchanged by discount' where (select cost_total from orders where id = :'o1') is null; -- croissant uncosted
select create_order(:'org', :'outlet', gen_random_uuid(),
  jsonb_build_array(jsonb_build_object('menu_item_id', :'latte', 'qty', 1)), 19999);   -- exact is 21.000: short refused

-- all-items Rp 3.000 off: Latte keeps 20% (5.000 > 3.000), Croissant gets 3.000
select set_config('request.jwt.claim.sub', :O, false);
insert into discounts (org_id, name, kind, value, all_items, starts_on)
  values (:'org', 'Everything', 'amount', 3000, true, :'today') returning id as d2 \gset
select set_config('request.jwt.claim.sub', :K, false);
select id as o2, discount_total from create_order(:'org', :'outlet', gen_random_uuid(),
    jsonb_build_array(jsonb_build_object('menu_item_id', :'latte', 'qty', 1),
                      jsonb_build_object('menu_item_id', :'croissant', 'qty', 1)), 100000) \gset
select case when :discount_total = 8000 then 'ok largest wins per line, no stacking' else 'FAIL stacking ' || :discount_total end;

-- weekday filter: only on a day that isn't today → no discount
select set_config('request.jwt.claim.sub', :O, false);
update discounts set weekdays = array[(extract(isodow from :'today'::date)::int % 7) + 1] where id in (:'d1', :'d2');
select set_config('request.jwt.claim.sub', :K, false);
select case when discount_total = 0 then 'ok weekday filter' else 'FAIL weekday' end
  from create_order(:'org', :'outlet', gen_random_uuid(),
    jsonb_build_array(jsonb_build_object('menu_item_id', :'latte', 'qty', 1)), 100000);
select set_config('request.jwt.claim.sub', :O, false);
update discounts set weekdays = array[extract(isodow from :'today'::date)::int] where id = :'d1';
select set_config('request.jwt.claim.sub', :K, false);
select case when discount_total = 5000 then 'ok runs on its weekday' else 'FAIL weekday on' end
  from create_order(:'org', :'outlet', gen_random_uuid(),
    jsonb_build_array(jsonb_build_object('menu_item_id', :'latte', 'qty', 1)), 100000);

-- ended / inactive
select set_config('request.jwt.claim.sub', :O, false);
update discounts set ends_on = :'today'::date - 1, starts_on = :'today'::date - 5 where id = :'d1';
update discounts set active = false where id = :'d2';
select set_config('request.jwt.claim.sub', :K, false);
select case when discount_total = 0 then 'ok ended and inactive ignored' else 'FAIL ended' end
  from create_order(:'org', :'outlet', gen_random_uuid(),
    jsonb_build_array(jsonb_build_object('menu_item_id', :'latte', 'qty', 1),
                      jsonb_build_object('menu_item_id', :'croissant', 'qty', 1)), 100000);

-- rounding: 12,5% of 18.500 = 2.312,5 → 2.313; fixed amount never below 0
select set_config('request.jwt.claim.sub', :O, false);
insert into menu_items (org_id, category_id, name, price) values (:'org', :'cat', 'Tea', 18500) returning id as tea \gset
insert into menu_items (org_id, category_id, name, price) values (:'org', :'cat', 'Water', 4000) returning id as water \gset
insert into discounts (org_id, name, kind, value, starts_on) values (:'org', 'Tea', 'percent', 1250, :'today') returning id as d3 \gset
insert into discount_items (discount_id, org_id, menu_item_id) values (:'d3', :'org', :'tea');
insert into discounts (org_id, name, kind, value, starts_on) values (:'org', 'Free water', 'amount', 5000, :'today') returning id as d4 \gset
insert into discount_items (discount_id, org_id, menu_item_id) values (:'d4', :'org', :'water');
select set_config('request.jwt.claim.sub', :K, false);
select id as o3 from create_order(:'org', :'outlet', gen_random_uuid(),
    jsonb_build_array(jsonb_build_object('menu_item_id', :'tea', 'qty', 1),
                      jsonb_build_object('menu_item_id', :'water', 'qty', 3)), 100000) \gset
select case when line_discount = 2313 then 'ok percent rounds half away from zero' else 'FAIL rounding ' || line_discount end
  from order_items where order_id = :'o3' and name_snapshot = 'Tea';
select case when line_discount = 12000 and line_subtotal = 0 then 'ok fixed amount capped at the price' else 'FAIL cap ' || line_discount end
  from order_items where order_id = :'o3' and name_snapshot = 'Water';

-- bad values refused
select set_config('request.jwt.claim.sub', :O, false);
insert into discounts (org_id, name, kind, value, starts_on) values (:'org', 'Too much', 'percent', 10001, :'today');
insert into discounts (org_id, name, kind, value, starts_on, ends_on) values (:'org', 'Backwards', 'amount', 1, :'today', :'today'::date - 1);
insert into discounts (org_id, name, kind, value, starts_on, weekdays) values (:'org', 'Day 8', 'amount', 1, :'today', array[8]);
select best_discount(:'org', :'latte', 25000, 1, :'today');           -- clients can't call it directly

-- receipt data carries the discount
reset role;
insert into print_devices (org_id, outlet_id, name, token_prefix, token_hash)
  values (:'org', :'outlet', 'P', 'pdt_test', encode(digest('pdt_disc', 'sha256'), 'hex'));
set role anon;
select case when (device_receipt_data('pdt_disc', :'o1')->'items') @> '[{"name_snapshot":"Latte","line_discount":10000,"discount_name":"Latte day"}]'
             and (device_receipt_data('pdt_disc', :'o1')->'order'->>'discount_total')::int = 10000
            then 'ok receipt data has the discount' else 'FAIL receipt data' end;
reset role;

-- save_discount: menu managers only, items or all, atomic
set role authenticated; select set_config('request.jwt.claim.sub', :K, false);
select save_discount(:'org', null, 'X', 'percent', 1000, true, null, :'today', null, null, true);     -- cashier refused
select set_config('request.jwt.claim.sub', :O, false);
select save_discount(:'org', null, 'Empty', 'percent', 1000, false, array[]::uuid[], :'today', null, null, true); -- needs items
select save_discount(:'org', null, 'Two', 'amount', 2000, false, array[:'latte', :'tea']::uuid[], :'today', null, array[1,2], true) as d5 \gset
select 'ok save with items' where (select count(*) from discount_items where discount_id = :'d5') = 2;
select save_discount(:'org', :'d5', 'Two', 'amount', 2000, true, null, :'today', null, null, false);
select 'ok edit to all items clears the list' where (select count(*) from discount_items where discount_id = :'d5') = 0
  and (select all_items and not active from discounts where id = :'d5');
reset role;
