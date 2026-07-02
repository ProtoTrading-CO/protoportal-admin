-- 038_sync_metadata.sql — persist last bulk SOH/price sync timestamps.

create table if not exists public.sync_metadata (
  key text primary key,
  value timestamptz not null default now()
);

create or replace function public.sync_website_from_products()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_products_matched        integer;
  v_website_products_count  integer;
  v_website_stock_rows      integer;
  v_website_stock_updated   integer;
  v_unmatched               integer;
  v_synced_at               timestamptz := now();
begin
  insert into public.website_products (
    website_sku, barcode, product_sku, title, description, category, subcategory, leaf_category, image_url, active
  )
  select
    ws.sku, ws.barcode, nullif(trim(ws.barcode), ''), ws.title, ws.original_description,
    ws.category, ws.subcategory_one,
    coalesce(ws.subcategory_four, ws.subcategory_three, ws.subcategory_two, ws.subcategory_one, ''),
    nullif(trim(split_part(coalesce(ws.image_url_one, ''), ',', 1)), ''),
    true
  from public.website_stock ws
  where not exists (select 1 from public.website_products wp where wp.website_sku = ws.sku);

  with upd as (
    update public.website_stock ws
       set price           = p.sell_price,
           stock_qty       = p.stock_qty,
           available_stock = p.available_stock,
           units_of_issue  = p.units_of_issue,
           updated_at      = now()
      from public.website_products wp
      join public.products p on p.sku = wp.product_sku
     where wp.website_sku = ws.sku
       and (ws.price           is distinct from p.sell_price
         or ws.stock_qty       is distinct from p.stock_qty
         or ws.available_stock is distinct from p.available_stock
         or ws.units_of_issue  is distinct from p.units_of_issue)
    returning ws.sku
  )
  select count(*) into v_website_stock_updated from upd;

  with upd2 as (
    update public.website_stock ws
       set price           = p.sell_price,
           stock_qty       = p.stock_qty,
           available_stock = p.available_stock,
           units_of_issue  = p.units_of_issue,
           updated_at      = now()
      from public.products p
     where ws.barcode = p.sku
       and not exists (
         select 1 from public.website_products wp
          where wp.website_sku = ws.sku and wp.product_sku = p.sku
       )
       and (ws.price           is distinct from p.sell_price
         or ws.stock_qty       is distinct from p.stock_qty
         or ws.available_stock is distinct from p.available_stock
         or ws.units_of_issue  is distinct from p.units_of_issue)
    returning ws.sku
  )
  select v_website_stock_updated + count(*) into v_website_stock_updated from upd2;

  select count(*) into v_products_matched from public.products;
  select count(*) into v_website_products_count from public.website_products;
  select count(*) into v_website_stock_rows from public.website_stock;
  select count(*) into v_unmatched
    from public.website_stock ws
   where not exists (
     select 1 from public.products p
     join public.website_products wp on wp.product_sku = p.sku and wp.website_sku = ws.sku
   )
   and not exists (select 1 from public.products p where p.sku = ws.barcode);

  insert into public.sync_metadata (key, value) values
    ('website_stock_synced_at', v_synced_at),
    ('website_price_synced_at', v_synced_at)
  on conflict (key) do update set value = excluded.value;

  return json_build_object(
    'products_matched', v_products_matched,
    'website_products_count', v_website_products_count,
    'website_stock_rows', v_website_stock_rows,
    'website_stock_updated', v_website_stock_updated,
    'unmatched', v_unmatched,
    'synced_at', v_synced_at
  );
end;
$$;
