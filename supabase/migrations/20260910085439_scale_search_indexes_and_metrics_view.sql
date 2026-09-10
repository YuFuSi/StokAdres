-- Faz 1.1 — 100.000 ürün ölçeği için arama index'leri ve metrik view'ı
--
-- NEDEN
-- Uygulama bugün tüm ürün tablosunu istemciye çekip JavaScript'te filtreliyor.
-- 1.677 satırda sorun değil; 100.000 satırda `products` ~33 MB'a çıkıyor ve her
-- ekran açılışında bu veriyi indirmek, kullanıcının kaçmak istediği Excel
-- donmasının aynısını üretiyor.
--
-- Bu migration, aramayı ve sıralamayı veritabanına taşımak için gereken
-- altyapıyı kuruyor. İstemci tarafı değişiklikler ayrı commit'te.
--
-- TAMAMEN EKLEMELİ: hiçbir tablo, kolon, policy veya veri değişmiyor. Sadece
-- yeni index'ler ve bir view ekleniyor. Idempotent, tekrar çalıştırılabilir.
--
-- ÖLÇÜM (2026-09-10, canlı)
--   products                      1.677 satır / 552 kB
--   address_records                 119 satır  (elle giriliyor, yavaş büyüyor)
--   products.stock_name üzerinde index YOKTU
--   pg_trgm kurulu DEĞİLDİ (mevcut)

-- ---------------------------------------------------------------- pg_trgm
-- `ilike '%aranan%'` sorguları btree index kullanamaz; baştaki joker karakter
-- yüzünden her zaman sequential scan olur. Trigram GIN index'i tam da bu deseni
-- hızlandırmak için var. Stok adı araması (ör. "TOHANA") bu olmadan 100k satırda
-- her tuş vuruşunda tam tarama demek.
create extension if not exists pg_trgm;

-- ------------------------------------------------------- sıralama index'i
-- Stoklar ekranı varsayılan olarak stok adına göre sıralıyor. Sunucu tarafı
-- sayfalamada (ORDER BY + LIMIT/OFFSET) index yoksa her sayfa isteği tüm tabloyu
-- sıralamak zorunda kalır.
create index if not exists idx_products_stock_name
  on public.products (stock_name);

-- --------------------------------------------------------- arama index'leri
create index if not exists idx_products_stock_code_trgm
  on public.products using gin (stock_code gin_trgm_ops);

create index if not exists idx_products_stock_name_trgm
  on public.products using gin (stock_name gin_trgm_ops);

create index if not exists idx_product_barcodes_barcode_trgm
  on public.product_barcodes using gin (barcode gin_trgm_ops);

-- ------------------------------------------------------------ metrik view
-- Stoklar ekranı "adres sayısı" ve "koli sayısı" üzerinden filtreliyor ve
-- sıralıyor. Bu değerler address_records'tan türediği için istemcide hesaplamak
-- tüm adres tablosunu çekmeyi gerektiriyordu.
--
-- View, agregasyonu veritabanında yapıyor. address_records küçük bir tablo
-- (adresler elle giriliyor) ve product_id üzerinde index'li, dolayısıyla join
-- ucuz. Ürün tarafı 100k'ya çıksa da bu yapı ölçekleniyor.
--
-- security_invoker = true: view, çağıran rolün yetkileriyle çalışır, yani
-- products ve address_records üzerindeki RLS politikaları aynen geçerli kalır.
-- (Varsayılan davranış view sahibinin yetkilerini kullanmak olurdu — RLS'i
-- baypas eden gizli bir arka kapı yaratırdı.)
create or replace view public.products_with_metrics
with (security_invoker = true) as
select
  p.id,
  p.stock_code,
  p.stock_name,
  p.is_active,
  p.created_at,
  p.updated_at,
  coalesce(m.address_count, 0)::integer as address_count,
  coalesce(m.total_cartons, 0)::integer as total_cartons
from public.products p
left join (
  select
    product_id,
    count(*)::integer          as address_count,
    sum(carton_count)::integer as total_cartons
  from public.address_records
  where is_active
  group by product_id
) m on m.product_id = p.id;

comment on view public.products_with_metrics is
  'Stoklar ekranı için ürün + aktif adres sayısı + toplam koli. Agregasyon istemciye tüm adres tablosunu çektirmemek için burada yapılıyor. security_invoker=true, RLS geçerli.';

grant select on public.products_with_metrics to anon, authenticated;
