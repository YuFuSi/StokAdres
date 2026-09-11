-- "Bunu mu demek istediniz?" — İçe Aktar önizlemesinde kayıtlı olmayan stok
-- kodları için benzer kayıtlı kodlar. Kaynak: Gemini'nin kâğıttan okurken
-- yaptığı hatalar (TEKSI0465 → TEKS10465).
--
-- İstemci önce deterministik varyantları dener (src/lib/stockCodeVariants.ts);
-- bu fonksiyon yalnızca onlar bir şey bulamazsa çağrılır. Öneriler asla
-- kendiliğinden yazılmaz, kullanıcı seçer.
--
-- Mevcut idx_products_stock_code_trgm (GIN) index'ini kullanır. Eşik 0.4:
-- 94.900 üründe 5 kod 76 ms (varsayılan 0.3 eşiğinde index 10 kat fazla aday
-- döndürüyor, ~50 ms/kod).
--
-- Additive: yalnızca yeni bir okuma fonksiyonu. SECURITY INVOKER, RLS geçerli.

-- pg_trgm.similarity_threshold, pg_trgm kütüphanesi bu oturumda yüklenene kadar
-- tanımsız bir parametre; tanımsızken fonksiyona SET olarak eklenemiyor
-- (42501). Kütüphaneyi yüklemek için zararsız bir okuma yeterli.
select public.show_limit();

create or replace function public.suggest_stock_codes(p_codes text[], p_limit integer default 3)
returns table (input_code text, stock_code text, stock_name text, score real)
language sql
stable
security invoker
set search_path = public, pg_temp
set pg_trgm.similarity_threshold = 0.4
as $$
  select c.code, s.stock_code, s.stock_name, s.score
  from (
    select distinct u.code
    from unnest(p_codes[1:50]) as u(code)
    where length(trim(u.code)) >= 3
  ) as c
  cross join lateral (
    select p.stock_code, p.stock_name, similarity(p.stock_code, c.code) as score
    from public.products p
    where p.stock_code % c.code
    order by score desc, p.stock_code
    limit least(greatest(coalesce(p_limit, 3), 1), 5)
  ) as s
$$;

revoke all on function public.suggest_stock_codes(text[], integer) from public;
grant execute on function public.suggest_stock_codes(text[], integer) to anon, authenticated;
