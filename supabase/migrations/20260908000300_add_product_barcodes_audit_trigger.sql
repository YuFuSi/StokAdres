-- Sprint 0.2 — product_barcodes audit trigger'i (repository'deki eksik parca)
--
-- NEDEN BU DOSYA VAR
-- Canli veritabaninda public.audit_product_barcodes_trigger() fonksiyonu ve
-- product_barcodes_audit_trigger trigger'i mevcut ve aktif olarak calisiyor,
-- ancak repository'de hicbir migration'da tanimlari yoktu. Barkod ekleme /
-- silme / degistirme islemleri audit_logs'a 'product-updated' action'i ile
-- kaydediliyor; bu kayitlar canli veride gozlemlendi:
--   'zücc11111 ürününe 8689689263569 barkodu eklendi.'   new_data {"barcode":...}
--   'AUDIT-TEST-001 ürününden 1111111111111 barkodu silindi.' old_data {"barcode":...}
--
-- Sprint 0.1'de bu trigger'in varligi audit kayitlarindan tespit edilmis ama
-- govdesi okunamadigi icin repository'ye eklenmemisti (tahmin edilmemesi
-- gerektigi icin). Bu dosyadaki tanim 2026-09-09'da canli veritabanindan
-- pg_get_functiondef() ile birebir alinmistir.
--
-- BAGIMLILIK
-- public.write_audit_log(...) fonksiyonuna baglidir; o da
-- 20260905_create_audit_logs.sql icinde tanimlanir. Bu yuzden dosya adi
-- bilerek o migration'dan sonraya konumlandirildi.
--
-- IDEMPOTENT: create or replace + drop trigger if exists. Canli veritabaninda
-- calistirilirsa davranis degismez (no-op).

create or replace function public.audit_product_barcodes_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  stock_code_value text;
  stock_name_value text;
  product_id_value uuid;
  barcode_value text;
  action_description text;
  old_snapshot jsonb;
  new_snapshot jsonb;
  change_type text;
begin
  if tg_op = 'DELETE' then
    product_id_value := old.product_id;
    barcode_value := old.barcode;

    -- Urun de silindiyse (ON DELETE CASCADE) audit yazma: products uzerindeki
    -- kendi audit'i zaten olayi kaydeder ve write_audit_log'un product_id FK'si
    -- artik cozulemez.
    if not exists (
      select 1
      from public.products
      where id = product_id_value
    ) then
      return old;
    end if;

    old_snapshot := jsonb_build_object('barcode', old.barcode);
    new_snapshot := null;
    change_type := 'barcode-removed';
  elsif tg_op = 'INSERT' then
    product_id_value := new.product_id;
    barcode_value := new.barcode;
    old_snapshot := null;
    new_snapshot := jsonb_build_object('barcode', new.barcode);
    change_type := 'barcode-added';
  elsif old.barcode is distinct from new.barcode or old.product_id is distinct from new.product_id then
    product_id_value := new.product_id;
    barcode_value := new.barcode;
    old_snapshot := jsonb_build_object('product_id', old.product_id, 'barcode', old.barcode);
    new_snapshot := jsonb_build_object('product_id', new.product_id, 'barcode', new.barcode);
    change_type := 'barcode-updated';
  else
    return new;
  end if;

  select stock_code, stock_name into stock_code_value, stock_name_value
  from public.products
  where id = product_id_value;

  action_description := case change_type
    when 'barcode-added' then coalesce(stock_code_value, '') || ' ürününe ' || coalesce(barcode_value, '') || ' barkodu eklendi.'
    when 'barcode-removed' then coalesce(stock_code_value, '') || ' ürününden ' || coalesce(barcode_value, '') || ' barkodu silindi.'
    else coalesce(stock_code_value, '') || ' ürününün barkodu güncellendi.'
  end;

  perform public.write_audit_log(
    'product-updated', 'product',
    case when tg_op = 'DELETE' then old.id else new.id end,
    product_id_value,
    stock_code_value,
    stock_name_value,
    action_description,
    old_snapshot,
    new_snapshot,
    jsonb_build_object('change_type', change_type)
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists product_barcodes_audit_trigger on public.product_barcodes;
create trigger product_barcodes_audit_trigger
after insert or delete or update on public.product_barcodes
for each row execute function public.audit_product_barcodes_trigger();
