/**
 * PostgREST filtreleri için metin kaçırma yardımcıları (SAF modül — Supabase import etmez).
 * Tuzak #11 uyarınca saf fonksiyonlar veritabanı istemcisinden ayrı tutulur.
 */

/**
 * PostgREST or(...) filtresinde kullanılacak arama metnini kaçırır.
 * - Virgül (,) PostgREST or() filtresinde mantıksal ayırıcıdır; kaçırılmazsa filtre sözdizimi bozulur.
 * - % ve _ PostgreSQL LIKE/ILIKE joker karakterleridir; kaçırılmazsa beklenmedik desen eşleşmesi üretir.
 * - Ters eğik çizgi (\) kaçış karakterinin kendisidir.
 */
export function escapePostgrestOrPattern(term: string): string {
  return term.trim().replace(/[\\%_,]/g, (char) => `\\${char}`)
}
