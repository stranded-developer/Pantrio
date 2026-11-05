-- Till staff are PIN-only; 5 wrong PINs lock a terminal until an owner's
-- password is reset (decision P26).

-- ── Roles: who may sign in away from the till (email + password) ─────────
-- Owners always may. Manager does by default; Cashier and new roles don't.

alter table org_roles add column allow_password boolean not null default false;
update org_roles set allow_password = true where lower(name) = 'manager';

create or replace function create_default_roles(p_org uuid) returns void
  language sql as $$
    insert into org_roles (org_id, name, permissions, allow_password) values
      (p_org, 'Manager', permission_keys(), true),
      (p_org, 'Cashier', array['pos.sell', 'orders.view', 'kitchen.view'], false)
    on conflict do nothing
  $$;

-- ── Terminals: a hard lock replaces the 15-minute pause ──────────────────

alter table terminals
  drop column failed_since,
  drop column locked_until,
  add column hard_locked_at timestamptz,
  -- Throttles the "send reset email to the owners" button.
  add column reset_sent_at timestamptz;

drop function terminal_info(text);
create function terminal_info(p_token text)
returns table (terminal_id uuid, org_id uuid, slug text, outlet_id uuid, outlet_name text,
               terminal_name text, token_prefix text, idle_minutes int, lock_after_sale boolean,
               hard_locked boolean)
  language sql stable security definer set search_path = public as $$
    select t.id, t.org_id, o.slug, t.outlet_id, ou.name, t.name, t.token_prefix,
           s.terminal_idle_minutes, s.terminal_lock_after_sale, t.hard_locked_at is not null
      from terminal_from_token(p_token) t
      join organizations o on o.id = t.org_id
      join outlets ou on ou.id = t.outlet_id
      join org_settings s on s.org_id = t.org_id
     where t.id is not null
  $$;
revoke execute on function terminal_info(text) from public;
grant execute on function terminal_info(text) to anon, authenticated, service_role;

create or replace function terminal_pin_sign_in(p_token text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_t     terminals;
  v_user  uuid;
  v_email text;
  v_name  text;
begin
  select * into v_t from terminals
   where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') and revoked_at is null
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'terminal');
  end if;
  if v_t.hard_locked_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;

  if coalesce(p_pin, '') ~ '^[0-9]{4,6}$' then
    select m.user_id, u.email, p.full_name into v_user, v_email, v_name
      from member_pins mp
      join org_members m on m.org_id = mp.org_id and m.user_id = mp.user_id and m.active
      join auth.users u on u.id = m.user_id
      left join profiles p on p.id = m.user_id
     where mp.org_id = v_t.org_id and mp.pin_hash = pin_hash(v_t.org_id, p_pin);
  end if;

  if v_user is null then
    if v_t.failed_pins + 1 >= 5 then
      update terminals set failed_pins = 0, hard_locked_at = now() where id = v_t.id;
      insert into audit_log (org_id, action, entity, entity_id, after)
      values (v_t.org_id, 'terminal_locked', 'terminals', v_t.id,
              jsonb_build_object('reason', '5 wrong PINs in a row', 'name', v_t.name));
      return jsonb_build_object('ok', false, 'reason', 'locked');
    end if;
    update terminals set failed_pins = failed_pins + 1 where id = v_t.id;
    return jsonb_build_object('ok', false, 'reason', 'wrong', 'left', 4 - v_t.failed_pins);
  end if;

  update terminals set failed_pins = 0, last_seen_at = now() where id = v_t.id;
  return jsonb_build_object('ok', true, 'user_id', v_user, 'email', v_email, 'name', v_name,
                            'org_id', v_t.org_id);
end;
$$;

-- Owners' addresses for the locked screen's "send reset email", at most
-- every 10 minutes per terminal, and only while it is locked.
create function terminal_reset_targets(p_token text) returns table (email text)
language plpgsql security definer set search_path = public, extensions
as $$
declare v_t terminals;
begin
  select * into v_t from terminals
   where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and revoked_at is null and hard_locked_at is not null
     and (reset_sent_at is null or reset_sent_at < now() - interval '10 minutes')
   for update;
  if not found then
    return;
  end if;
  update terminals set reset_sent_at = now() where id = v_t.id;
  return query
    select u.email::text from org_members m join auth.users u on u.id = m.user_id
     where m.org_id = v_t.org_id and m.role = 'owner' and m.active and u.email is not null;
end;
$$;

-- The reset email was opened (the owner proved they hold that inbox):
-- unlock every locked terminal of the restaurants they own.
create function admin_unlock_owner_terminals(p_user uuid) returns int
language plpgsql security definer set search_path = public
as $$
declare v_n int;
begin
  with unlocked as (
    update terminals t set hard_locked_at = null, failed_pins = 0, reset_sent_at = null
     where t.hard_locked_at is not null
       and t.org_id in (select org_id from org_members where user_id = p_user and role = 'owner' and active)
    returning t.org_id, t.id
  ), logged as (
    insert into audit_log (org_id, actor, action, entity, entity_id, after)
    select org_id, p_user, 'terminal_unlocked', 'terminals', id, '{"by":"password reset email"}'::jsonb
      from unlocked
    returning 1
  )
  select count(*) into v_n from logged;
  return v_n;
end;
$$;

-- Backoffice: a platform admin reset an owner's password for this restaurant.
create function admin_unlock_org_terminals(p_org uuid) returns int
language plpgsql security definer set search_path = public
as $$
declare v_n int;
begin
  with unlocked as (
    update terminals set hard_locked_at = null, failed_pins = 0, reset_sent_at = null
     where org_id = p_org and hard_locked_at is not null
    returning id
  ), logged as (
    insert into audit_log (org_id, action, entity, entity_id, after)
    select p_org, 'terminal_unlocked', 'terminals', id, '{"by":"backoffice password reset"}'::jsonb
      from unlocked
    returning 1
  )
  select count(*) into v_n from logged;
  return v_n;
end;
$$;

-- ── Logins: which members still have a password ──────────────────────────
-- A PIN-only person's password is replaced by a random one nobody knows and
-- flagged in app_metadata (set by the server with the auth admin API).

create function admin_user_logins(p_ids uuid[])
returns table (id uuid, email text, password_off boolean)
  language sql stable security definer set search_path = public, auth as $$
    select u.id, u.email::text, coalesce((u.raw_app_meta_data->>'pantrio_password_off')::boolean, false)
      from auth.users u where u.id = any(p_ids)
  $$;

-- Sign someone out everywhere (their refresh tokens go with the sessions).
create function admin_end_sessions(p_user uuid) returns void
language plpgsql security definer set search_path = public, auth
as $$
begin
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using p_user;
  end if;
end;
$$;

revoke execute on function terminal_reset_targets(text) from public, anon, authenticated;
revoke execute on function admin_unlock_owner_terminals(uuid) from public, anon, authenticated;
revoke execute on function admin_unlock_org_terminals(uuid) from public, anon, authenticated;
revoke execute on function admin_user_logins(uuid[]) from public, anon, authenticated;
revoke execute on function admin_end_sessions(uuid) from public, anon, authenticated;
grant execute on function terminal_reset_targets(text) to service_role;
grant execute on function admin_unlock_owner_terminals(uuid) to service_role;
grant execute on function admin_unlock_org_terminals(uuid) to service_role;
grant execute on function admin_user_logins(uuid[]) to service_role;
grant execute on function admin_end_sessions(uuid) to service_role;
