-- The last-owner guard (migration 3) also fired when a whole organisation
-- was deleted, because the delete cascades to org_members. Deleting the
-- restaurant itself is legitimate; only removing/demoting its last owner
-- while the restaurant remains is not. In a cascade the parent row is
-- already gone when this trigger runs, so check for it.
-- (Deleting the *account* of a sole owner is still refused — on purpose.)

create or replace function org_members_keep_an_owner() returns trigger
  language plpgsql as $$
  declare v_org uuid := coalesce(old.org_id, new.org_id);
  begin
    if tg_op = 'DELETE' and not exists (select 1 from organizations where id = v_org) then
      return old;
    end if;
    if old.role = 'owner' and old.active
       and (tg_op = 'DELETE' or new.role <> 'owner' or not new.active)
       and not exists (
         select 1 from org_members
          where org_id = v_org and role = 'owner' and active and user_id <> old.user_id
       )
    then
      raise exception 'A restaurant needs at least one active owner';
    end if;
    return coalesce(new, old);
  end;
  $$;
