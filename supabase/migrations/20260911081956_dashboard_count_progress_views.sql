-- Faz 8 — Genel Bakış: sayım ilerlemesi.
--
-- İki okuma view'ı. Agregasyon istemcide değil burada, çünkü adres kaydı sayısı
-- sayım ilerledikçe ürün sayısına (~95k) doğru büyüyecek (CLAUDE.md Tuzak #3).
-- security_invoker = true: RLS geçerli. Additive: tablo/veri değişikliği yok.

create or replace view public.address_aisle_summary
with (security_invoker = true) as
select
  upper(left(trim(a.address), 1)) as aisle,
  count(*)::integer as address_count,
  count(distinct a.product_id)::integer as product_count,
  coalesce(sum(a.carton_count), 0)::integer as carton_count,
  count(distinct upper(split_part(trim(a.address), '-', 1)))::integer as rack_count
from public.address_records a
where a.is_active
  -- Yalnızca depo biçimindeki adresler (F13-01, H21-1, F14-DİBİ). Biçim dışı
  -- bir girişin ilk harfi sahte bir "koridor" üretmesin.
  and upper(trim(a.address)) ~ '^[A-Z][0-9]{2}-'
group by 1;

comment on view public.address_aisle_summary is
  'Genel Bakis > Sayim Ilerlemesi: koridor basina aktif konum, urun, koli ve raf sayisi. security_invoker=true, RLS gecerli.';

grant select on public.address_aisle_summary to anon, authenticated;

create or replace view public.address_daily_activity
with (security_invoker = true) as
select
  -- Gün sınırı depo saatine göre: gece yarısından sonra girilen kayıt ertesi
  -- güne yazılsın, UTC'ye göre 3 saat kaymasın.
  (a.created_at at time zone 'Europe/Istanbul')::date as day,
  count(*)::integer as created_count,
  coalesce(sum(a.carton_count), 0)::integer as carton_count
from public.address_records a
where a.created_at >= now() - interval '31 days'
group by 1;

comment on view public.address_daily_activity is
  'Genel Bakis > Son 14 Gun: gun basina eklenen adres kaydi (son 31 gun, Europe/Istanbul). security_invoker=true, RLS gecerli.';

grant select on public.address_daily_activity to anon, authenticated;
