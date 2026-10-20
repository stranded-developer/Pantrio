-- Account helpers for the server (service role only). Supabase's auth admin
-- API can create users but has no "find by email"; these read auth.users
-- directly so an owner adding an existing person links the same account.

create function admin_user_id_by_email(p_email text) returns uuid
  language sql stable security definer set search_path = public, auth as $$
    select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1
  $$;

create function admin_user_emails(p_ids uuid[]) returns table (id uuid, email text)
  language sql stable security definer set search_path = public, auth as $$
    select u.id, u.email::text from auth.users u where u.id = any(p_ids)
  $$;

revoke execute on function admin_user_id_by_email(text) from public, anon, authenticated;
revoke execute on function admin_user_emails(uuid[]) from public, anon, authenticated;
grant execute on function admin_user_id_by_email(text) to service_role;
grant execute on function admin_user_emails(uuid[]) to service_role;
