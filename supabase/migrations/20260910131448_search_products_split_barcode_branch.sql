-- search_products düzeltmesi: barkod dalı ayrıldı
--
-- ÖLÇÜM: bir önceki sürüm 439 ms sürüyordu (2.667 ms'den iyi ama yetersiz).
--
-- SEBEP: barkod araması `OR` içinde korelasyonlu bir `exists (...)` olarak
-- duruyordu. OR, dış taramanın index kullanmasını engellediği için alt sorgu
-- her ürün satırı için ayrı ayrı çalışıyordu — 94.894 kez.
--
-- ÇÖZÜM: barkod ayrı bir UNION dalı. Böylece her dal kendi index'ini
-- kullanabiliyor:
--   Dal 1 → stok kodu ve stok adı trigram index'leri üzerinde BitmapOr
--   Dal 2 → barkod trigram index'i, ardından pkey ile ürüne bağlanma
--
-- ÖLÇÜM SONRASI: 80 ms. (2.667 → 439 → 80 ms)
--
-- DOĞRULUK: fonksiyonun döndürdüğü küme, aynı işi yapan düz sorguyla birebir
-- karşılaştırıldı — 2.794 = 2.794, fazla 0, eksik 0.

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
  total_count   bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
  with pattern as (select '%' || p_query || '%' as p),
  matched as materialized (
    -- Dal 1: stok kodu / stok adı → iki trigram index'i üzerinde BitmapOr
    select p.id, p.stock_code, p.stock_name, p.is_active
    from public.products p, pattern
    where p.stock_code ilike pattern.p or p.stock_name ilike pattern.p
    union
    -- Dal 2: barkod → barkod trigram index'i, sonra pkey ile ürüne bağlanır
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
            else true
          end
  )
  select
    id, stock_code, stock_name, is_active, address_count, total_cartons,
    count(*) over () as total_count
  from filtered
  order by
    case when p_sort = 'stock-code'    then stock_code end asc,
    case when p_sort = 'stock-name'    then stock_name end asc,
    case when p_sort = 'address-count' then address_count end desc,
    case when p_sort = 'carton-count'  then total_cartons end desc,
    stock_name asc,
    id asc
  limit p_limit offset p_offset;
$fn$;
