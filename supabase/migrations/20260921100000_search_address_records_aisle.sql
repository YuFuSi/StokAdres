-- Adresler ekranı: koridor (adresin ilk harfi) filtresi
--
-- NEDEN
-- search_address_records düz alt dize araması yapıyor ('%G%' adresin ortasında
-- ve stok adlarında da eşleşir); "yalnızca G koridoru" sorgusu bununla
-- ifade edilemiyor. Ayrı, tam eşleşen bir parametre ekleniyor.
--
-- p_aisle boşsa davranış eskisiyle birebir aynı. Doluysa adresin ilk harfi
-- eşleşir (F13-01 → F). Biçim dışı adresler (ör. H21-1) de ilk harfine göre
-- girer; address_route_key'den farkı bu (Tuzak #17).
--
-- İmza değiştiği için eski 5 parametreli fonksiyon önce kaldırılıyor; aksi
-- halde iki aşırı yükleme yan yana kalır ve varsayılan değerli çağrılar
-- "function is not unique" ile düşer.
--
-- Yetkiler: eski fonksiyonla aynı (anon EXECUTE, SECURITY INVOKER, salt okuma).

drop function if exists public.search_address_records(text, text, text, integer, integer);

create or replace function public.search_address_records(
  p_query  text    default '',
  p_filter text    default 'all',
  p_sort   text    default 'updated-at',
  p_limit  integer default 50,
  p_offset integer default 0,
  p_aisle  text    default ''
)
returns table (
  id           uuid,
  product_id   uuid,
  stock_code   text,
  stock_name   text,
  address      text,
  carton_count integer,
  is_active    boolean,
  created_at   timestamptz,
  updated_at   timestamptz,
  total_count  bigint
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  with pattern as (select '%' || p_query || '%' as p),
  joined as materialized (
    select
      a.id, a.product_id, p.stock_code, p.stock_name,
      a.address, a.carton_count, a.is_active, a.created_at, a.updated_at
    from public.address_records a
    join public.products p on p.id = a.product_id
    where case p_filter
            when 'active'   then a.is_active
            when 'inactive' then not a.is_active
            else true
          end
      and (p_aisle = '' or upper(left(a.address, 1)) = upper(p_aisle))
      and (
        p_query = ''
        or a.address    ilike (select pt.p from pattern pt)
        or p.stock_code ilike (select pt.p from pattern pt)
        or p.stock_name ilike (select pt.p from pattern pt)
        or exists (
          select 1 from public.product_barcodes b
          where b.product_id = a.product_id
            and b.barcode ilike (select pt.p from pattern pt)
        )
      )
  ),
  counted as (
    select j.*, count(*) over () as total_count from joined j
  )
  select *
  from counted
  order by
    case when p_sort = 'address'    then address    end asc,
    case when p_sort = 'stock-code' then stock_code end asc,
    case when p_sort = 'stock-name' then stock_name end asc,
    case when p_sort = 'carton'     then carton_count end desc,
    case when p_sort = 'updated-at' then updated_at end desc,
    id asc
  limit p_limit offset p_offset;
$function$;
