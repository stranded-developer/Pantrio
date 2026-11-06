-- Behavioural checks for migration 9 (terminals, PINs, time clock). Run
-- after all migrations on a throwaway database, on its own or after
-- pos_checks.sql. Prints "ok …" / "FAIL …" / "… (expect …)".
\set ON_ERROR_STOP 0
\set VERBOSITY terse
\set O '''10000000-0000-0000-0000-000000000001'''
\set M '''10000000-0000-0000-0000-000000000002'''
\set K '''10000000-0000-0000-0000-000000000003'''
\set X '''10000000-0000-0000-0000-000000000004'''

reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  (:O, 'tc-owner@t', '{"full_name":"Tari Owner"}'), (:M, 'tc-manager@t', '{"full_name":"Mira"}'),
  (:K, 'tc-cashier@t', '{"full_name":"Kiki"}'), (:X, 'tc-other@t', '{}');
reset role; reset role; set role service_role;
select id as org_t from admin_create_organization('Time Cafe', 'timecafe', :O) \gset
select id as org_x from admin_create_organization('Elsewhere', 'elsewhere', :X) \gset
reset role;
select id as outlet_t from outlets where org_id = :'org_t' \gset
select id as outlet_x from outlets where org_id = :'org_x' \gset
insert into org_members (org_id, user_id, role, role_id)
  select :'org_t', :M, 'cashier', id from org_roles where org_id = :'org_t' and name = 'Manager';
insert into org_members (org_id, user_id, role, role_id)
  select :'org_t', :K, 'cashier', id from org_roles where org_id = :'org_t' and name = 'Cashier';
select 'ok new restaurants: manager has timesheets'
  where (select 'timesheets.manage' = any(permissions) from org_roles where org_id = :'org_t' and name = 'Manager');
select 'ok cashier has no timesheets'
  where not (select 'timesheets.manage' = any(permissions) from org_roles where org_id = :'org_t' and name = 'Cashier');

-- ── terminals ──
set role authenticated; select set_config('request.jwt.claim.sub', :K, false);
select create_terminal(:'org_t', :'outlet_t', 'Counter');            -- cashier refused
select set_config('request.jwt.claim.sub', :M, false);
select create_terminal(:'org_t', :'outlet_t', 'Counter') as tok \gset
select create_terminal(:'org_t', :'outlet_x', 'Wrong branch');       -- other org's outlet refused
select 'ok token shape' where :'tok' ~ '^pnt_[0-9a-f]{48}$';
select 'ok token stored hashed' where (select count(*) from terminals where token_hash = :'tok') = 0;
select case when slug = 'timecafe' and outlet_id = :'outlet_t' and idle_minutes = 5 then 'ok terminal_info' else 'FAIL terminal_info' end
  from terminal_info(:'tok');
select 'terminal_info bad token rows (expect 0): ' || count(*) from terminal_info('pnt_nope');
select set_config('request.jwt.claim.sub', :X, false);
select 'other org sees terminals (expect 0): ' || count(*) from terminals;
select set_config('request.jwt.claim.sub', :M, false);
select set_terminal_options(:'org_t', 3, true);
select 'ok terminal options' where (select idle_minutes = 3 and lock_after_sale from terminal_info(:'tok'));

-- ── PINs ──
select set_member_pin(:'org_t', :K, '1234');                          -- manager refused: owners only
select set_config('request.jwt.claim.sub', :O, false);
select set_member_pin(:'org_t', :K, '1234');
select set_member_pin(:'org_t', :M, '1234');                          -- duplicate refused
select set_member_pin(:'org_t', :M, '12a4');                          -- not digits refused
select set_member_pin(:'org_t', :M, '987654');
select set_member_pin(:'org_t', :X, '5555');                          -- not a member refused
select 'pin holders (expect 2): ' || count(*) from org_pin_holders(:'org_t');
select 'ok pins unreadable by clients' where not exists (select 1 from member_pins);
select set_config('request.jwt.claim.sub', :M, false);
select 'pin holders seen by manager (expect 0): ' || count(*) from org_pin_holders(:'org_t');

-- PIN sign-in is server-only
select terminal_pin_sign_in(:'tok', '1234');                          -- authenticated refused
reset role; set role anon;
select terminal_pin_sign_in(:'tok', '1234');                          -- anon refused
reset role; reset role; set role service_role;
select case when r->>'ok' = 'true' and r->>'user_id' = :K and r->>'email' = 'tc-cashier@t' and r->>'name' = 'Kiki'
            then 'ok PIN sign-in' else 'FAIL PIN sign-in ' || r::text end
  from terminal_pin_sign_in(:'tok', '1234') r;
select case when r->>'reason' = 'terminal' then 'ok unknown terminal' else 'FAIL ' || r::text end
  from terminal_pin_sign_in('pnt_nope', '1234') r;
-- the same PIN is not valid at another restaurant's terminal
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :X, false);
select create_terminal(:'org_x', :'outlet_x', 'X till') as tok_x \gset
reset role; reset role; set role service_role;
select case when r->>'reason' = 'wrong' then 'ok PIN is per restaurant' else 'FAIL ' || r::text end
  from terminal_pin_sign_in(:'tok_x', '1234') r;
-- deactivated staff cannot sign in by PIN
reset role; update org_members set active = false where user_id = :K and org_id = :'org_t'; reset role; set role service_role;
select case when r->>'reason' = 'wrong' then 'ok inactive staff refused' else 'FAIL ' || r::text end
  from terminal_pin_sign_in(:'tok', '1234') r;
reset role; update org_members set active = true where user_id = :K and org_id = :'org_t';
update terminals set failed_pins = 0 where token_prefix = left(:'tok', 12);
reset role; reset role; set role service_role;
-- 5 wrong → locked, and the right PIN is refused while locked
select terminal_pin_sign_in(:'tok', '0000')->>'reason' from generate_series(1, 4);
select case when r->>'reason' = 'locked' then 'ok locked after 5 wrong' else 'FAIL lockout ' || r::text end
  from terminal_pin_sign_in(:'tok', '0001') r;
select case when r->>'reason' = 'locked' then 'ok right PIN refused while locked' else 'FAIL ' || r::text end
  from terminal_pin_sign_in(:'tok', '1234') r;
select terminal_pin_sign_in(:'tok', '1234')->>'reason' as still_locked_later \gset
select case when :'still_locked_later' = 'locked' then 'ok no timed unlock' else 'FAIL' end;
reset role;
select 'ok lockout audited' where exists (select 1 from audit_log where org_id = :'org_t' and action = 'terminal_locked');
select 'ok terminal_info says locked' where (select hard_locked from terminal_info(:'tok'));
-- reset email targets: owners only, throttled
set role service_role;
select 'reset targets (expect 1): ' || count(*) from terminal_reset_targets(:'tok');
select 'reset targets again (expect 0): ' || count(*) from terminal_reset_targets(:'tok');
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :O, false);
select terminal_reset_targets(:'tok');                                  -- clients refused
select admin_unlock_owner_terminals(:O);                                -- clients refused
reset role; set role service_role;
-- a non-owner proving their email does not unlock
select 'manager unlocks (expect 0): ' || admin_unlock_owner_terminals(:M);
select 'owner reset unlocks (expect 1): ' || admin_unlock_owner_terminals(:O);
select case when r->>'ok' = 'true' then 'ok PIN works after reset' else 'FAIL ' || r::text end
  from terminal_pin_sign_in(:'tok', '1234') r;
-- a right PIN resets the count: 4 wrong, right, 4 wrong → still open
select terminal_pin_sign_in(:'tok', '0000') from generate_series(1, 4);
select terminal_pin_sign_in(:'tok', '1234');
select terminal_pin_sign_in(:'tok', '0000') from generate_series(1, 4);
select case when r->>'ok' = 'true' then 'ok count resets on a right PIN' else 'FAIL ' || r::text end
  from terminal_pin_sign_in(:'tok', '1234') r;
-- backoffice unlock
select terminal_pin_sign_in(:'tok', '0000') from generate_series(1, 5);
select 'backoffice unlocks (expect 1): ' || admin_unlock_org_terminals(:'org_t');
reset role;
select 'ok unlock audited' where (select count(*) from audit_log where org_id = :'org_t' and action = 'terminal_unlocked') = 2;
select 'ok roles: manager may use a password, cashier not'
  where (select allow_password from org_roles where org_id = :'org_t' and name = 'Manager')
    and not (select allow_password from org_roles where org_id = :'org_t' and name = 'Cashier');
set role service_role;
select 'ok logins helper' where (select count(*) from admin_user_logins(array[:O, :K]::uuid[]) where not password_off) = 2;
select admin_end_sessions(:K);
reset role;

-- ── clock in / out ──
set role authenticated; select set_config('request.jwt.claim.sub', :K, false);
select clock_in('pnt_nope');                                          -- no terminal refused
select clock_in(:'tok_x');                                            -- another restaurant's terminal refused
select clock_in(:'tok', 'someone-else/' || :K || '/a.jpg');        -- photo outside own folder refused
select case when status = 'open' and outlet_id = :'outlet_t' then 'ok clocked in' else 'FAIL clock in' end
  from clock_in(:'tok', :'org_t' || '/' || :K || '/in.jpg');
select clock_in(:'tok');                                              -- twice refused
select 'ok status shows on shift' where (my_clock_status(:'org_t')->>'clocked_in_at') is not null;
select 'ok cashier reads own entries' where (select count(*) from time_entries) = 1;
insert into time_entries (org_id, outlet_id, user_id, business_date, clock_in_at)
  values (:'org_t', :'outlet_t', :K, current_date, now());                 -- direct write refused
select case when status = 'closed' and clock_out_at >= clock_in_at then 'ok clocked out' else 'FAIL clock out' end
  from clock_out(:'tok');
select clock_out(:'tok');                                             -- not clocked in refused
select set_config('request.jwt.claim.sub', :X, false);
select 'other org reads entries (expect 0): ' || count(*) from time_entries;

-- forgotten clock-out: an open shift from yesterday becomes missing_out
reset role;
insert into time_entries (org_id, outlet_id, user_id, business_date, clock_in_at)
  values (:'org_t', :'outlet_t', :M, org_business_date(:'org_t') - 1, now() - interval '30 hours')
  returning id as stale \gset
set role authenticated; select set_config('request.jwt.claim.sub', :M, false);
select 'ok missing clock-out reported' where (my_clock_status(:'org_t')->>'missing_out_on') is not null;
select 'ok stale shift marked' where (select status from time_entries where id = :'stale') = 'missing_out';
select case when status = 'open' then 'ok can clock in after a missing clock-out' else 'FAIL' end from clock_in(:'tok');

-- corrections: reason required, own entry refused for a manager, audited
select edit_time_entry(:'stale', now() - interval '30 hours', now() - interval '22 hours', '');
select edit_time_entry(:'stale', now() - interval '30 hours', now() - interval '22 hours', 'forgot');
select set_config('request.jwt.claim.sub', :K, false);
select edit_time_entry(:'stale', now() - interval '30 hours', now() - interval '22 hours', 'cashier tries');
select set_config('request.jwt.claim.sub', :O, false);
select edit_time_entry(:'stale', now() - interval '30 hours', now() - interval '31 hours', 'backwards');
select case when status = 'closed' then 'ok owner fixes missing clock-out' else 'FAIL' end
  from edit_time_entry(:'stale', now() - interval '30 hours', now() - interval '22 hours', 'forgot to clock out');
reset role;
select 'ok edit audited with before' where exists (
  select 1 from audit_log where action = 'edit_time_entry' and entity_id = :'stale' and before->>'status' = 'missing_out');
set role authenticated; select set_config('request.jwt.claim.sub', :M, false);
select case when status = 'closed' then 'ok manager adds a forgotten shift' else 'FAIL' end
  from add_time_entry(:'org_t', :'outlet_t', :K, now() - interval '50 hours', now() - interval '42 hours', 'forgot to clock in');
select add_time_entry(:'org_t', :'outlet_t', :M, now() - interval '50 hours', now() - interval '42 hours', 'self');

-- revoked terminal: no PIN, no clock
select revoke_terminal(id) from terminals where token_prefix = left(:'tok', 12);
select clock_out(:'tok');
reset role; reset role; set role service_role;
select case when r->>'reason' = 'terminal' then 'ok revoked terminal refused' else 'FAIL ' || r::text end
  from terminal_pin_sign_in(:'tok', '1234') r;
reset role;

-- delete_time_entry (P28): timesheet managers, a reason, not their own, audited
set role authenticated; select set_config('request.jwt.claim.sub', :M, false);
select id as gone from add_time_entry(:'org_t', :'outlet_t', :K, now() - interval '80 hours', now() - interval '79 hours', 'test punch') \gset
select set_config('request.jwt.claim.sub', :O, false);
select id as mine from add_time_entry(:'org_t', :'outlet_t', :M, now() - interval '90 hours', now() - interval '89 hours', 'owner adds') \gset
select set_config('request.jwt.claim.sub', :M, false);
select delete_time_entry(:'mine', 'my own');                              -- own hours refused
select delete_time_entry(:'gone', '');                                   -- reason required
select set_config('request.jwt.claim.sub', :K, false);
select delete_time_entry(:'gone', 'cashier tries');                       -- not found for a cashier
select set_config('request.jwt.claim.sub', :M, false);
select delete_time_entry(:'gone', 'duplicate punch');
select 'ok entry deleted' where not exists (select 1 from time_entries where id = :'gone');
reset role;
select 'ok delete audited with the row and reason' where exists (
  select 1 from audit_log where action = 'delete_time_entry' and entity_id = :'gone'
     and before->>'note' = 'test punch' and after->>'reason' = 'duplicate punch');
