-- Sprint 0.1 — Yıkıcı RPC yetkilerinin geri alınması
--
-- SORUN
-- 20260905_create_audit_logs.sql aşağıdaki iki fonksiyona anon ve authenticated
-- rollerine EXECUTE yetkisi vermişti:
--
--   public.clear_address_records(uuid)
--     -> delete from public.address_records;            (WHERE yok, tüm tablo)
--   public.restore_address_records(jsonb, uuid)
--     -> delete from public.address_records; + toplu insert
--
-- Her ikisi de SECURITY DEFINER olduğundan RLS'i baypas eder. Uygulama
-- publishable/anon anahtarını renderer bundle'ına gömdüğü için (Vite VITE_*
-- değişkenlerini derleme sırasında inline eder), installer'ı eline geçiren
-- herkes tek bir RPC çağrısıyla tüm adres verisini silebiliyordu.
--
-- ÇÖZÜM
-- Fonksiyonlar DROP EDİLMEZ, gövdeleri değiştirilmez, imzaları korunur.
-- Yalnızca EXECUTE yetkisi geri alınır. Fonksiyon sahibi (genelde postgres)
-- yetkisini korur, dolayısıyla ileride Phase 8'de tanımlanacak admin rolüne
-- veya bir servis tarafına yeniden verilebilir.
--
-- NEDEN PUBLIC'TEN DE GERİ ALINIYOR
-- PostgreSQL, CREATE FUNCTION sırasında EXECUTE yetkisini varsayılan olarak
-- PUBLIC rolüne verir. Yalnızca anon/authenticated'tan geri almak yetmez;
-- PUBLIC üzerinden yetki devam ederdi. (Canlı DB'de public.audit_operation_id()
-- fonksiyonunun anon tarafından çağrılabildiği gözlemlendi — bu davranışın
-- kanıtı.)
--
-- UYGULAMAYA ETKİSİ: YOK
-- Bu iki RPC'yi çağıran tek kod yolu AddressRecordService.clear() ve
-- .replaceAll(); ikisi de yalnızca src/pages/HomePage.tsx üzerinden çağrılıyor
-- ve HomePage src/App.tsx'teki koşul nedeniyle hiçbir zaman render edilmiyor.
-- Erişilebilir hiçbir ekran etkilenmez.
--
-- IDEMPOTENT: Fonksiyon canlı veritabanında yoksa döngü hiç dönmez, hata olmaz.
-- Aynı migration birden fazla kez çalıştırılabilir.

do $$
declare
  fn record;
  role_name text;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('clear_address_records', 'restore_address_records')
  loop
    -- PUBLIC her zaman mevcuttur, doğrudan geri al.
    execute format('revoke all on function %s from public', fn.signature);

    -- anon / authenticated Supabase rolleridir; yoksa atla (yerel/farklı kurulum).
    foreach role_name in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = role_name) then
        execute format('revoke all on function %s from %I', fn.signature, role_name);
      end if;
    end loop;

    raise notice 'EXECUTE yetkisi geri alindi: %', fn.signature;
  end loop;
end
$$;
