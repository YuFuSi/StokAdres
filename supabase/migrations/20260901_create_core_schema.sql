-- Sprint 0.2 — Eksik çekirdek şema migration'ı (products, product_barcodes, address_records)
--
-- SORUN
-- Repository'de yalnızca address_conflicts ve audit_logs için CREATE migration'ı
-- vardı. 20260905_create_address_conflicts.sql ve 20260905_create_audit_logs.sql
-- ise public.products ve public.address_records tablolarına foreign key ile
-- referans veriyor. Yani migration'lar sıfırdan bir veritabanına uygulanamıyordu:
-- ilk migration "relation public.products does not exist" ile patlıyordu.
-- Üç çekirdek tablo yalnızca canlı veritabanında elle oluşturulmuş durumdaydı.
--
-- BU DOSYANIN AMACI
-- Sıfırdan kurulabilirliği sağlamak. Dosya adı 20260901, yani conflicts/audit
-- migration'larından ÖNCE sıralanır ve FK bağımlılıkları karşılanır.
--
-- CANLI VERİTABANI İÇİN GÜVENLİK GARANTİSİ
-- Her tablo bloğu `to_regclass(...) is null` koşuluyla korunuyor. Tablo zaten
-- varsa o blok BÜTÜNÜYLE atlanır: tablo, index, constraint, RLS ve policy
-- ifadelerinin hiçbiri çalışmaz. Idempotenttir, tekrar tekrar çalıştırılabilir.
--
-- Canlı veritabanında (üç tablo da mevcut) bu dosyanın NET ETKİSİ ŞUDUR:
--   * Hiçbir veri okunmaz/yazılmaz/silinmez.
--   * Hiçbir tablo, kolon, constraint, index, RLS ayarı veya policy
--     oluşturulmaz, değiştirilmez veya düşürülmez.
--   * Hiçbir mevcut trigger veya fonksiyon değiştirilmez ya da düşürülmez.
--   * TEK istisna, dosyanın sonundaki `public.stokadres_set_updated_at()`
--     fonksiyonudur: bu fonksiyon canlıda da OLUŞTURULUR. Ancak proje önekli
--     bu ad mevcut hiçbir nesneyle çakışmaz ve fonksiyon hiçbir trigger'a
--     bağlanmaz (aşağıdaki trigger bloğu, tabloda zaten trigger olduğu için
--     canlıda atlanır). Yani kullanılmayan, davranışı etkilemeyen bir nesne
--     eklenir; yıkıcı ya da gözlemlenebilir bir etkisi yoktur.
--
-- DOĞRULANMIŞ OLANLAR (2026-09-09, canlı DB, publishable anahtar, read-only)
--   * products          : id, stock_code, stock_name, created_at, updated_at, is_active
--                         (barcode kolonu YOK — bkz.
--                          20260908_fix_audit_products_trigger_barcode_drift.sql)
--   * product_barcodes  : id, product_id, barcode, created_at
--   * address_records   : id, product_id, address, carton_count, is_active,
--                         created_at, updated_at
--   * FK products <- product_barcodes ve FK products <- address_records mevcut:
--     PostgREST embed'leri (`product_barcodes(barcode)`, `products!inner(...)`)
--     canlıda çalışıyor; PostgREST bu ilişkileri yalnızca gerçek foreign key
--     üzerinden çözebilir.
--
-- ÇIKARSANMIŞ, DOĞRULANMAMIŞ OLANLAR  <-- DİKKAT
-- Aşağıdaki unique constraint'ler, index'ler, RLS politikaları ve updated_at
-- trigger'ı CANLI ŞEMADAN OKUNAMADI. Publishable (anon) anahtar pg_catalog'a,
-- OpenAPI şema köküne ve pg_proc.prosrc'a erişemiyor:
--     GET /rest/v1/  ->  {"message":"Secret API key required"}
-- Bu yüzden buradaki tanımlar uygulama davranışından çıkarsandı:
--   * products.stock_code UNIQUE
--       -> getProductByStockCode() maybeSingle() kullanıyor (birden fazla satır
--          gelirse hata verir) ve DuplicateProductStockCodeError 23505 bekliyor.
--   * product_barcodes.barcode GLOBAL UNIQUE
--       -> DuplicateProductBarcodeError: "Her barkod yalnızca bir üründe
--          kullanılabilir."
--   * address_records (product_id, address) WHERE is_active UNIQUE
--       -> DuplicateActiveAddressError ve dataBackup.ts içindeki
--          hasUniqueActiveAddresses() kontrolü (yalnızca aktif kayıtlar).
--
-- Bu nedenle: canlı şema elevated erişimle (service_role anahtarı veya DB
-- şifresi ile `supabase db dump`) çıkarılana kadar bu dosya SIFIRDAN KURULUM
-- İÇİN BİR TAHMİNDİR, canlı şemanın kanıtlanmış aynası DEĞİLDİR. Doğrulama
-- adımları sprint raporunda listelendi.

-- ---------------------------------------------------------------- products
do $$
begin
  if to_regclass('public.products') is not null then
    raise notice 'public.products zaten var; blok atlandi (canli DB korunuyor).';
  else
    create table public.products (
      id uuid primary key default gen_random_uuid(),
      stock_code text not null,
      stock_name text not null,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint products_stock_code_key unique (stock_code)
    );

    create index products_stock_name_idx on public.products (stock_name);
    create index products_is_active_idx on public.products (is_active);

    -- RLS: canlıda uygulama publishable/anon anahtarıyla ürün oluşturup
    -- güncelleyebiliyor, yani canlı politikalar anon yazmaya izin veriyor.
    -- Sıfırdan kurulan bir veritabanının uygulamayı çalıştırabilmesi için aynı
    -- davranış burada da tanımlanıyor.
    --
    -- GÜVENLİK NOTU: Bu, bilinçli olarak kabul edilmiş bir zayıflıktır, güvenli
    -- bir son durum DEĞİLDİR. anon anahtarı renderer bundle'ına gömülü olduğu
    -- için bu politikalar altında installer'ı olan herkes ürün yazabilir.
    -- Kimlik doğrulama ve rol bazlı politikalar ayrı bir sprintin konusudur;
    -- bu sprintte bilerek değiştirilmedi.
    alter table public.products enable row level security;
    create policy products_anon_select on public.products
      for select to anon, authenticated using (true);
    create policy products_anon_insert on public.products
      for insert to anon, authenticated with check (true);
    create policy products_anon_update on public.products
      for update to anon, authenticated using (true) with check (true);

    raise notice 'public.products olusturuldu.';
  end if;
end
$$;

-- -------------------------------------------------------- product_barcodes
do $$
begin
  if to_regclass('public.product_barcodes') is not null then
    raise notice 'public.product_barcodes zaten var; blok atlandi (canli DB korunuyor).';
  else
    create table public.product_barcodes (
      id uuid primary key default gen_random_uuid(),
      product_id uuid not null references public.products(id) on delete cascade,
      barcode text not null,
      created_at timestamptz not null default now(),
      -- Barkod tüm ürünler genelinde benzersizdir, ürün içinde değil.
      constraint product_barcodes_barcode_key unique (barcode)
    );

    create index product_barcodes_product_id_idx on public.product_barcodes (product_id);

    alter table public.product_barcodes enable row level security;
    create policy product_barcodes_anon_select on public.product_barcodes
      for select to anon, authenticated using (true);
    create policy product_barcodes_anon_insert on public.product_barcodes
      for insert to anon, authenticated with check (true);
    create policy product_barcodes_anon_delete on public.product_barcodes
      for delete to anon, authenticated using (true);

    raise notice 'public.product_barcodes olusturuldu.';
  end if;
end
$$;

-- --------------------------------------------------------- address_records
do $$
begin
  if to_regclass('public.address_records') is not null then
    raise notice 'public.address_records zaten var; blok atlandi (canli DB korunuyor).';
  else
    create table public.address_records (
      id uuid primary key default gen_random_uuid(),
      product_id uuid not null references public.products(id) on delete cascade,
      address text not null,
      carton_count integer not null,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint address_records_carton_count_check check (carton_count >= 0)
    );

    -- Kısmi unique: aynı ürün + aynı adres yalnızca bir kez AKTİF olabilir.
    -- Pasif kayıtlar geçmiş olarak birikebildiği için koşul zorunlu
    -- (resolve_address_conflict 'replace-with-incoming' akışı eskisini pasife
    -- çekip yenisini ekliyor).
    create unique index address_records_active_product_address_key
      on public.address_records (product_id, address)
      where is_active;

    create index address_records_product_id_idx on public.address_records (product_id);
    create index address_records_created_at_idx on public.address_records (created_at);

    alter table public.address_records enable row level security;
    create policy address_records_anon_select on public.address_records
      for select to anon, authenticated using (true);
    create policy address_records_anon_insert on public.address_records
      for insert to anon, authenticated with check (true);
    create policy address_records_anon_update on public.address_records
      for update to anon, authenticated using (true) with check (true);
    create policy address_records_anon_delete on public.address_records
      for delete to anon, authenticated using (true);

    raise notice 'public.address_records olusturuldu.';
  end if;
end
$$;

-- ------------------------------------------------------------- updated_at
-- products ve address_records'ta updated_at kolonu var ama uygulama UPDATE
-- sırasında bu alanı hiç göndermiyor (bkz. productService.updateProduct ve
-- AddressRecordService.update). Alanın anlamlı kalması için veritabanı
-- tarafında bakım gerekiyor.
--
-- Canlı DB'de böyle bir trigger olup olmadığı OKUNAMADI. Bu yüzden fonksiyon
-- projeye özel bir adla (stokadres_ önekiyle) tanımlanıyor: bu ad canlıda
-- başka bir sahibin fonksiyonuyla çakışamaz, dolayısıyla `create or replace`
-- mevcut hiçbir şeyi ezmez.
create or replace function public.stokadres_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

-- Trigger yalnızca ilgili tabloda hiç kullanıcı trigger'ı yoksa eklenir.
-- Canlıda zaten bir trigger varsa (audit trigger'ları dahil) hiçbir şey
-- yapılmaz: mevcut trigger'lar asla düşürülmez veya değiştirilmez.
do $$
declare
  target text;
begin
  foreach target in array array['products', 'address_records'] loop
    if exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = target and not t.tgisinternal
    ) then
      raise notice '%: tabloda zaten trigger var; updated_at trigger eklenmedi.', target;
    else
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.stokadres_set_updated_at()',
        target || '_set_updated_at', target
      );
      raise notice '%: updated_at trigger eklendi.', target;
    end if;
  end loop;
end
$$;
