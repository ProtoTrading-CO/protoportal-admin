-- 034_sync_archived_soh.sql  (Stock Supabase project: yiqsvwajozafvalwcero)
-- Mirror ERP SOH onto archived_products when products change (same source as website_stock).
-- Archive rows stay in archived_products for catalogue visibility; SOH stays live for admin.

create or replace function public.trg_sync_product_to_website_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.website_stock ws
     set price           = NEW.sell_price,
         stock_qty       = NEW.stock_qty,
         available_stock = NEW.available_stock,
         units_of_issue  = NEW.units_of_issue,
         updated_at      = now()
    from public.website_products wp
   where wp.website_sku = ws.sku
     and wp.product_sku = NEW.sku
     and (ws.price           is distinct from NEW.sell_price
       or ws.stock_qty       is distinct from NEW.stock_qty
       or ws.available_stock is distinct from NEW.available_stock
       or ws.units_of_issue  is distinct from NEW.units_of_issue);

  update public.website_stock ws
     set price           = NEW.sell_price,
         stock_qty       = NEW.stock_qty,
         available_stock = NEW.available_stock,
         units_of_issue  = NEW.units_of_issue,
         updated_at      = now()
   where ws.barcode = NEW.sku
     and not exists (
       select 1 from public.website_products wp
        where wp.website_sku = ws.sku and wp.product_sku = NEW.sku
     )
     and (ws.price           is distinct from NEW.sell_price
       or ws.stock_qty       is distinct from NEW.stock_qty
       or ws.available_stock is distinct from NEW.available_stock
       or ws.units_of_issue  is distinct from NEW.units_of_issue);

  -- Keep archived catalogue rows showing live ERP SOH (read by admin + exports).
  update public.archived_products ap
     set stock_qty       = NEW.stock_qty,
         available_stock = NEW.available_stock,
         updated_at      = now()
   where ap.barcode = NEW.sku
     and (ap.stock_qty       is distinct from NEW.stock_qty
       or ap.available_stock is distinct from NEW.available_stock);

  update public.archived_products ap
     set stock_qty       = NEW.stock_qty,
         available_stock = NEW.available_stock,
         updated_at      = now()
    from public.website_products wp
   where wp.website_sku = ap.sku
     and wp.product_sku = NEW.sku
     and (ap.stock_qty       is distinct from NEW.stock_qty
       or ap.available_stock is distinct from NEW.available_stock);

  return NEW;
end;
$$;

-- Extend bulk sync to backfill archived SOH from products.
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
  v_archived_updated        integer;
  v_unmatched               integer;
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
     where p.sku = ws.barcode
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

  with arch as (
    update public.archived_products ap
       set stock_qty       = p.stock_qty,
           available_stock = p.available_stock,
           updated_at      = now()
      from public.products p
     where p.sku = ap.barcode
       and (ap.stock_qty       is distinct from p.stock_qty
         or ap.available_stock is distinct from p.available_stock)
    returning ap.sku
  )
  select count(*) into v_archived_updated from arch;

  with arch2 as (
    update public.archived_products ap
       set stock_qty       = p.stock_qty,
           available_stock = p.available_stock,
           updated_at      = now()
      from public.website_products wp
      join public.products p on p.sku = wp.product_sku
     where wp.website_sku = ap.sku
       and (ap.stock_qty       is distinct from p.stock_qty
         or ap.available_stock is distinct from p.available_stock)
    returning ap.sku
  )
  select v_archived_updated + count(*) into v_archived_updated from arch2;

  select count(*) into v_website_products_count from public.website_products;

  select count(distinct wp.product_sku) into v_products_matched
    from public.website_products wp
   where wp.product_sku is not null;

  select count(*) into v_website_stock_rows
    from public.website_products wp
    join public.products p on p.sku = wp.product_sku;

  select count(*) into v_unmatched
    from public.website_stock ws
   where not exists (
     select 1 from public.website_products wp
      where wp.website_sku = ws.sku and wp.product_sku is not null
   )
     and not exists (
       select 1 from public.products p where p.sku = ws.barcode
     );

  return json_build_object(
    'products_matched',           v_products_matched,
    'website_products_count',     v_website_products_count,
    'website_stock_rows_matched', v_website_stock_rows,
    'website_stock_updated',      v_website_stock_updated,
    'archived_updated',           v_archived_updated,
    'unmatched_skus_count',       v_unmatched,
    'synced_at',                  now()
  );
end;
$$;
