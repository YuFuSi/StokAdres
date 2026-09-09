// PostgREST (Supabase) her isteğe sunucu tarafında bir "max rows" sınırı uygular.
// Bu projenin canlı instance'ında sınır 1000'dir ve DOĞRULANMIŞTIR:
//
//   GET /rest/v1/products?select=id&order=stock_code
//   -> Content-Range: 0-999/1655
//
// Kritik nokta: istek BAŞARILI döner (200), hata yoktur, `error` null'dur.
// Yani `.select()` ile tüm tabloyu çektiğini sanan kod sessizce verinin bir
// kısmını kaybeder — 1655 üründen 1000'ini görür. Dashboard "toplam stok"
// sayısı, stok listesi, arama ve dışa aktarma bu yüzden eksik veri gösterir.
//
// Çözüm: `Range` header'ı (supabase-js'te `.range(from, to)`) ile sayfalı
// çekip birleştirmek. Aynı sorgunun 1000-1999 aralığı canlıda
// `Content-Range: 1000-1654/*` döndürerek sayfalamanın çalıştığını doğrular.

/** PostgREST'in sunucu tarafı max-rows sınırı ile aynı sayfa boyutu. */
export const SUPABASE_PAGE_SIZE = 1000

/**
 * Kaçak döngülere karşı güvenlik siniri. Bu sınıra ulaşılırsa veri sessizce
 * kırpılmaz; açık bir hata fırlatılır. Sessiz eksik veri, bu modülün
 * çözmek için var olduğu sorunun ta kendisidir.
 */
const MAX_PAGES = 200

type PageResult<Row> = {
  data: Row[] | null
  error: { code?: string; message: string } | null
}

/**
 * `fetchPage`'i sayfa sayfa çağırıp bütün satırları toplar.
 *
 * Dolu bir sayfa (tam SUPABASE_PAGE_SIZE satır) daha fazla veri olabileceği
 * anlamına gelir; eksik dolu bir sayfa son sayfadır. Bu yüzden satır sayısı
 * tam sayfa boyutunun katıysa bir ek (muhtemelen boş) istek yapılır — bu,
 * fazladan tek bir istek karşılığında doğruluğu garanti eder.
 *
 * ÖNEMLİ: `fetchPage` içindeki sorgunun TOPLAM SIRALAMASI KARARLI olmalıdır.
 * Sıralama anahtarı benzersiz değilse (ör. yalnızca `created_at`), veritabanı
 * eşit değerli satırları sayfalar arasında farklı sırada döndürebilir ve
 * satırlar kaybolabilir veya tekrarlanabilir. Bu yüzden çağıranlar `id` gibi
 * benzersiz bir sütunu son sıralama anahtarı olarak eklemelidir.
 */
export async function fetchAllRows<Row>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<Row>>,
  mapError: (error: { code?: string; message: string }) => Error = (error) => new Error(error.message),
): Promise<Row[]> {
  const rows: Row[] = []

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * SUPABASE_PAGE_SIZE
    const { data, error } = await fetchPage(from, from + SUPABASE_PAGE_SIZE - 1)
    if (error) throw mapError(error)

    const pageRows = data ?? []
    rows.push(...pageRows)
    if (pageRows.length < SUPABASE_PAGE_SIZE) return rows
  }

  throw new Error(
    `Sayfalama sınırına ulaşıldı (${MAX_PAGES * SUPABASE_PAGE_SIZE} satır). Veri eksik gösterilmemesi için işlem durduruldu.`,
  )
}
