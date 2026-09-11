-- Güvenlik gerilemesini düzelt: iki sayaç view'ı security_invoker olmadan
-- yeniden oluşturulmuştu (20260910191458 product_filter_counts,
-- 20260910193945 address_record_counts). Supabase linter: 2 × ERROR
-- security_definer_view. Faz 3.2'de bulgular 13 → 1'e inmişti; bu ikisi
-- sonradan geri geldi.
--
-- Davranış değişmez: products ve address_records üzerinde anon/authenticated
-- SELECT politikaları `using (true)` (2026-09-11 pg_policies ile doğrulandı).
-- View artık çağıranın yetkileriyle çalışır; RLS ileride daraltılırsa sayaçlar
-- da ona uyar. Additive: tablo/veri değişikliği yok.

alter view public.product_filter_counts set (security_invoker = true);
alter view public.address_record_counts set (security_invoker = true);
