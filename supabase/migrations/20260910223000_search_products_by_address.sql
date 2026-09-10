-- Adresten ürüne ters arama
--
-- NEDEN
-- Kullanıcının günlük sorusu "bu stok nerede?" (stok → adres). Tersi de gerçek
-- bir ihtiyaç: "bu rafta ne var?" — sayım, yerleştirme ve hata düzeltme için.
-- 604 adreste birden fazla ürün duruyor.
--
-- Adres Bul ekranı bunu zaten VAAT EDİYORDU ama search_products adres
-- aramıyordu: canlıda 'G27-04' adresinde 2 ürün varken fonksiyon 0 sonuç
-- döndürüyordu. Bu migration o boşluğu kapatır.
--
-- TASARIM
-- Ayrı bir ekran/fonksiyon yerine mevcut search_products'a bir dal ekleniyor.
-- Sonuç yine ÜRÜN listesi; Adres Bul kartı adresleri zaten baskın biçimde
-- gösterdiği için "G27-04" yazınca o raftaki ürünler adresleriyle birlikte
-- çıkıyor. Kullanıcı tek kutuya ne yazdığını düşünmek zorunda kalmıyor.

-- ---------------------------------------------------------------------------
-- 1) Adres için trigram index
-- ---------------------------------------------------------------------------
-- Mevcut idx_address_records_address düz bir btree; `ilike '%G27%'` gibi
-- ortadan eşleşen aramalarda kullanılamaz. products.stock_code /
-- stock_name'de kullanılan desenin aynısı.
--
-- Tablo şu an 2.818 satır, yani index olmadan da hızlı. Ama adresleme sürüyor
-- (son 24 saatte ~2.700 kayıt) ve ürünlerin %98'i henüz adressiz; bu tablo
-- ürün sayısına doğru büyüyecek.
create index if not exists idx_address_records_address_trgm
  on public.address_records using gin (address gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 2) search_products'a adres dalı
-- ---------------------------------------------------------------------------
-- `matched` CTE'sine üçüncü bir union kolu eklendi. Geri kalan her şey aynı;
-- `as materialized` korunuyor (onsuz planlayıcı trigram index'lerinden
-- vazgeçiyor — bkz. 20260910131409).
--
-- Yalnızca AKTİF adres kayıtları eşleşiyor: pasif bir kayıt "orada duruyor"
-- anlamına gelmiyor ve ekranda da gösterilmiyor.
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
    union
    select p.id, p.stock_code, p.stock_name, p.is_active
    from public.products p
    where p.id in (
      select a.product_id from public.address_records a, pattern
      where a.is_active and a.address ilike pattern.p
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
