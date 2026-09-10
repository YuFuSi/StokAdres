-- Faz 1.2 — Genel Bakış sayaçları için tek satırlık özet view'ı
--
-- NEDEN
-- getDashboardData() bugün tüm ürünleri VE tüm adres kayıtlarını çekip
-- JavaScript'te sayıyor. 1.677 üründe ~487 KB; 100.000 üründe ~27 MB — üstelik
-- sadece dört sayı göstermek için.
--
-- Alternatif olarak dört ayrı `count` isteği atılabilirdi. Tek view tercih
-- edildi: dört sayı tek gidiş-dönüşte gelir ve hepsi aynı anın görüntüsü olur
-- (ayrı isteklerde araya yazma girerse sayılar birbiriyle tutarsız olabilir).
--
-- TAMAMEN EKLEMELİ: tablo, kolon, policy veya veri değişmiyor.
--
-- ÖLÇEK NOTU
-- products_with_address için `count(distinct product_id)` kullanılıyor ve bu
-- yalnızca address_records'u tarıyor. Adres kayıtları elle giriliyor, yani küçük
-- ve yavaş büyüyen bir tablo. Bunun yerine products üzerinden `exists(...)`
-- yazılsaydı 100.000 satırlık ürün tablosu taranırdı.

create or replace view public.dashboard_summary
with (security_invoker = true) as
select
  (select count(*) from public.products)::integer
    as total_products,
  (select count(*) from public.address_records where is_active)::integer
    as active_address_records,
  (select coalesce(sum(carton_count), 0) from public.address_records where is_active)::integer
    as total_cartons,
  (select count(distinct product_id) from public.address_records where is_active)::integer
    as products_with_address;

comment on view public.dashboard_summary is
  'Genel Bakis ekranindaki dort sayac. Tek satir doner. Istemcinin tum tabloyu cekmesini onlemek icin var. security_invoker=true, RLS gecerli.';

grant select on public.dashboard_summary to anon, authenticated;
