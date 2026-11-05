-- Registered terminals, PIN sign-in and the time clock (decision P25).
--
-- A terminal is a browser (laptop / iPad) a manager registered for one
-- branch. It holds a random token in an httpOnly cookie; only the hash is
-- stored. The token alone opens nothing but the PIN pad: a correct PIN makes
-- the server mint an ordinary session for that person, so every money
-- function keeps taking identity from auth.uid() (P22 unchanged).
--
-- Clock in/out needs both: the person's session and the terminal's token,
-- so nobody clocks in from home. Times are the database's now().

-- ── Permission: timesheets + terminals ───────────────────────────────────

create or replace function permission_keys() returns text[]
  language sql immutable as $$
    select array[
      'pos.sell', 'orders.view', 'orders.void', 'kitchen.view', 'sales.view',
      'profit.manage', 'menu.manage', 'recipes.manage', 'ingredients.manage',
      'settings.manage', 'printers.manage', 'timesheets.manage'
    ]
  $$;

-- Managers had "everything"; keep it that way.
update org_roles set permissions = permissions || array['timesheets.manage']
 where lower(name) = 'manager' and not ('timesheets.manage' = any(permissions));

-- ── Terminal options ─────────────────────────────────────────────────────

alter table org_settings
  add column terminal_idle_minutes int not null default 5 check (terminal_idle_minutes between 1 and 120),
  add column terminal_lock_after_sale boolean not null default false;

-- ── Terminals ────────────────────────────────────────────────────────────

create table terminals (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  outlet_id    uuid not null,
  name         text not null check (btrim(name) <> ''),
  token_prefix text not null,
  token_hash   text not null unique,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at   timestamptz,
  -- PIN guessing: 5 wrong within 15 minutes locks this terminal 15 minutes.
  failed_pins  int not null default 0,
  failed_since timestamptz,
  locked_until timestamptz,
  unique (id, org_id),
  foreign key (outlet_id, org_id) references outlets(id, org_id) on delete cascade
);
alter table terminals enable row level security;
create policy "timesheet managers read terminals" on terminals
  for select using (has_perm(org_id, 'timesheets.manage'));

create function terminal_from_token(p_token text) returns terminals
  language sql stable security definer set search_path = public, extensions as $$
    select * from terminals
     where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
       and revoked_at is null
  $$;

-- ── PINs ─────────────────────────────────────────────────────────────────
-- Unique per restaurant, so a PIN alone says who you are. No policies: only
-- the functions below touch this table.

create table member_pins (
  org_id     uuid not null,
  user_id    uuid not null,
  pin_hash   text not null,
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id),
  unique (org_id, pin_hash),
  foreign key (org_id, user_id) references org_members(org_id, user_id) on delete cascade
);
alter table member_pins enable row level security;

create function pin_hash(p_org uuid, p_pin text) returns text
  language sql immutable set search_path = public, extensions as $$
    select encode(digest(p_org::text || ':' || p_pin, 'sha256'), 'hex')
  $$;

create function set_member_pin(p_org uuid, p_user uuid, p_pin text) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_org_owner(p_org) then
    raise exception 'Only an owner can set PINs' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from org_members where org_id = p_org and user_id = p_user) then
    raise exception 'Not a member of this restaurant';
  end if;
  if p_pin is null then
    delete from member_pins where org_id = p_org and user_id = p_user;
  else
    if p_pin !~ '^[0-9]{4,6}$' then
      raise exception 'A PIN is 4 to 6 digits';
    end if;
    begin
      insert into member_pins (org_id, user_id, pin_hash) values (p_org, p_user, pin_hash(p_org, p_pin))
      on conflict (org_id, user_id) do update set pin_hash = excluded.pin_hash, updated_at = now();
    exception when unique_violation then
      raise exception 'Another staff member already uses this PIN';
    end;
  end if;
  insert into audit_log (org_id, actor, action, entity, entity_id)
  values (p_org, auth.uid(), case when p_pin is null then 'clear_member_pin' else 'set_member_pin' end,
          'member_pins', p_user);
end;
$$;

-- Who has a PIN (Settings → Staff). Owners only.
create function org_pin_holders(p_org uuid) returns setof uuid
  language sql stable security definer set search_path = public as $$
    select user_id from member_pins where org_id = p_org and is_org_owner(p_org)
  $$;

-- ── Register / revoke / describe terminals ───────────────────────────────

create function create_terminal(p_org uuid, p_outlet uuid, p_name text) returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare v_token text;
begin
  if not has_perm(p_org, 'timesheets.manage') then
    raise exception 'Your role cannot register terminals' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from outlets where id = p_outlet and org_id = p_org and active) then
    raise exception 'Unknown or inactive branch';
  end if;
  if p_name is null or btrim(p_name) = '' or length(btrim(p_name)) > 60 then
    raise exception 'Name the terminal (up to 60 characters)';
  end if;
  v_token := 'pnt_' || encode(gen_random_bytes(24), 'hex');
  insert into terminals (org_id, outlet_id, name, token_prefix, token_hash, created_by)
  values (p_org, p_outlet, btrim(p_name), left(v_token, 12), encode(digest(v_token, 'sha256'), 'hex'), auth.uid());
  insert into audit_log (org_id, actor, action, entity, after)
  values (p_org, auth.uid(), 'create_terminal', 'terminals',
          jsonb_build_object('name', btrim(p_name), 'outlet_id', p_outlet));
  return v_token;
end;
$$;

create function revoke_terminal(p_terminal uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare v_org uuid;
begin
  select org_id into v_org from terminals where id = p_terminal;
  if v_org is null or not has_perm(v_org, 'timesheets.manage') then
    raise exception 'Terminal not found';
  end if;
  update terminals set revoked_at = now() where id = p_terminal and revoked_at is null;
  insert into audit_log (org_id, actor, action, entity, entity_id)
  values (v_org, auth.uid(), 'revoke_terminal', 'terminals', p_terminal);
end;
$$;

-- What a token holder may know: which restaurant/branch this device is for.
create function terminal_info(p_token text)
returns table (terminal_id uuid, org_id uuid, slug text, outlet_id uuid, outlet_name text,
               terminal_name text, token_prefix text, idle_minutes int, lock_after_sale boolean)
  language sql stable security definer set search_path = public as $$
    select t.id, t.org_id, o.slug, t.outlet_id, ou.name, t.name, t.token_prefix,
           s.terminal_idle_minutes, s.terminal_lock_after_sale
      from terminal_from_token(p_token) t
      join organizations o on o.id = t.org_id
      join outlets ou on ou.id = t.outlet_id
      join org_settings s on s.org_id = t.org_id
     where t.id is not null
  $$;

create function set_terminal_options(p_org uuid, p_idle_minutes int, p_lock_after_sale boolean) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not has_perm(p_org, 'timesheets.manage') then
    raise exception 'Your role cannot change terminal options' using errcode = 'insufficient_privilege';
  end if;
  update org_settings set terminal_idle_minutes = p_idle_minutes,
                          terminal_lock_after_sale = coalesce(p_lock_after_sale, false)
   where org_id = p_org;
end;
$$;

-- ── PIN sign-in (server only) ────────────────────────────────────────────
-- Called by the app server with the secret key; returns a result instead of
-- raising, so a failed attempt's counter is not rolled back. On success the
-- server mints a session for user_id (auth admin magic link → verifyOtp).

create function terminal_pin_sign_in(p_token text, p_pin text) returns jsonb
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
  if v_t.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', v_t.locked_until);
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
    if v_t.failed_since is null or v_t.failed_since < now() - interval '15 minutes' then
      update terminals set failed_pins = 1, failed_since = now() where id = v_t.id;
    elsif v_t.failed_pins + 1 >= 5 then
      update terminals set failed_pins = 0, failed_since = null, locked_until = now() + interval '15 minutes'
       where id = v_t.id;
      insert into audit_log (org_id, action, entity, entity_id, after)
      values (v_t.org_id, 'terminal_locked', 'terminals', v_t.id,
              jsonb_build_object('reason', '5 wrong PINs', 'name', v_t.name));
      return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', now() + interval '15 minutes');
    else
      update terminals set failed_pins = failed_pins + 1 where id = v_t.id;
    end if;
    return jsonb_build_object('ok', false, 'reason', 'wrong');
  end if;

  update terminals set failed_pins = 0, failed_since = null, locked_until = null, last_seen_at = now()
   where id = v_t.id;
  return jsonb_build_object('ok', true, 'user_id', v_user, 'email', v_email, 'name', v_name,
                            'org_id', v_t.org_id);
end;
$$;

-- ── Time clock ───────────────────────────────────────────────────────────

create type time_entry_status as enum ('open', 'closed', 'missing_out');

create table time_entries (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  outlet_id     uuid not null,
  user_id       uuid not null references auth.users(id) on delete restrict,
  terminal_id   uuid,
  business_date date not null,
  clock_in_at   timestamptz not null,
  clock_out_at  timestamptz,
  -- open: on shift. closed: has a clock-out. missing_out: an open shift from
  -- an earlier business day — hours unknown until a manager fixes it.
  status        time_entry_status not null default 'open',
  in_photo      text,
  out_photo     text,
  note          text,
  edited_by     uuid references auth.users(id) on delete set null,
  edited_at     timestamptz,
  created_at    timestamptz not null default now(),
  unique (id, org_id),
  foreign key (outlet_id, org_id) references outlets(id, org_id) on delete restrict,
  foreign key (terminal_id, org_id) references terminals(id, org_id) on delete set null (terminal_id),
  check (clock_out_at is null or clock_out_at > clock_in_at),
  check ((status = 'closed') = (clock_out_at is not null))
);
create unique index time_entries_one_open_idx on time_entries(org_id, user_id) where status = 'open';
create index time_entries_org_day_idx on time_entries(org_id, business_date);

alter table time_entries enable row level security;
create policy "staff read own time entries" on time_entries
  for select using (user_id = auth.uid() and is_org_member(org_id));
create policy "timesheet managers read time entries" on time_entries
  for select using (has_perm(org_id, 'timesheets.manage'));
-- Writes only through the functions below.

create function close_stale_shifts(p_org uuid) returns void
  language sql security definer set search_path = public as $$
    update time_entries set status = 'missing_out'
     where org_id = p_org and status = 'open' and business_date < org_business_date(p_org)
  $$;

-- The terminal + the signed-in person, or an exception.
create function clock_terminal(p_token text) returns terminals
language plpgsql stable security definer set search_path = public
as $$
declare v_t terminals;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;
  v_t := terminal_from_token(p_token);
  if v_t.id is null then
    raise exception 'Clock in and out on a registered terminal' using errcode = 'insufficient_privilege';
  end if;
  if org_role_of(v_t.org_id) is null then
    raise exception 'Not staff at this restaurant' using errcode = 'insufficient_privilege';
  end if;
  return v_t;
end;
$$;

create function check_clock_photo(p_org uuid, p_photo text) returns text
  language plpgsql stable as $$
  begin
    if p_photo is not null and p_photo not like p_org::text || '/' || auth.uid()::text || '/%' then
      raise exception 'Invalid photo';
    end if;
    return p_photo;
  end;
  $$;

create function clock_in(p_token text, p_photo text default null) returns time_entries
language plpgsql security definer set search_path = public
as $$
declare
  v_t terminals;
  v_e time_entries;
begin
  v_t := clock_terminal(p_token);
  perform close_stale_shifts(v_t.org_id);
  select * into v_e from time_entries where org_id = v_t.org_id and user_id = auth.uid() and status = 'open';
  if found then
    raise exception 'Already clocked in';
  end if;
  insert into time_entries (org_id, outlet_id, user_id, terminal_id, business_date, clock_in_at, in_photo)
  values (v_t.org_id, v_t.outlet_id, auth.uid(), v_t.id, org_business_date(v_t.org_id), now(),
          check_clock_photo(v_t.org_id, p_photo))
  returning * into v_e;
  update terminals set last_seen_at = now() where id = v_t.id;
  return v_e;
end;
$$;

create function clock_out(p_token text, p_photo text default null) returns time_entries
language plpgsql security definer set search_path = public
as $$
declare
  v_t terminals;
  v_e time_entries;
begin
  v_t := clock_terminal(p_token);
  perform close_stale_shifts(v_t.org_id);
  update time_entries
     set clock_out_at = now(), status = 'closed', out_photo = check_clock_photo(v_t.org_id, p_photo)
   where org_id = v_t.org_id and user_id = auth.uid() and status = 'open'
  returning * into v_e;
  if not found then
    raise exception 'You are not clocked in';
  end if;
  update terminals set last_seen_at = now() where id = v_t.id;
  return v_e;
end;
$$;

-- For the screen after a PIN: on shift since when, and any shift from an
-- earlier day still missing its clock-out.
create function my_clock_status(p_org uuid) returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if org_role_of(p_org) is null then
    raise exception 'Not staff at this restaurant' using errcode = 'insufficient_privilege';
  end if;
  perform close_stale_shifts(p_org);
  return jsonb_build_object(
    'clocked_in_at', (select clock_in_at from time_entries
                       where org_id = p_org and user_id = auth.uid() and status = 'open'),
    'missing_out_on', (select max(business_date) from time_entries
                        where org_id = p_org and user_id = auth.uid() and status = 'missing_out')
  );
end;
$$;

-- Timesheet screen: mark stale shifts before reading.
create function refresh_time_entries(p_org uuid) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not has_perm(p_org, 'timesheets.manage') then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  perform close_stale_shifts(p_org);
end;
$$;

-- ── Corrections (audited; nobody but an owner edits their own hours) ─────

create function edit_time_entry(p_entry uuid, p_in timestamptz, p_out timestamptz, p_note text)
returns time_entries
language plpgsql security definer set search_path = public
as $$
declare
  v_e      time_entries;
  v_before jsonb;
begin
  select * into v_e from time_entries where id = p_entry for update;
  if not found or not has_perm(v_e.org_id, 'timesheets.manage') then
    raise exception 'Entry not found';
  end if;
  if v_e.user_id = auth.uid() and not is_org_owner(v_e.org_id) then
    raise exception 'Ask another manager to correct your own hours' using errcode = 'insufficient_privilege';
  end if;
  if p_note is null or btrim(p_note) = '' then
    raise exception 'A reason is required';
  end if;
  if p_in is null or p_in > now() or (p_out is not null and (p_out <= p_in or p_out > now())) then
    raise exception 'Clock-out must be after clock-in, and neither in the future';
  end if;

  v_before := to_jsonb(v_e);
  update time_entries
     set clock_in_at = p_in,
         clock_out_at = p_out,
         business_date = org_business_date(org_id, p_in),
         status = (case when p_out is not null then 'closed'
                        when status = 'open' then 'open'
                        else 'missing_out' end)::time_entry_status,
         note = left(btrim(p_note), 300),
         edited_by = auth.uid(), edited_at = now()
   where id = p_entry
  returning * into v_e;

  insert into audit_log (org_id, actor, action, entity, entity_id, before, after)
  values (v_e.org_id, auth.uid(), 'edit_time_entry', 'time_entries', p_entry, v_before, to_jsonb(v_e));
  return v_e;
end;
$$;

-- A shift nobody clocked at all (forgot to clock in).
create function add_time_entry(p_org uuid, p_outlet uuid, p_user uuid, p_in timestamptz,
                               p_out timestamptz, p_note text)
returns time_entries
language plpgsql security definer set search_path = public
as $$
declare v_e time_entries;
begin
  if not has_perm(p_org, 'timesheets.manage') then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  if p_user = auth.uid() and not is_org_owner(p_org) then
    raise exception 'Ask another manager to add your own hours' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from org_members where org_id = p_org and user_id = p_user) then
    raise exception 'Not a member of this restaurant';
  end if;
  if p_note is null or btrim(p_note) = '' then
    raise exception 'A reason is required';
  end if;
  if p_in is null or p_out is null or p_out <= p_in or p_out > now() then
    raise exception 'Clock-out must be after clock-in, and neither in the future';
  end if;
  insert into time_entries (org_id, outlet_id, user_id, business_date, clock_in_at, clock_out_at,
                            status, note, edited_by, edited_at)
  values (p_org, p_outlet, p_user, org_business_date(p_org, p_in), p_in, p_out, 'closed',
          left(btrim(p_note), 300), auth.uid(), now())
  returning * into v_e;
  insert into audit_log (org_id, actor, action, entity, entity_id, after)
  values (p_org, auth.uid(), 'add_time_entry', 'time_entries', v_e.id, to_jsonb(v_e));
  return v_e;
end;
$$;

-- ── Clock photos (Supabase only) ─────────────────────────────────────────
-- Private bucket, <org_id>/<user_id>/<file>.jpg. You upload only into your
-- own folder; only timesheet managers can view.

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('clock-photos', 'clock-photos', false, 524288, array['image/jpeg'])
    on conflict (id) do nothing;
    execute $p$
      create policy "staff upload own clock photos" on storage.objects for insert to authenticated
        with check (bucket_id = 'clock-photos'
                    and is_org_member(((storage.foldername(name))[1])::uuid)
                    and (storage.foldername(name))[2] = auth.uid()::text)
    $p$;
    execute $p$
      create policy "timesheet managers view clock photos" on storage.objects for select to authenticated
        using (bucket_id = 'clock-photos'
               and has_perm(((storage.foldername(name))[1])::uuid, 'timesheets.manage'))
    $p$;
  end if;
end $$;

-- ── Grants ───────────────────────────────────────────────────────────────

revoke execute on function terminal_from_token(text) from public, anon, authenticated;
revoke execute on function pin_hash(uuid, text) from public, anon, authenticated;
revoke execute on function close_stale_shifts(uuid) from public, anon, authenticated;
revoke execute on function clock_terminal(text) from public, anon, authenticated;
revoke execute on function check_clock_photo(uuid, text) from public, anon, authenticated;
revoke execute on function terminal_pin_sign_in(text, text) from public, anon, authenticated;
grant execute on function terminal_pin_sign_in(text, text) to service_role;

revoke execute on function terminal_info(text) from public;
grant execute on function terminal_info(text) to anon, authenticated, service_role;

revoke execute on function set_member_pin(uuid, uuid, text) from public, anon;
revoke execute on function org_pin_holders(uuid) from public, anon;
revoke execute on function create_terminal(uuid, uuid, text) from public, anon;
revoke execute on function revoke_terminal(uuid) from public, anon;
revoke execute on function set_terminal_options(uuid, int, boolean) from public, anon;
revoke execute on function clock_in(text, text) from public, anon;
revoke execute on function clock_out(text, text) from public, anon;
revoke execute on function my_clock_status(uuid) from public, anon;
revoke execute on function refresh_time_entries(uuid) from public, anon;
revoke execute on function edit_time_entry(uuid, timestamptz, timestamptz, text) from public, anon;
revoke execute on function add_time_entry(uuid, uuid, uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function set_member_pin(uuid, uuid, text) to authenticated;
grant execute on function org_pin_holders(uuid) to authenticated;
grant execute on function create_terminal(uuid, uuid, text) to authenticated;
grant execute on function revoke_terminal(uuid) to authenticated;
grant execute on function set_terminal_options(uuid, int, boolean) to authenticated;
grant execute on function clock_in(text, text) to authenticated;
grant execute on function clock_out(text, text) to authenticated;
grant execute on function my_clock_status(uuid) to authenticated;
grant execute on function refresh_time_entries(uuid) to authenticated;
grant execute on function edit_time_entry(uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function add_time_entry(uuid, uuid, uuid, timestamptz, timestamptz, text) to authenticated;
