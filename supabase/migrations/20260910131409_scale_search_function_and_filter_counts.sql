-- Faz 1 düzeltmesi — 95k ölçeğinde arama ve filtre sayaçları
--
-- Bu migration, 93.217 ürün + 101.962 barkod yüklendikten SONRA gerçek ölçekte
-- yapılan ölçümlerin sonucudur. 1.677 satırda hızlı görünen iki sorgu 95k'da
-- kullanılamaz hale gelmişti.
--
-- TAMAMEN EKLEMELİ: tablo, kolon, policy veya veri değişmiyor.

-- ------------------------------------------------------- filtre sayaçları
-- ÖLÇÜM: `count(*) from products_with_metrics where address_count = 1`
--        → 584 ms, ve Stoklar ekranı bunu 3 kez çağırıyordu (~1,75 s).
--
-- SEBEP: address_count view'da LEFT JOIN'den türeyen bir kolon; filtrelemek
-- için 94.894 ürünün tamamı taranıyordu. Oysa adresi olan ürün sayısı 105.
-- Sorgu ters kurulmuştu.
--
-- ÇÖZÜM: sayım küçük address_records tablosu üzerinden yapılıyor.
-- ÖLÇÜM SONRASI: tek sorguda 75 ms.
create or replace view public.product_filter_counts
with (security_invoker = true) as
select
  (select count(*) from public.products)::integer as all_products,
  coalesce(sum(case when n = 1 then 1 else 0 end), 0)::integer as single_address,
  coalesce(sum(case when n > 1 then 1 else 0 end), 0)::integer as multiple_address
from (
  select product_id, count(*) as n
  from public.address_records
  where is_active
  group by product_id
) grouped;

comment on view public.product_filter_counts is
  'Stoklar ekranindaki filtre cipleri. Sayim kucuk address_records tablosundan yapilir, 95k urun taranmaz.';

grant select on public.product_filter_counts to anon, authenticated;

-- --------------------------------------------------------- arama fonksiyonu
-- ÖLÇÜM: `where stock_name ilike '%TOHANA%' order by stock_name limit 50`
--        → 2.667 ms (view üzerinden), 1.238 ms (doğrudan tablo).
--
-- SEBEP: ORDER BY + LIMIT, planlayıcıyı trigram index'inden vazgeçirip
-- stock_name btree index'ini yürütüyor. Planlayıcı eşleşmelerin index sırasına
-- eşit dağıldığını varsayıyor; gerçekte kümelendikleri için 83.019 satır
-- filtreyle elendi. Tuzak temel tabloda da var, yani view kaynaklı değil.
-- PostgREST sorguyu dışarıdan kurduğu için plana müdahale edilemiyor.
--
-- ÇÖZÜM: `as materialized` CTE bir optimizasyon bariyeri. Filtre önce çalışıyor
-- (trigram, ~31 ms, ~2.800 satır); sıralama ve sayfalama yalnızca o küçük küme
-- üzerinde yapılıyor. total_count aynı sorgudan geldiği için ayrıca count
-- isteği de gerekmiyor.
--
-- GÜVENLİK: SECURITY INVOKER — RLS çağıran rolün yetkileriyle uygulanır.
-- Advisor'ın işaretlediği SECURITY DEFINER fonksiyonlardan farklı; bu fonksiyon
-- yalnızca okur ve hiçbir yetki yükseltmesi yapmaz.
--
-- KAPSAM: Yalnızca ARAMA için. Arama terimi yokken istemci view'i kullanmaya
-- devam eder; orada stock_name index'i doğru seçim ve 3,8 ms sürüyor.
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
  with matched as materialized (
    select p.id, p.stock_code, p.stock_name, p.is_active
    from public.products p
    where p.stock_code ilike '%' || p_query || '%'
       or p.stock_name ilike '%' || p_query || '%'
       or exists (
            select 1 from public.product_barcodes b
            where b.product_id = p.id
              and b.barcode ilike '%' || p_query || '%'
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

comment on function public.search_products is
  'Stoklar ekrani aramasi. materialized CTE ile filtre once calisir; ORDER BY + LIMIT tuzagini onler. Salt okunur, SECURITY INVOKER.';

revoke all on function public.search_products(text, text, text, integer, integer) from public;
grant execute on function public.search_products(text, text, text, integer, integer) to anon, authenticated;
