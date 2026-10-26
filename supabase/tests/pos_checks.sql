-- Behavioural checks for migration 3. Run after all migrations on a
-- throwaway database (see logs/operations.md). Prints "ok …" / "FAIL …".
\set ON_ERROR_STOP 0
\set VERBOSITY terse
\set A '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set C '''cccccccc-0000-0000-0000-00000000000c'''
\set B '''bbbbbbbb-0000-0000-0000-00000000000b'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:A, 'owner@a', '{"full_name":"Ani Owner"}'), (:C, 'cashier@a', '{"full_name":"Citra"}'), (:B, 'owner@b', '{}');
select 'ok profile from metadata' where (select full_name from profiles where id = :A) = 'Ani Owner';

-- anon/authenticated cannot create orgs; service role can
set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
select admin_create_organization('X', 'x', :A);
reset role;
set role service_role;
select id as org_a from admin_create_organization('Fokas Cafe', 'fokas', :A) \gset
select id as org_b from admin_create_organization('Other', 'other', :B) \gset
reset role;
insert into org_members (org_id, user_id, role) values (:'org_a', :C, 'cashier');
select id as outlet_a from outlets where org_id = :'org_a' \gset
select id as outlet_b from outlets where org_id = :'org_b' \gset
select 'ok defaults created' where (select count(*) from org_settings) = 2 and (select count(*) from tax_settings) = 2;

-- owner sets up menu: PB1 10%, service 5%, exclusive
set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
update tax_settings set service_bps = 500, pb1_bps = 1000 where org_id = :'org_a';
insert into menu_categories (org_id, name) values (:'org_a', 'Coffee') returning id as cat \gset
insert into menu_items (org_id, category_id, name, price, unit_cost) values (:'org_a', :'cat', 'Latte', 25000, 7500) returning id as latte \gset
insert into menu_items (org_id, category_id, name, price) values (:'org_a', :'cat', 'Croissant', 18000) returning id as croissant \gset

-- cashier sells: 2 latte + 1 croissant = 68.000; service 3.400; PB1 7.140; total 78.540
select set_config('request.jwt.claim.sub', :C, false);
select id as o1, order_no, queue_no, subtotal, service_total, tax_total, grand_total, cost_total
  from create_order(:'org_a', :'outlet_a', '11111111-1111-1111-1111-111111111111',
    jsonb_build_array(jsonb_build_object('menu_item_id', :'latte', 'qty', 2),
                      jsonb_build_object('menu_item_id', :'croissant', 'qty', 1, 'note', ' less sugar ')),
    100000) \gset
select case when :subtotal = 68000 and :service_total = 3400 and :tax_total = 7140 and :grand_total = 78540
            then 'ok exclusive totals' else 'FAIL exclusive totals ' || :grand_total end;
select case when cost_total is null then 'ok cost_total null when a line is uncosted' else 'FAIL cost_total' end from orders where id = :'o1';
select 'ok unit cost snapshotted' where (select unit_cost from order_items where order_id = :'o1' and name_snapshot = 'Latte') = 7500;
select 'ok note stored' where (select modifiers_json->0->>'note' from order_items where order_id = :'o1' and name_snapshot = 'Croissant') = 'less sugar';
select 'ok receipt job queued' where (select count(*) from print_jobs where order_id = :'o1' and kind = 'receipt') = 1;
select 'ok change' where (select change_given from payments where order_id = :'o1') = 21460;

-- idempotent retry returns the same order, no second receipt
select case when id = :'o1' then 'ok idempotent' else 'FAIL idempotent' end
  from create_order(:'org_a', :'outlet_a', '11111111-1111-1111-1111-111111111111',
    jsonb_build_array(jsonb_build_object('menu_item_id', :'latte', 'qty', 9)), 999999);
select 'ok one order' where (select count(*) from orders) = 1;

-- second order numbers
select case when order_no = 2 and queue_no = 2 then 'ok numbering' else 'FAIL numbering' end
  from create_order(:'org_a', :'outlet_a', gen_random_uuid(),
    jsonb_build_array(jsonb_build_object('menu_item_id', :'latte', 'qty', 1)), 50000);

-- underpaid, cross-org item, bad qty, wrong outlet
select create_order(:'org_a', :'outlet_a', gen_random_uuid(), jsonb_build_array(jsonb_build_object('menu_item_id', :'latte', 'qty', 1)), 1000);
select create_order(:'org_a', :'outlet_b', gen_random_uuid(), jsonb_build_array(jsonb_build_object('menu_item_id', :'latte', 'qty', 1)), 50000);
select create_order(:'org_a', :'outlet_a', gen_random_uuid(), jsonb_build_array(jsonb_build_object('menu_item_id', :'latte', 'qty', 0)), 50000);
select create_order(:'org_b', :'outlet_b', gen_random_uuid(), jsonb_build_array(jsonb_build_object('menu_item_id', :'latte', 'qty', 1)), 50000);

-- cashier cannot write menu or void, cannot add printer
with x as (update menu_items set price = 1 returning 1) select 'cashier price edits (expect 0): ' || count(*) from x;
select void_order(:'o1', 'test');
select create_print_device(:'org_a', :'outlet_a', 'Counter');
-- cashier can mark kitchen done and reprint
select set_kitchen_done(:'o1', true);
select 'ok kitchen done' where (select kitchen_done_at is not null from orders where id = :'o1');
select queue_reprint(:'o1');
select 'ok reprint queued' where (select count(*) from print_jobs where order_id = :'o1' and kind = 'reprint') = 1;

-- owner B sees nothing of A and cannot act on it
select set_config('request.jwt.claim.sub', :B, false);
select 'B sees A orders (expect 0): ' || count(*) from orders where org_id = :'org_a';
select set_kitchen_done(:'o1', false);
select queue_reprint(:'o1');
select void_order(:'o1', 'hostile');
select (sales_summary(:'org_a', current_date - 1, current_date + 1)->'totals'->>'orders') as b_sees_orders_expect_0;

-- inclusive pricing: owner B, PB1 10% + service 5% included. 57.750 → base 50.000
update tax_settings set price_mode = 'inclusive', service_bps = 500, pb1_bps = 1000 where org_id = :'org_b';
insert into menu_categories (org_id, name) values (:'org_b', 'Food') returning id as cat_b \gset
insert into menu_items (org_id, category_id, name, price, unit_cost) values (:'org_b', :'cat_b', 'Nasi', 57750, 20000) returning id as nasi \gset
select case when subtotal = 50000 and service_total = 2500 and tax_total = 5250 and grand_total = 57750 and cost_total = 20000
            then 'ok inclusive totals' else 'FAIL inclusive ' || subtotal || '/' || service_total || '/' || tax_total end
  from create_order(:'org_b', :'outlet_b', gen_random_uuid(), jsonb_build_array(jsonb_build_object('menu_item_id', :'nasi', 'qty', 1)), 57750);
-- awkward price: parts must still sum to what was charged
update menu_items set price = 33333 where id = :'nasi';
select case when subtotal + service_total + tax_total = grand_total and grand_total = 33333
            then 'ok inclusive remainder' else 'FAIL inclusive remainder' end
  from create_order(:'org_b', :'outlet_b', gen_random_uuid(), jsonb_build_array(jsonb_build_object('menu_item_id', :'nasi', 'qty', 1)), 40000);
-- 33.333 ÷ 1,155 = 28.859,74 → 28.860; service 1.443; PB1 takes the remainder 3.030
select case when subtotal = 28860 and service_total = 1443 and tax_total = 3030
            then 'ok inclusive 33333 fixture' else 'FAIL inclusive 33333: ' || subtotal || '/' || service_total || '/' || tax_total end
  from orders where org_id = :'org_b' and grand_total = 33333;

-- owner A voids; same-day rule; audit
select set_config('request.jwt.claim.sub', :A, false);
select case when status = 'voided' then 'ok void' else 'FAIL void' end from void_order(:'o1', 'Customer changed mind');
select 'ok payment refunded' where (select status from payments where order_id = :'o1') = 'refunded';
select 'ok audit' where (select count(*) from audit_log where action = 'void_order') = 1;
select void_order(:'o1', 'again');

-- sales summary for A: order 2 only (25.000 latte, costed)
select case when (s->'totals'->>'orders')::int = 1 and (s->'voided'->>'orders')::int = 1
             and (s->'totals'->>'cogs')::int = 7500 and (s->'totals'->>'costed_subtotal')::int = 25000
            then 'ok sales summary' else 'FAIL sales summary ' || s::text end
  from (select sales_summary(:'org_a', current_date - 1, current_date + 1) s) x;

-- printers: owner issues a token; device sees only its outlet
select create_print_device(:'org_a', :'outlet_a', 'Counter') as tok_a \gset
select set_config('request.jwt.claim.sub', :B, false);
select create_print_device(:'org_b', :'outlet_b', 'B printer') as tok_b \gset
select 'B cannot see A devices (expect 0): ' || count(*) from print_devices where org_id = :'org_a';
reset role;

-- A real anon request carries no user id.
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select 'anon reads orders (expect 0): ' || count(*) from orders;
select create_order(:'org_a', :'outlet_a', gen_random_uuid(), '[]', 0);
select device_claim_print_jobs('pdt_wrong');
select 'device A claims (expect 3: 2 receipts + 1 reprint): ' || count(*) from device_claim_print_jobs(:'tok_a', 10);
select 'device B claims (expect 2): ' || count(*) from device_claim_print_jobs(:'tok_b', 10);
select 'device A claims again (expect 0): ' || count(*) from device_claim_print_jobs(:'tok_a', 10);
select case when (d->'order'->>'order_no')::int = 1 and d->'order'->>'cashier' = 'Citra'
             and jsonb_array_length(d->'items') = 2 and d->'order' ? 'cost_total' = false
            then 'ok receipt data' else 'FAIL receipt data ' || d::text end
  from (select device_receipt_data(:'tok_a', :'o1') d) x;
select device_receipt_data(:'tok_b', :'o1');
select device_finish_print_job(:'tok_a', id, true) from print_jobs where order_id = :'o1' and kind = 'receipt';
reset role;
select 'ok printed' where (select status from print_jobs where order_id = :'o1' and kind = 'receipt') = 'printed';
select device_finish_print_job(:'tok_b', id, true) from print_jobs where order_id = :'o1' and kind = 'reprint';
select 'ok foreign device cannot finish' where (select status from print_jobs where order_id = :'o1' and kind = 'reprint') = 'claimed';

-- revoke
set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
select revoke_print_device(id) from print_devices where org_id = :'org_a';
reset role; set role anon;
select device_claim_print_jobs(:'tok_a');
reset role;

-- last owner protection
update org_members set role = 'manager' where user_id = :A and org_id = :'org_a';
update org_members set active = false where user_id = :A and org_id = :'org_a';
select 'ok owner kept' where (select role from org_members where user_id = :A and org_id = :'org_a') = 'owner';

-- deactivated cashier loses access
update org_members set active = false where user_id = :C;
set role authenticated; select set_config('request.jwt.claim.sub', :C, false);
select 'inactive cashier sees orders (expect 0): ' || count(*) from orders;
select create_order(:'org_a', :'outlet_a', gen_random_uuid(), jsonb_build_array(jsonb_build_object('menu_item_id', :'latte', 'qty', 1)), 50000);
reset role;

-- tenant lookup
insert into org_domains (org_id, hostname) values (:'org_a', 'pos.fokas.id');
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select case when resolve_tenant_host('POS.fokas.id:443') = 'fokas' then 'ok host resolves' else 'FAIL host' end;
select case when (select name from tenant_public_info('fokas')) = 'Fokas Cafe' then 'ok public info' else 'FAIL public info' end;
select 'anon reads domains (expect 0): ' || count(*) from org_domains;

-- deleting a whole restaurant is allowed (cascade past the owner guard);
-- deleting the account of its sole owner is not
reset role;
delete from print_jobs where org_id = :'org_b';
delete from payments where org_id = :'org_b';
delete from orders where org_id = :'org_b';
delete from auth.users where id = :B;
select 'ok sole owner account protected' where exists (select 1 from auth.users where id = :B);
delete from organizations where id = :'org_b';
select 'ok restaurant deleted' where not exists (select 1 from organizations where id = :'org_b');

-- save_recipe: atomic, RLS-bound
select set_config('request.jwt.claim.sub', :A, false);
set role authenticated;
insert into ingredients (org_id, name) values (:'org_a', 'Susu') returning id as ing_milk \gset
insert into ingredient_products (org_id, ingredient_id, name, pack_qty, pack_unit) values (:'org_a', :'ing_milk', 'UHT 1L', 1, 'l') returning id as milk \gset
insert into recipes (org_id, kind, name) values (:'org_a', 'prep', 'Base') returning id as base \gset
insert into recipes (org_id, kind, name) values (:'org_a', 'menu_item', 'Latte r') returning id as latte_r \gset
select save_recipe(:'base', 'Base', 1, 'l', jsonb_build_array(jsonb_build_object('product_id', :'milk', 'qty', 1, 'unit', 'l')));
select save_recipe(:'latte_r', 'Latte r', 1, 'pcs', jsonb_build_array(
  jsonb_build_object('product_id', :'milk', 'qty', 150, 'unit', 'ml', 'waste_bps', 500),
  jsonb_build_object('sub_recipe_id', :'base', 'qty', 50, 'unit', 'ml')));
select 'ok save_recipe lines' where (select count(*) from recipe_lines where recipe_id = :'latte_r') = 2;
-- a cycle is refused and the old lines survive
select save_recipe(:'base', 'Base', 1, 'l', jsonb_build_array(jsonb_build_object('sub_recipe_id', :'latte_r', 'qty', 1, 'unit', 'pcs')));
select 'ok failed save keeps old lines' where (select count(*) from recipe_lines where recipe_id = :'base' and product_id = :'milk') = 1;
-- cashier cannot
select set_config('request.jwt.claim.sub', :C, false);
select save_recipe(:'latte_r', 'Hacked', 1, 'pcs', '[]');
reset role;
select 'ok cashier save refused' where (select name from recipes where id = :'latte_r') = 'Latte r';
