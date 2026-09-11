-- Taşıma sonrası güvenlik düzeltmesi (StokAdres-EU, Frankfurt).
--
-- pg_dump/psql ile Tokyo'dan kopyalanan fonksiyonlar, yeni projede
-- oluşturuldukları anda Supabase'in varsayılan yetkileriyle
-- (ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon, authenticated)
-- EXECUTE aldı. pg_dump yetkileri PostgreSQL'in kendi varsayılanına (PUBLIC)
-- göre fark olarak yazdığı için bu yetkiler geri alınmadı.
--
-- get_advisors (2026-09-11): 9 SECURITY DEFINER fonksiyon anon/authenticated
-- tarafından çağrılabilir durumdaydı; aralarında Sprint 0.1'de kapatılan yıkıcı
-- clear_address_records ve restore_address_records var.
--
-- Tokyo'daki durumla birebir aynı hale getirir: bu 9 fonksiyonu yalnızca
-- postgres ve service_role çağırabilir. Trigger'lar etkilenmez — EXECUTE,
-- CREATE TRIGGER anında denetlenir (Faz 3.2'de canlıda doğrulandı).
-- İdempotent: Tokyo'da çalıştırılsa hiçbir şey değiştirmez.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname in (
        'audit_address_records_trigger', 'audit_conflicts_trigger',
        'audit_product_barcodes_trigger', 'audit_products_trigger',
        'clear_address_records', 'create_address_conflict',
        'resolve_address_conflict', 'restore_address_records', 'write_audit_log'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.signature);
  end loop;
end
$$;
