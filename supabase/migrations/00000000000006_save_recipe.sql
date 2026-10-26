-- Save a recipe's header and all its lines in one transaction.
-- SECURITY INVOKER: runs as the signed-in user, so RLS decides ("managers
-- write" on recipes / recipe_lines). Replacing lines as delete + insert from
-- the app would leave a recipe empty if the insert failed — e.g. the cycle
-- trigger rejecting a sub-recipe — and an empty recipe costs 0.

create function save_recipe(
  p_recipe     uuid,
  p_name       text,
  p_yield_qty  numeric,
  p_yield_unit unit_code,
  p_lines      jsonb
) returns void
language plpgsql security invoker set search_path = public
as $$
declare
  v_org  uuid;
  v_line jsonb;
  v_sort int := 0;
begin
  update recipes
     set name = btrim(p_name), yield_qty = p_yield_qty, yield_unit = p_yield_unit
   where id = p_recipe
  returning org_id into v_org;
  if v_org is null then
    raise exception 'Recipe not found';
  end if;

  delete from recipe_lines where recipe_id = p_recipe;

  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    insert into recipe_lines (org_id, recipe_id, sort, product_id, sub_recipe_id, qty, unit, waste_bps)
    values (
      v_org, p_recipe, v_sort,
      nullif(v_line->>'product_id', '')::uuid,
      nullif(v_line->>'sub_recipe_id', '')::uuid,
      (v_line->>'qty')::numeric,
      (v_line->>'unit')::unit_code,
      coalesce((v_line->>'waste_bps')::int, 0)
    );
    v_sort := v_sort + 1;
  end loop;
end;
$$;

revoke execute on function save_recipe(uuid, text, numeric, unit_code, jsonb) from public, anon;
grant execute on function save_recipe(uuid, text, numeric, unit_code, jsonb) to authenticated;
