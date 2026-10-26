-- Restaurant logos: one upload replaces the name everywhere FOKAS showed its
-- logo — header (light background), login + kitchen (dark background), and
-- the printed receipt (1-bit PBM made in the browser at upload, fetched by
-- the print bridge). Files live in the public `logos` bucket under
-- <org_id>/…; only that restaurant's managers can write there.

alter table org_settings
  add column logo_on_dark_url text,
  add column receipt_logo_url text;

-- Login page needs the dark-background variant.
drop function tenant_public_info(text);
create function tenant_public_info(p_slug text)
returns table (name text, slug text, logo_url text, logo_on_dark_url text)
  language sql stable security definer set search_path = public as $$
    select o.name, o.slug, s.logo_url, s.logo_on_dark_url
      from organizations o left join org_settings s on s.org_id = o.id
     where o.slug = lower(p_slug)
  $$;
revoke execute on function tenant_public_info(text) from public;
grant execute on function tenant_public_info(text) to anon, authenticated;

-- The bridge gets the receipt logo URL with the receipt data.
create or replace function device_receipt_data(p_token text, p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_dev   print_devices;
  v_order orders;
begin
  v_dev := device_from_token(p_token);
  if v_dev.id is null then
    raise exception 'Invalid or revoked device token' using errcode = 'insufficient_privilege';
  end if;
  select * into v_order from orders where id = p_order and outlet_id = v_dev.outlet_id;
  if not found then
    raise exception 'Order not found for this printer';
  end if;

  return jsonb_build_object(
    'order', to_jsonb(v_order) - 'client_request_id' - 'cost_total'
             || jsonb_build_object('cashier', (select full_name from profiles where id = v_order.opened_by)),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                'name_snapshot', name_snapshot, 'qty', qty, 'unit_price', unit_price,
                'line_subtotal', line_subtotal, 'voided', voided, 'modifiers_json', modifiers_json)
                order by name_snapshot, id)
              from order_items where order_id = p_order), '[]'::jsonb),
    'payment', (select jsonb_build_object('method', method, 'amount_tendered', amount_tendered,
                                          'change_given', change_given)
                  from payments where order_id = p_order order by created_at limit 1),
    'settings', (select jsonb_build_object('receipt_header', receipt_header,
                                           'receipt_footer', receipt_footer, 'timezone', timezone,
                                           'receipt_logo_url', receipt_logo_url)
                   from org_settings where org_id = v_order.org_id)
  );
end;
$$;
revoke execute on function device_receipt_data(text, uuid) from public;
grant execute on function device_receipt_data(text, uuid) to anon;

-- Storage (Supabase only; skipped on a plain Postgres test database).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('logos', 'logos', true, 2097152)
    on conflict (id) do nothing;

    execute $p$
      create policy "managers upload their logos" on storage.objects
        for insert to authenticated
        with check (bucket_id = 'logos' and is_org_manager(((storage.foldername(name))[1])::uuid))
    $p$;
    execute $p$
      create policy "managers replace their logos" on storage.objects
        for update to authenticated
        using (bucket_id = 'logos' and is_org_manager(((storage.foldername(name))[1])::uuid))
    $p$;
    execute $p$
      create policy "managers delete their logos" on storage.objects
        for delete to authenticated
        using (bucket_id = 'logos' and is_org_manager(((storage.foldername(name))[1])::uuid))
    $p$;
  end if;
end $$;
