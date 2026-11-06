-- Delete a time entry (P28): a clock-in made by mistake, a test punch, a
-- duplicate. Same rules as editing (P25): timesheet managers only, a reason,
-- never your own hours unless you are the owner. The whole row goes into the
-- audit log, so a deletion can always be seen and undone by hand. The clock
-- photos stay in storage; the audit row still points at them.

create function delete_time_entry(p_entry uuid, p_note text) returns void
language plpgsql security definer set search_path = public
as $$
declare v_e time_entries;
begin
  select * into v_e from time_entries where id = p_entry for update;
  if not found or not has_perm(v_e.org_id, 'timesheets.manage') then
    raise exception 'Entry not found';
  end if;
  if v_e.user_id = auth.uid() and not is_org_owner(v_e.org_id) then
    raise exception 'Ask another manager to delete your own hours' using errcode = 'insufficient_privilege';
  end if;
  if p_note is null or btrim(p_note) = '' then
    raise exception 'A reason is required';
  end if;
  delete from time_entries where id = p_entry;
  insert into audit_log (org_id, actor, action, entity, entity_id, before, after)
  values (v_e.org_id, auth.uid(), 'delete_time_entry', 'time_entries', p_entry, to_jsonb(v_e),
          jsonb_build_object('reason', left(btrim(p_note), 300)));
end;
$$;

revoke execute on function delete_time_entry(uuid, text) from public, anon;
grant execute on function delete_time_entry(uuid, text) to authenticated;
