-- Faz 2.1 — CABA adres bulma için normalize stok kodu eşleştirmesi
--
-- NEDEN
-- CABA'dan gelen fiş listesindeki stok kodları, veritabanındakiyle birebir aynı
-- yazımda olmayabilir. Canlı veri (2026-09-10):
--   1670 kod tamamı büyük harf
--      8 kod tamamı küçük harf
--      6 kod karışık
--      0 kod baş/son boşluklu
--   lower(trim(stock_code)) ile benzersiz kayıt sayısı 1677 = toplam kayıt
--
-- Yani büyük/küçük harf duyarsız eşleştirme hem GEREKLİ (farklı yazımlar var)
-- hem GÜVENLİ (normalize edince çakışma olmuyor).
--
-- NEDEN RPC DEĞİL
-- Bunu bir SECURITY DEFINER RPC'siyle de çözebilirdik, ama Faz 3.2'de anon'a
-- açık fonksiyon yüzeyini daraltmayı planlıyoruz; yenisini eklemek ters yönde
-- olurdu. View'a normalize bir kolon eklemek aynı işi görüyor ve yeni bir
-- çağrılabilir fonksiyon yüzeyi açmıyor.
--
-- TAMAMEN EKLEMELİ: tablo, kolon, policy veya veri değişmiyor.

-- İfade index'i: PostgREST `stock_code_normalized=in.(...)` filtresini bu index
-- üzerinden çözer. Olmadan 100k satırda her eşleştirme tam tarama olurdu.
create index if not exists idx_products_stock_code_normalized
  on public.products (lower(trim(stock_code)));

-- View'a normalize kolon eklenir; mevcut kolonlar aynen korunur, dolayısıyla
-- Stoklar ekranının sorguları etkilenmez.
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
  coalesce(m.total_cartons, 0)::integer as total_cartons,
  -- Yeni kolon SONA ekleniyor: `create or replace view` mevcut kolonların
  -- sırasını veya adını değiştiremiyor, yalnızca sona ekleme yapabiliyor.
  -- Araya koymak view'ı düşürüp yeniden yaratmayı gerektirirdi.
  lower(trim(p.stock_code)) as stock_code_normalized
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
  'Stoklar ekrani ve CABA adres bulma icin urun + aktif adres sayisi + toplam koli + normalize stok kodu. security_invoker=true, RLS gecerli.';

grant select on public.products_with_metrics to anon, authenticated;
