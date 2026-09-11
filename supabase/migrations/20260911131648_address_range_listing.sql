-- Çıktı Al > Adres aralığı: "G01-01'den G'nin sonuna kadar" gibi bir aralıktaki
-- aktif adresler (Harun abinin isteği, 2026-09-11).
--
-- Rota anahtarı: <koridor harfi><2 haneli raf><2 haneli kat>, DİBİ = 00.
-- F14-DİBİ → F1400, F14-01 → F1401, G27-04 → G2704. Metin olarak sıralanınca
-- depo rotasıyla aynı sırayı verir (src/lib/addressFormat.ts compareAddresses
-- ile birebir). İstemci kısmi girişleri anahtara çevirir: "G" → G0000..G9999,
-- "G05" → G0500..G0599 (src/lib/addressRange.ts).
--
-- Biçim dışı adresler (ör. H21-1) anahtar üretmez ve aralığa girmez.
-- Additive: yeni fonksiyonlar ve bir kısmi index. SECURITY INVOKER, RLS geçerli.

create or replace function public.address_route_key(p_address text)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select case
    when upper(trim(p_address)) ~ '^[A-Z][0-9]{2}-[0-9]{2}$'
      then left(upper(trim(p_address)), 3) || right(trim(p_address), 2)
    when upper(trim(p_address)) ~ '^[A-Z][0-9]{2}-DİBİ$'
      then left(upper(trim(p_address)), 3) || '00'
  end
$$;

-- Aralık sorgusu 300k adreste de tablo taraması yapmasın.
create index if not exists idx_address_records_route_key
  on public.address_records (public.address_route_key(address))
  where is_active;

create or replace function public.list_addresses_in_range(p_from_key text, p_to_key text)
returns table (
  id uuid,
  product_id uuid,
  stock_code text,
  stock_name text,
  address text,
  carton_count integer,
  route_key text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select a.id, a.product_id, p.stock_code, p.stock_name, a.address, a.carton_count, public.address_route_key(a.address)
  from public.address_records a
  join public.products p on p.id = a.product_id
  where a.is_active
    and public.address_route_key(a.address) between p_from_key and p_to_key
  order by public.address_route_key(a.address), p.stock_code, a.id
$$;

revoke all on function public.list_addresses_in_range(text, text) from public;
grant execute on function public.list_addresses_in_range(text, text) to anon, authenticated;
grant execute on function public.address_route_key(text) to anon, authenticated;
