-- search_products artık barkodları da döndürüyor.
--
-- ÖLÇÜM: istemci önce search_products'ı çağırıp sonra görünen sayfanın
-- barkodlarını ayrı bir istekle çekiyordu. İki istek ARDIŞIK:
--   rpc/search_products : 347-451 ms
--   product_barcodes    : 380-492 ms
-- SQL tarafı 80 ms olduğu için kalan tamamen ağ gecikmesi (proje
-- ap-northeast-1, kullanıcı Türkiye). İkinci isteği ortadan kaldırmak arama
-- süresini yarıya indiriyor.
--
-- ÖLÇÜM SONRASI: SQL 57 ms, uçtan uca 770-930 ms → 343-374 ms, tek istek.
--
-- Barkod toplama LIMIT'ten SONRA yapılıyor: yalnızca görünen 50 satır için
-- index'li alt sorgu çalışıyor, aramanın maliyetine dokunmuyor.
--
-- NOT: dönüş tipi değiştiği için `create or replace` yeterli değil
-- (OUT parametreleri değiştirilemiyor). Fonksiyon salt okunur ve yalnızca
-- Stoklar araması tarafından çağrılıyor; düşürüp yeniden yaratmak güvenli.

drop function if exists public.search_products(text, text, text, integer, integer);

create function public.search_products(
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
$fn$;

comment on function public.search_products is
  'Stoklar ekrani aramasi. materialized CTE ile filtre once calisir (ORDER BY + LIMIT tuzagi), barkodlar LIMIT sonrasi toplanir. Salt okunur, SECURITY INVOKER.';

revoke all on function public.search_products(text, text, text, integer, integer) from public;
grant execute on function public.search_products(text, text, text, integer, integer) to anon, authenticated;
