-- Behavioural checks for migration 13 (table service, P29). Run after all
-- migrations on a throwaway database. Prints "ok …" / "FAIL …".
\set ON_ERROR_STOP 0
\set VERBOSITY terse
\set O '''30000000-0000-0000-0000-000000000001'''
\set W '''30000000-0000-0000-0000-000000000002'''
\set M '''30000000-0000-0000-0000-000000000003'''
\set X '''30000000-0000-0000-0000-000000000004'''

reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  (:O, 'tb-owner@t', '{"full_name":"Kawa Owner"}'), (:W, 'tb-waiter@t', '{"full_name":"Wawan"}'),
  (:M, 'tb-manager@t', '{"full_name":"Mira"}'), (:X, 'tb-other@t', '{}');
set role service_role;
select id as org from admin_create_organization('Kawa', 'kawa-test', :O) \gset
select id as org2 from admin_create_organization('Other', 'other-test', :X) \gset
reset role;
select id as outlet from outlets where org_id = :'org' \gset
insert into org_members (org_id, user_id, role, role_id)
  select :'org', :W, 'cashier', id from org_roles where org_id = :'org' and name = 'Cashier';
insert into org_members (org_id, user_id, role, role_id)
  select :'org', :M, 'cashier', id from org_roles where org_id = :'org' and name = 'Manager';

set role authenticated; select set_config('request.jwt.claim.sub', :O, false);
update tax_settings set service_bps = 500, pb1_bps = 1000, pb1_on_service = true where org_id = :'org';
insert into menu_categories (org_id, name) values (:'org', 'Coffee') returning id as cat \gset
insert into menu_items (org_id, category_id, name, price, unit_cost) values (:'org', :'cat', 'Latte', 25000, 7500) returning id as latte \gset
insert into menu_items (org_id, category_id, name, price, unit_cost) values (:'org', :'cat', 'Croissant', 18000, 6000) returning id as croissant \gset

-- switch: settings.manage only; creates a Main area
select set_config('request.jwt.claim.sub', :W, false);
select set_table_service(:'outlet', true);                                   -- waiter refused
select set_config('request.jwt.claim.sub', :O, false);
select set_table_service(:'outlet', true);
select id as area from floor_areas where outlet_id = :'outlet' \gset
select 'ok switch on makes an area' where (select table_service from outlets where id = :'outlet');

-- floor plan
select save_floor_plan(:'area', '[{"name":"1","seats":2,"shape":"round","x":0,"y":0,"w":2,"h":2},
                                  {"name":"2","seats":4,"shape":"square","x":3,"y":0,"w":2,"h":2},
                                  {"name":"3","seats":6,"shape":"long","x":6,"y":0,"w":4,"h":2}]');
select id as t1 from dining_tables where outlet_id = :'outlet' and name = '1' \gset
select id as t2 from dining_tables where outlet_id = :'outlet' and name = '2' \gset
select id as t3 from dining_tables where outlet_id = :'outlet' and name = '3' \gset
select 'ok three tables' where (select count(*) from dining_tables where outlet_id = :'outlet') = 3;
select save_floor_plan(:'area', '[{"name":"1","seats":2,"shape":"round","x":0,"y":0,"w":2,"h":2},
                                  {"name":"1","seats":2,"shape":"round","x":9,"y":9,"w":2,"h":2}]'); -- duplicate number refused
select 'ok refused plan left tables alone' where (select count(*) from dining_tables where outlet_id = :'outlet' and active) = 3;
select set_config('request.jwt.claim.sub', :W, false);
select save_floor_plan(:'area', '[]');                                       -- waiter refused
insert into dining_tables (org_id, outlet_id, area_id, name) values (:'org', :'outlet', :'area', 'X'); -- no direct writes

-- round 1 on table 1: 2 latte + 1 croissant (same lines as pos_checks / discount fixtures)
select send_round(:'org', :'outlet', :'t1', null, '31000000-0000-0000-0000-000000000001',
  jsonb_build_array(jsonb_build_object('menu_item_id', :'latte', 'qty', 2),
                    jsonb_build_object('menu_item_id', :'croissant', 'qty', 1, 'note', 'warm')), 2)->>'order_id' as bill \gset
select case when status = 'open' and grand_total = 78540 and table_id = :'t1' and guests = 2 and queue_no is null
            then 'ok round 1 opens a bill (78.540 like create_order)' else 'FAIL open ' || grand_total end
  from orders where id = :'bill';
select case when (send_round(:'org', :'outlet', :'t1', null, '31000000-0000-0000-0000-000000000001',
                  jsonb_build_array(jsonb_build_object('menu_item_id', :'latte', 'qty', 9)))->>'round_no') = '1'
            then 'ok same request id = same round (no double add)' else 'FAIL idempotent' end;
select 'ok no extra lines after retry' where (select count(*) from order_items where order_id = :'bill') = 2;

-- round 2, the same bill; a stale or wrong bill id is refused
select send_round(:'org', :'outlet', :'t1', :'bill', '31000000-0000-0000-0000-000000000002',
  jsonb_build_array(jsonb_build_object('menu_item_id', :'latte', 'qty', 1)));
select case when grand_total = 107415 and subtotal = 93000 and cost_total = 28500
            then 'ok round 2 re-totals on the whole bill' else 'FAIL round 2 ' || grand_total || '/' || subtotal end
  from orders where id = :'bill';
select 'ok two rounds' where (select count(*) from order_rounds where order_id = :'bill') = 2;
select send_round(:'org', :'outlet', :'t1', gen_random_uuid(), gen_random_uuid(),
  jsonb_build_array(jsonb_build_object('menu_item_id', :'latte', 'qty', 1)));      -- different bill id refused
-- a second waiter opening table 1 "fresh" joins the open bill instead of a second one
select case when (send_round(:'org', :'outlet', :'t1', null, gen_random_uuid(),
                  jsonb_build_array(jsonb_build_object('menu_item_id', :'croissant', 'qty', 1)))->>'order_id') = :'bill'
            then 'ok fresh round on a busy table joins its bill' else 'FAIL second bill' end;
select 'ok one open bill per table' where (select count(*) from orders where table_id = :'t1' and status = 'open') = 1;

-- remove a sent line: waiter refused, manager with reason
select id as croissant_line from order_items where order_id = :'bill' and name_snapshot = 'Croissant'
  and modifiers_json <> '[]' \gset
select void_bill_item(:'croissant_line', 'wrong item');                       -- waiter refused
select set_config('request.jwt.claim.sub', :M, false);
select void_bill_item(:'croissant_line', '');                                 -- reason required
select case when grand_total = 107415 then 'ok manager removes a sent line, bill re-totals' else 'FAIL void line ' || grand_total end
  from void_bill_item(:'croissant_line', 'wrong item');
reset role;
select 'ok line void audited' where exists (select 1 from audit_log where action = 'void_bill_item' and entity_id = :'croissant_line');
set role authenticated; select set_config('request.jwt.claim.sub', :W, false);

-- kitchen rounds
select id as r1 from order_rounds where order_id = :'bill' and round_no = 1 \gset
select set_round_done(:'r1', true);
select 'ok round done' where (select kitchen_done_at is not null from order_rounds where id = :'r1');

-- move: to a busy table refused; to a free one works
select send_round(:'org', :'outlet', :'t2', null, gen_random_uuid(),
  jsonb_build_array(jsonb_build_object('menu_item_id', :'latte', 'qty', 1)))->>'order_id' as bill2 \gset
select move_bill(:'bill', :'t2');                                             -- busy
select case when table_id = :'t3' then 'ok bill moved to a free table' else 'FAIL move' end from move_bill(:'bill', :'t3');

-- pre-bill print
select print_bill(:'bill');
select 'ok pre-bill queued' where (select bill_printed_at is not null from orders where id = :'bill')
  and exists (select 1 from print_jobs where order_id = :'bill' and payload->>'bill' = 'true');
select send_round(:'org', :'outlet', :'t3', :'bill', gen_random_uuid(),
  jsonb_build_array(jsonb_build_object('menu_item_id', :'croissant', 'qty', 1)));
select 'ok new round clears the printed mark' where (select bill_printed_at is null from orders where id = :'bill');

-- receipt data: rounds merged per item, voided gone, table name there
reset role;
insert into print_devices (org_id, outlet_id, name, token_prefix, token_hash)
  values (:'org', :'outlet', 'P', 'pdt_tbl', encode(digest('pdt_table', 'sha256'), 'hex'));
set role anon;
select case when (device_receipt_data('pdt_table', :'bill')->'items') @> '[{"name_snapshot":"Latte","qty":3,"line_subtotal":75000}]'
             and jsonb_array_length(device_receipt_data('pdt_table', :'bill')->'items') = 2
             and device_receipt_data('pdt_table', :'bill')->'order'->>'table_name' = '3'
            then 'ok receipt merges rounds' else 'FAIL receipt ' || (device_receipt_data('pdt_table', :'bill')->'items')::text end;
reset role;

-- settle: short refused; pays, counts today, prints, frees the table; double tap safe
set role authenticated; select set_config('request.jwt.claim.sub', :W, false);
select grand_total as due from orders where id = :'bill' \gset
select settle_bill(:'bill', :due - 1);
select case when status = 'paid' and business_date = org_business_date(:'org') and closed_at is not null
            then 'ok bill paid' else 'FAIL settle' end from settle_bill(:'bill', :due + 5000);
select case when status = 'paid' then 'ok second tap returns the paid bill' else 'FAIL' end from settle_bill(:'bill', :due + 5000);
select 'ok one payment with change' where (select count(*) from payments where order_id = :'bill') = 1
  and (select change_given from payments where order_id = :'bill') = 5000;
select send_round(:'org', :'outlet', :'t3', :'bill', gen_random_uuid(),
  jsonb_build_array(jsonb_build_object('menu_item_id', :'latte', 'qty', 1)));   -- paid bill: refused
select void_bill_item((select id from order_items where order_id = :'bill' limit 1), 'late'); -- paid: refused

-- cancel an open bill: manager only
select void_order(:'bill2', 'guests left');                                    -- waiter refused
select set_config('request.jwt.claim.sub', :M, false);
select case when status = 'voided' then 'ok manager cancels an open bill' else 'FAIL' end from void_order(:'bill2', 'guests left');

-- switch off: refused while a bill is open
select set_config('request.jwt.claim.sub', :W, false);
select send_round(:'org', :'outlet', :'t1', null, gen_random_uuid(),
  jsonb_build_array(jsonb_build_object('menu_item_id', :'latte', 'qty', 1)))->>'order_id' as bill3 \gset
select set_config('request.jwt.claim.sub', :O, false);
select set_table_service(:'outlet', false);                                    -- open bill: refused
-- removing a table with an open bill refused; a used table is hidden, an unused one deleted
select save_floor_plan(:'area', '[]');
select save_floor_plan(:'area', (select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'seats', seats,
          'shape', shape, 'x', x, 'y', y, 'w', w, 'h', h)) from dining_tables where id = :'t1'));
select 'ok used tables hidden, never deleted' where (select count(*) from dining_tables where id in (:'t2', :'t3') and not active) = 2;

-- pay-now sales still work at a table-service branch (takeaway)
select set_config('request.jwt.claim.sub', :W, false);
select case when status = 'paid' and queue_no is not null and table_id is null then 'ok takeaway still pays at once' else 'FAIL takeaway' end
  from create_order(:'org', :'outlet', gen_random_uuid(),
    jsonb_build_array(jsonb_build_object('menu_item_id', :'latte', 'qty', 1)), 100000);

-- another restaurant can't touch it
select set_config('request.jwt.claim.sub', :X, false);
select send_round(:'org', :'outlet', :'t1', :'bill3', gen_random_uuid(),
  jsonb_build_array(jsonb_build_object('menu_item_id', :'latte', 'qty', 1)));
select settle_bill(:'bill3', 999999);
select 'outsider sees tables (expect 0): ' || count(*) from dining_tables where org_id = :'org';
-- table service off branch refuses rounds
select set_config('request.jwt.claim.sub', :O, false);
select send_round(:'org2', (select id from outlets where org_id = :'org2'), :'t1', null, gen_random_uuid(),
  jsonb_build_array(jsonb_build_object('menu_item_id', :'latte', 'qty', 1)));
reset role;
