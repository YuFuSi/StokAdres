-- "Adresi olmayan" filtresi
--
-- NEDEN
-- Ürünlerin ~%98'inin adresi yok (94.900 üründen 93.033) ve adresleme işi hâlâ
-- sürüyor. Yapılacak işin listesi tam olarak bu küme, ama uygulamada ona
-- ulaşmanın yolu yoktu: Stoklar ekranındaki filtreler yalnızca
-- Tümü / Tek adres / Çoklu adres. Dashboard sayıyı gösteriyor ama tıklanamıyordu.
--
-- Bu migration iki nesneye 'no-address' desteği ekler. Mevcut davranış
-- değişmiyor; yalnızca yeni bir seçenek ve yeni bir sayaç kolonu geliyor.

-- ---------------------------------------------------------------------------
-- 1) product_filter_counts view'ine no_address kolonu
-- ---------------------------------------------------------------------------
-- Sayım küçük address_records tablosu üzerinden yapılıyor; adresi olan ürün
-- sayısı toplam üründen çıkarılıyor. 94.900 ürünü taramaya gerek yok.
create or replace view public.product_filter_counts as
select
  (select count(*) from public.products)::integer as all_products,
  coalesce(sum(case when grouped.n = 1 then 1 else 0 end), 0)::integer as single_address,
  coalesce(sum(case when grouped.n > 1 then 1 else 0 end), 0)::integer as multiple_address,
  ((select count(*) from public.products) - count(*))::integer as no_address
from (
  select product_id, count(*) as n
  from public.address_records
  where is_active
  group by product_id
) grouped;

-- ---------------------------------------------------------------------------
-- 2) search_products fonksiyonuna 'no-address' dalı
-- ---------------------------------------------------------------------------
-- Gövdenin geri kalanı DEĞİŞMEDİ; yalnızca `filtered` CTE'sindeki case
-- ifadesine bir dal eklendi. `as materialized` CTE'si korunuyor: onsuz
-- planlayıcı trigram index'inden vazgeçip 94.894 satırı eliyor
-- (bkz. 20260910131409).
create or replace function public.search_products(
  p_query  text    default '',
  p_filter text    default 'all',
  p_sort   text    default 'stock-name',
  p_limit  integer default 50,
  p_offset integer default 0
)
returns table (
  id            uuid,
  stock_code    text,
  stock_name    text,
  is_active     boolean,
  address_count integer,
  total_cartons integer,
  barcodes      text[],
  total_count   bigint
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  with pattern as (select '%' || p_query || '%' as p),
  matched as materialized (
    select p.id, p.stock_code, p.stock_name, p.is_active
    from public.products p, pattern
    where p.stock_code ilike pattern.p or p.stock_name ilike pattern.p
    union
    select p.id, p.stock_code, p.stock_name, p.is_active
    from public.products p
    where p.id in (
      select b.product_id from public.product_barcodes b, pattern
      where b.barcode ilike pattern.p
    )
  ),
  with_metrics as (
    select
      m.id, m.stock_code, m.stock_name, m.is_active,
      coalesce(a.cnt, 0)::integer   as address_count,
      coalesce(a.total, 0)::integer as total_cartons
    from matched m
    left join (
      select product_id, count(*)::integer as cnt, sum(carton_count)::integer as total
      from public.address_records
      where is_active
      group by product_id
    ) a on a.product_id = m.id
  ),
  filtered as (
    select * from with_metrics
    where case p_filter
            when 'single-address'     then address_count = 1
            when 'multiple-addresses' then address_count > 1
            when 'no-address'         then address_count = 0
            else true
          end
  ),
  counted as (
    select f.*, count(*) over () as total_count from filtered f
  ),
  paged as (
    select * from counted
    order by
      case when p_sort = 'stock-code'    then stock_code end asc,
      case when p_sort = 'stock-name'    then stock_name end asc,
      case when p_sort = 'address-count' then address_count end desc,
      case when p_sort = 'carton-count'  then total_cartons end desc,
      stock_name asc,
      id asc
    limit p_limit offset p_offset
  )
  select
    pg.id, pg.stock_code, pg.stock_name, pg.is_active,
    pg.address_count, pg.total_cartons,
    coalesce(
      (select array_agg(b.barcode order by b.barcode)
         from public.product_barcodes b where b.product_id = pg.id),
      '{}'::text[]
    ) as barcodes,
    pg.total_count
  from paged pg
  order by
    case when p_sort = 'stock-code'    then pg.stock_code end asc,
    case when p_sort = 'stock-name'    then pg.stock_name end asc,
    case when p_sort = 'address-count' then pg.address_count end desc,
    case when p_sort = 'carton-count'  then pg.total_cartons end desc,
    pg.stock_name asc,
    pg.id asc;
$function$;
