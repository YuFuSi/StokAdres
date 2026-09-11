-- Faz 3.2 — Veritabanı yüzeyini daralt
--
-- Supabase güvenlik denetçisinin (get_advisors) 13 bulgusundan 12'sini kapatır.
-- Hiçbir tablo düşürülmez, hiçbir veri değişmez, uygulama davranışı korunur.

-- ---------------------------------------------------------------------------
-- 1) products üzerindeki anon DELETE politikasını daralt
-- ---------------------------------------------------------------------------
-- Plan bu politikanın tümüyle kaldırılmasını öngörüyordu; gerekçe "uygulama
-- deleteProduct implement etmiyor, maliyeti sıfır" idi. Bu DOĞRU DEĞİL:
-- productService.rollbackCreatedProduct ürün siliyor ve iki telafi yolundan
-- çağrılıyor (createProduct'ta barkod yazımı patlarsa; AddressRecordService.
-- create'te adres kaydı patlarsa). Politikayı düz kaldırmak bu telafileri
-- bozar ve tam olarak önlemeye çalıştığımız yetim ürünleri üretirdi.
--
-- Asıl tehlike silme yetkisinin kendisi değil, ZİNCİRLEME silme: address_records
-- ve product_barcodes üzerindeki FK'ler ON DELETE CASCADE. Adresleri olan tek
-- bir ürünü silmek, o ürünün tüm adres ve barkod kayıtlarını da sessizce siler.
--
-- Bu yüzden politika kaldırılmıyor, KAPSAMI DARALTILIYOR: yalnızca hiçbir adres
-- kaydı ve hiçbir barkodu olmayan ürünler silinebilir. Telafi yolları çalışmaya
-- devam eder (o ürünler tanımı gereği boştur), zincirleme silme imkânsız hale
-- gelir.
--
-- Alt sorgular product_id üzerindeki mevcut index'leri kullanır
-- (idx_address_records_product_id, product_barcodes_product_id_idx).
drop policy if exists products_delete_public on public.products;
create policy products_delete_public on public.products
for delete to anon, authenticated
using (
  not exists (select 1 from public.address_records ar where ar.product_id = products.id)
  and not exists (select 1 from public.product_barcodes pb where pb.product_id = products.id)
);

-- ---------------------------------------------------------------------------
-- 2) Trigger fonksiyonlarından EXECUTE yetkisini geri al
-- ---------------------------------------------------------------------------
-- Bu dördü SECURITY DEFINER ve PostgreSQL'in CREATE FUNCTION varsayılanı
-- nedeniyle PUBLIC'e açık. Sonuç: /rest/v1/rpc/audit_products_trigger gibi
-- uçlardan doğrudan çağrılabiliyorlar.
--
-- Trigger olarak çalışmaları etkilenmez: PostgreSQL, EXECUTE yetkisini
-- CREATE TRIGGER anında denetler, trigger her ateşlendiğinde değil. Trigger'lar
-- zaten kurulu.
do $$
declare fn record; role_name text;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'audit_products_trigger',
        'audit_address_records_trigger',
        'audit_product_barcodes_trigger',
        'audit_conflicts_trigger'
      )
  loop
    execute format('revoke all on function %s from public', fn.signature);
    foreach role_name in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = role_name) then
        execute format('revoke all on function %s from %I', fn.signature, role_name);
      end if;
    end loop;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 3) Çakışma RPC'lerinden EXECUTE yetkisini geri al
-- ---------------------------------------------------------------------------
-- Çakışma ekranı ve conflictService Faz 3.1'de silindi; istemci bu iki
-- fonksiyonu artık çağırmıyor. address_conflicts TABLOSU ve migration'ları
-- yerinde duruyor (0 satır, kararı geri alınabilir tutuyor) — yalnızca dışa
-- açık çağrılabilirlik kapatılıyor.
--
-- resolve_address_conflict özellikle önemli: SECURITY DEFINER ve
-- address_records üzerinde UPDATE + INSERT yapıyor.
do $$
declare fn record; role_name text;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('create_address_conflict', 'resolve_address_conflict')
  loop
    execute format('revoke all on function %s from public', fn.signature);
    foreach role_name in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = role_name) then
        execute format('revoke all on function %s from %I', fn.signature, role_name);
      end if;
    end loop;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 4) search_path'i sabitle
-- ---------------------------------------------------------------------------
-- İkisinde de search_path ayarlı değil; çağıran rolün search_path'i geçerli
-- oluyor ve fonksiyon içindeki niteliksiz adlar başka bir şemadaki nesneye
-- çözülebilir. Gövdeler DEĞİŞTİRİLMİYOR, yalnızca search_path ekleniyor.
create or replace function public.audit_operation_id()
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select nullif(current_setting('app.operation_id', true), '')::uuid;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- KAPSAM DIŞI: pg_trgm eklentisinin public şemada olması
-- ---------------------------------------------------------------------------
-- Denetçi bunu da uyarı olarak veriyor. Başka bir şemaya taşımak, eklentiye
-- bağımlı GIN trigram index'lerinin düşürülüp ~95.000 satır üzerinde yeniden
-- kurulmasını gerektirir. Bu bir isimlendirme hijyeni uyarısı; istismar
-- edilebilir bir yüzey değil. Bilerek bırakıldı.

-- ---------------------------------------------------------------------------
-- DOĞRULAMA (uygulamadan sonra çalıştırılabilir)
-- ---------------------------------------------------------------------------
--   select p.oid::regprocedure::text as fonksiyon,
--          has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' order by 1;
--
-- Beklenen: audit_*_trigger, create_address_conflict, resolve_address_conflict,
-- write_audit_log, clear_address_records, restore_address_records -> false.
-- search_products, audit_operation_id, set_updated_at -> true (sorun değil:
-- ilk ikisi SECURITY INVOKER, set_updated_at yalnızca trigger bağlamında
-- anlamlı ve NEW kaydı olmadan çağrılamaz).
