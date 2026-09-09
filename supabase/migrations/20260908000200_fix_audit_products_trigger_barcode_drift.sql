-- Sprint 0.1 — audit_products_trigger schema drift düzeltmesi
--
-- SORUN
-- 20260905_create_audit_logs.sql içindeki public.audit_products_trigger()
-- fonksiyonu products tablosunda bir "barcode" kolonu varsayıyor:
--
--   jsonb_build_object(..., 'barcode', new.barcode)
--   if tg_op = 'UPDATE' and (old.stock_code, old.stock_name, old.barcode)
--        is distinct from (new.stock_code, new.stock_name, new.barcode)
--
-- CANLI DB DOĞRULAMASI (2026-09-08, read-only, PostgREST üzerinden)
--   * products.barcode kolonu YOK.
--     GET /rest/v1/products?select=barcode ->
--       42703 "column products.barcode does not exist"
--   * public.product_barcodes tablosu VAR (id, product_id, barcode, created_at)
--     ve uygulama barkodları buradan okuyor (src/services/productService.ts).
--   * Canlı audit_logs'taki product-created kayıtlarının new_data alanı:
--       {"stock_code": "...", "stock_name": "..."}
--     yani "barcode" anahtarı içermiyor. Canlı trigger bu migration dosyasındaki
--     sürümden farklı; dosya bu haliyle canlı veritabanına hiç uygulanmamış.
--
-- RİSK
-- Bu dosya mevcut haliyle canlı veritabanına uygulanırsa (ör. supabase db push),
-- products tablosuna yapılan HER insert/update'te trigger 42703 hatası verir ve
-- ürün oluşturma tamamen kırılır. Repository'de duran aktif bir regresyon riski.
--
-- ÇÖZÜM
-- Fonksiyonu products tablosunun gerçek şemasına uyacak şekilde yeniden yaz:
-- barcode referanslarını kaldır, geri kalan davranışı birebir koru.
--
-- DAVRANIŞ KORUNUYOR
--   * action / entity_type / entity_id / product_id / stock_code / stock_name
--     alanları aynı.
--   * description metinleri aynı:
--       'ZÜCC68963 ürünü oluşturuldu.'   (canlı kayıtla birebir doğrulandı)
--       '<stock_code> ürünü güncellendi.'
--   * INSERT branch'inin ürettiği new_data artık canlı DB'nin ürettiğiyle
--     birebir aynı: {"stock_code": ..., "stock_name": ...}
--   * UPDATE branch'i yalnızca (stock_code, stock_name) değiştiğinde tetiklenir.
--
-- KAPSAM DIŞI (bilerek dokunulmadı)
-- Canlı veritabanında public.product_barcodes üzerinde, bu repository'de HİÇ
-- tanımı bulunmayan ayrı bir audit trigger'ı daha var. Barkod ekleme/silmeyi
-- 'product-updated' action'ıyla kaydediyor:
--   '<stock_code> ürününe <barcode> barkodu eklendi.'   new_data {"barcode": ...}
--   '<stock_code> ürününden <barcode> barkodu silindi.' old_data {"barcode": ...}
-- Tanımı canlı DB'den okunamadığı için (publishable anahtar pg_proc.prosrc'a
-- erişemiyor) tahmin edilerek repository'ye eklenmedi. Phase 1'de initial schema
-- çıkarılırken elevated erişimle alınmalıdır.

create or replace function public.audit_products_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit_log(
      'product-created', 'product', new.id, new.id, new.stock_code, new.stock_name,
      new.stock_code || ' ürünü oluşturuldu.', null,
      jsonb_build_object('stock_code', new.stock_code, 'stock_name', new.stock_name), '{}'::jsonb
    );
    return new;
  end if;

  if tg_op = 'UPDATE' and (old.stock_code, old.stock_name) is distinct from (new.stock_code, new.stock_name) then
    perform public.write_audit_log(
      'product-updated', 'product', new.id, new.id, new.stock_code, new.stock_name,
      new.stock_code || ' ürünü güncellendi.',
      jsonb_build_object('stock_code', old.stock_code, 'stock_name', old.stock_name),
      jsonb_build_object('stock_code', new.stock_code, 'stock_name', new.stock_name), '{}'::jsonb
    );
  end if;
  return new;
end;
$$;
