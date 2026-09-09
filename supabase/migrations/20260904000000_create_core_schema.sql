-- Sprint 0.2 — Cekirdek sema (products, product_barcodes, address_records)
--
-- NEDEN BU DOSYA VAR
-- Bu uc tablo uygulamanin cekirdegi olmasina ragmen repository'de hicbir
-- migration'da CREATE TABLE tanimlari yoktu; yalnizca 20260905_* dosyalarinda
-- foreign key hedefi olarak referans ediliyorlardi. Sonuc olarak migration'lar
-- bos bir projede calismiyordu ve disaster recovery mumkun degildi.
--
-- KAYNAK
-- Icerik canli veritabanindan (proje ryuguxxnmccybquqigji, PostgreSQL 17.6)
-- 2026-09-09 tarihinde okunarak cikarilmistir. Tahmin yok: kolonlar, kisitlar,
-- index'ler ve RLS politikalari pg_catalog / pg_indexes / pg_policies
-- sorgulariyla dogrulandi.
--
-- TARIH SIRASI
-- Dosya adi bilerek 20260905_* dosyalarindan once gelecek sekilde secildi;
-- audit migration'i bu tablolar uzerinde trigger kuruyor, dolayisiyla tablolar
-- once yaratilmali.
--
-- IDEMPOTENT
-- Tum ifadeler "if not exists" / "drop policy if exists" ile yazildi. Mevcut
-- canli veritabaninda calistirilirsa hicbir sey degistirmez (no-op).
--
-- KAPSAM DISI
-- Audit trigger'lari ve RPC'ler 20260905_create_audit_logs.sql ile
-- 20260905_create_address_conflict*.sql dosyalarinda tanimli; burada
-- tekrarlanmadi. product_barcodes audit trigger'i ayri bir dosyada
-- (20260908_add_product_barcodes_audit_trigger.sql) ele alindi, cunku
-- write_audit_log fonksiyonuna bagimli.

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  stock_code text not null,
  stock_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_active boolean not null default true
);

-- DIKKAT: unique kisit ham stock_code uzerinde; lower(trim(...)) DEGIL.
-- 'ZUCC123' ve 'zucc123' ayri iki urun olarak kaydedilebilir. Canli veride su
-- an case-insensitive duplicate yok (2026-09-09 taramasi: 0), ancak import
-- akisi bunu uretebilir. Normalize edilmis unique index'e gecis Phase 1'de
-- degerlendirilmeli; burada canli sema birebir korunuyor.
-- Sadece yoksa ekle. drop+add yapmiyoruz: mevcut bir veritabaninda kisitin
-- kisa sureligine kalktigi bir pencere olusmasin.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_stock_code_unique'
  ) then
    alter table public.products add constraint products_stock_code_unique unique (stock_code);
  end if;
end
$$;

create index if not exists idx_products_stock_code on public.products using btree (stock_code);
create index if not exists idx_products_is_active on public.products using btree (is_active);

-- ---------------------------------------------------------------------------
-- product_barcodes
-- ---------------------------------------------------------------------------
create table if not exists public.product_barcodes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  barcode text not null,
  created_at timestamptz not null default now(),
  constraint product_barcodes_barcode_not_empty check (length(trim(both from barcode)) > 0)
);

-- Barkod benzersizligi normalize edilmis (case/bosluk duyarsiz).
-- src/services/productService.ts icindeki DuplicateProductBarcodeError bu
-- index'in urettigi 23505 hatasina dayanir.
create unique index if not exists product_barcodes_barcode_unique
  on public.product_barcodes using btree (lower(trim(both from barcode)));
create index if not exists product_barcodes_barcode_idx on public.product_barcodes using btree (barcode);
create index if not exists product_barcodes_product_id_idx on public.product_barcodes using btree (product_id);

-- ---------------------------------------------------------------------------
-- address_records
-- ---------------------------------------------------------------------------
create table if not exists public.address_records (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  address text not null,
  carton_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint address_records_carton_count_check check (carton_count >= 0)
);

-- NOT: CHECK carton_count >= 0 sifira izin verir; uygulama katmani ise
-- >= 1 dayatir (src/import/importValidation.ts, ProductDetailPage,
-- AddressesPage). Kasitli mi, yoksa drift mi oldugu Phase 1'de netlesmeli.

-- Ayni urun icin ayni adreste birden fazla AKTIF kayit engellenir.
-- src/services/addressRecordService.ts icindeki DuplicateActiveAddressError
-- bu index'e dayanir. Pasif kayitlar kisitin disindadir; conflict cozumundeki
-- "once pasiflestir, sonra yeni kayit ekle" akisi bu sayede calisir.
create unique index if not exists idx_address_records_unique_active_address
  on public.address_records using btree (product_id, lower(trim(both from address)))
  where (is_active = true);

create index if not exists idx_address_records_product_id on public.address_records using btree (product_id);
create index if not exists idx_address_records_address on public.address_records using btree (address);
create index if not exists idx_address_records_active on public.address_records using btree (is_active);

-- ---------------------------------------------------------------------------
-- updated_at otomasyonu
-- ---------------------------------------------------------------------------
-- NOT: Canli surumde search_path ayarli degil (Supabase linter uyarisi
-- 0011_function_search_path_mutable). Bu dosya canli semayi birebir yansitmak
-- icin ayni sekilde birakildi; sertlestirme ayri bir migration'a birakildi.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists address_records_set_updated_at on public.address_records;
create trigger address_records_set_updated_at
before update on public.address_records
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- UYARI (bilinen ve kabul edilmis borc):
-- Asagidaki politikalar anon ve authenticated rollerine bu uc tablo uzerinde
-- tam SELECT/INSERT/UPDATE/DELETE yetkisi verir. Uygulamada henuz auth
-- olmadigi icin renderer bundle'ina inline edilen publishable anahtarla
-- calisilmaktadir. Anahtari eline geciren herkes tum depo verisini okuyabilir
-- ve degistirebilir.
--
-- Ozellikle: products uzerindeki DELETE politikasi + address_records ve
-- product_barcodes uzerindeki ON DELETE CASCADE birlestiginde, tek bir urun
-- silme islemi o urune bagli tum adres ve barkod kayitlarini da siler.
--
-- Bu dosya mevcut durumu OLDUGU GIBI belgeler; sertlestirme Phase 8'de
-- (Auth + rol bazli RLS) yapilacaktir.

alter table public.products enable row level security;
alter table public.product_barcodes enable row level security;
alter table public.address_records enable row level security;

drop policy if exists products_select_public on public.products;
drop policy if exists products_insert_public on public.products;
drop policy if exists products_update_public on public.products;
drop policy if exists products_delete_public on public.products;
create policy products_select_public on public.products for select to anon, authenticated using (true);
create policy products_insert_public on public.products for insert to anon, authenticated with check (true);
create policy products_update_public on public.products for update to anon, authenticated using (true) with check (true);
create policy products_delete_public on public.products for delete to anon, authenticated using (true);

drop policy if exists product_barcodes_select on public.product_barcodes;
drop policy if exists product_barcodes_insert on public.product_barcodes;
drop policy if exists product_barcodes_update on public.product_barcodes;
drop policy if exists product_barcodes_delete on public.product_barcodes;
create policy product_barcodes_select on public.product_barcodes for select to anon, authenticated using (true);
create policy product_barcodes_insert on public.product_barcodes for insert to anon, authenticated with check (true);
create policy product_barcodes_update on public.product_barcodes for update to anon, authenticated using (true) with check (true);
create policy product_barcodes_delete on public.product_barcodes for delete to anon, authenticated using (true);

drop policy if exists address_records_select_public on public.address_records;
drop policy if exists address_records_insert_public on public.address_records;
drop policy if exists address_records_update_public on public.address_records;
drop policy if exists address_records_delete_public on public.address_records;
create policy address_records_select_public on public.address_records for select to anon, authenticated using (true);
create policy address_records_insert_public on public.address_records for insert to anon, authenticated with check (true);
create policy address_records_update_public on public.address_records for update to anon, authenticated using (true) with check (true);
create policy address_records_delete_public on public.address_records for delete to anon, authenticated using (true);
