-- Adresler ekranı için sunucu tarafı arama, filtre, sıralama ve sayfalama
--
-- NEDEN
-- Ekran tüm adres kayıtlarını çekip filtre/sıralama/aramayı istemcide yapıyordu.
-- 2.818 kayıtta çalışıyor ama son 24 saatte ~2.700 kayıt eklendi ve ürünlerin
-- %98'i hâlâ adressiz; tablo ürün sayısına doğru büyüyecek. Stoklar ekranı için
-- kurulan desenin (products_with_metrics + search_products) aynısı.
--
-- Sayfa boyutu istemcide 50; sayfalama sunucuya taşınınca tek istekle hem satır
-- hem toplam sayı dönmeli — search_products'taki gibi `count(*) over ()`.

-- ---------------------------------------------------------------------------
-- 1) updated_at sıralaması için index
-- ---------------------------------------------------------------------------
-- Varsayılan sıralama "Güncellenme tarihi". 2.818 satırda fark etmez ama
-- büyüdüğünde her sayfa isteği tabloyu baştan sıralar.
create index if not exists idx_address_records_updated_at
  on public.address_records using btree (updated_at desc, id desc);

-- ---------------------------------------------------------------------------
-- 2) Özet sayaçları
-- ---------------------------------------------------------------------------
-- Filtre çipleri ve özet şeridi (Toplam / Aktif / Pasif / Toplam koli). Bunlar
-- ARAMADAN BAĞIMSIZ: kullanıcı arama yaparken de deponun geneli görünmeli.
-- Tek satır, tek tarama.
create or replace view public.address_record_counts as
select
  count(*)::integer                                              as all_records,
  count(*) filter (where is_active)::integer                     as active_records,
  count(*) filter (where not is_active)::integer                 as inactive_records,
  coalesce(sum(carton_count) filter (where is_active), 0)::integer as active_cartons
from public.address_records;

-- ---------------------------------------------------------------------------
-- 3) search_address_records
-- ---------------------------------------------------------------------------
-- Arama alanları istemcideki davranışla aynı: adres, stok kodu, stok adı ve
-- barkod. Boş sorgu tüm kayıtları döndürür (yalnızca filtre uygulanır).
--
-- Sıralamada `id` her zaman son anahtar: eşit değerli satırlar sayfalar
-- arasında kayarsa kayıt kaybolur veya tekrarlanır.
--
-- NOT: Sıralama Postgres collation'ına göre yapılıyor, istemcideki
-- localeCompare('tr-TR') ile birebir aynı olmayabilir (ör. Ç/Ş/İ sırası).
-- Tek bir sıralama otoritesi olması, iki farklı sıralamanın olmasından iyi.
create or replace function public.search_address_records(
  p_query  text    default '',
  p_filter text    default 'all',
  p_sort   text    default 'updated-at',
  p_limit  integer default 50,
  p_offset integer default 0
)
returns table (
  id           uuid,
  product_id   uuid,
  stock_code   text,
  stock_name   text,
  address      text,
  carton_count integer,
  is_active    boolean,
  created_at   timestamptz,
  updated_at   timestamptz,
  total_count  bigint
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  with pattern as (select '%' || p_query || '%' as p),
  joined as materialized (
    select
      a.id, a.product_id, p.stock_code, p.stock_name,
      a.address, a.carton_count, a.is_active, a.created_at, a.updated_at
    from public.address_records a
    join public.products p on p.id = a.product_id
    where case p_filter
            when 'active'   then a.is_active
            when 'inactive' then not a.is_active
            else true
          end
      and (
        p_query = ''
        or a.address    ilike (select pt.p from pattern pt)
        or p.stock_code ilike (select pt.p from pattern pt)
        or p.stock_name ilike (select pt.p from pattern pt)
        or exists (
          select 1 from public.product_barcodes b
          where b.product_id = a.product_id
            and b.barcode ilike (select pt.p from pattern pt)
        )
      )
  ),
  counted as (
    select j.*, count(*) over () as total_count from joined j
  )
  select *
  from counted
  order by
    case when p_sort = 'address'    then address    end asc,
    case when p_sort = 'stock-code' then stock_code end asc,
    case when p_sort = 'stock-name' then stock_name end asc,
    case when p_sort = 'carton'     then carton_count end desc,
    case when p_sort = 'updated-at' then updated_at end desc,
    id asc
  limit p_limit offset p_offset;
$function$;
