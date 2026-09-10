import { supabase } from '../lib/supabase'

// Bir liste (CABA fişi, Gemini çıktısı, Excel içe aktarma) içindeki stok
// kodlarını depodaki kayıtlarla eşleştirmek için ortak arama katmanı.
//
// Neden ayrı bir modül: hem CABA adres bulma hem içe aktarma önizlemesi aynı
// işi yapıyor. Eskiden içe aktarma önizlemesi TÜM ürünleri ve TÜM adres
// kayıtlarını çekip istemcide eşleştiriyordu — 100k ölçeğinde kaçındığımız
// şeyin ta kendisi.

export type ProductLite = {
  id: string
  stockCode: string
  stockName: string
}

export type AddressLite = {
  id: string
  address: string
  cartonCount: number
}

// PostgREST `in.(...)` filtresini URL'de taşır; çok uzun URL proxy tarafından
// reddedilir. 200, uzun stok kodlarında bile güvenli tarafta kalıyor.
const LOOKUP_CHUNK_SIZE = 200

/**
 * Stok kodunu veritabanındaki `stock_code_normalized` kolonuyla aynı kurala
 * göre normalize eder (20260910000300: `lower(trim(stock_code))`).
 *
 * DİKKAT — burada bilerek `toLocaleLowerCase('tr-TR')` KULLANILMIYOR.
 * Veritabanı collation'ı en_US.UTF-8 ve Postgres `lower('IĞNE')` → `'iğne'`
 * (noktalı i) üretiyor. JavaScript'in Türkçe locale'i `'ığne'` (noktasız)
 * üretir; bu değer hiçbir zaman eşleşmez ve hata da vermez — sonuç sessizce
 * "bulunamadı" olur. Düz `toLowerCase()` Postgres ile birebir aynı (canlıda
 * doğrulandı).
 */
export function normalizeStockCode(code: string): string {
  return code.trim().toLowerCase()
}

/**
 * Adresi, `idx_address_records_unique_active_address` kısmi unique index'iyle
 * aynı kurala göre normalize eder: `lower(trim(address))`. Aynı Türkçe locale
 * gerekçesi burada da geçerli.
 */
export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase()
}

export function chunk<T>(items: T[], size: number = LOOKUP_CHUNK_SIZE): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

/**
 * Verilen stok kodlarına karşılık gelen ürünleri getirir.
 * Anahtar: normalize edilmiş stok kodu.
 */
export async function findProductsByStockCodes(stockCodes: string[]): Promise<Map<string, ProductLite>> {
  const normalized = [...new Set(stockCodes.map(normalizeStockCode).filter(Boolean))]
  const found = new Map<string, ProductLite>()
  if (normalized.length === 0) return found

  type Row = { id: string; stock_code: string; stock_name: string; stock_code_normalized: string }
  for (const codeChunk of chunk(normalized)) {
    const { data, error } = await supabase
      .from('products_with_metrics')
      .select('id, stock_code, stock_name, stock_code_normalized')
      .in('stock_code_normalized', codeChunk)
    if (error) throw new Error(`Ürünler aranırken hata: ${error.message}`)
    for (const row of (data ?? []) as unknown as Row[]) {
      found.set(row.stock_code_normalized, { id: row.id, stockCode: row.stock_code, stockName: row.stock_name })
    }
  }
  return found
}

/**
 * Verilen ürünlerin aktif adres kayıtlarını getirir.
 * Anahtar: ürün id'si.
 */
export async function findActiveAddresses(productIds: string[]): Promise<Map<string, AddressLite[]>> {
  const unique = [...new Set(productIds)]
  const byProductId = new Map<string, AddressLite[]>()
  if (unique.length === 0) return byProductId

  type Row = { id: string; product_id: string; address: string; carton_count: number }
  for (const idChunk of chunk(unique)) {
    const { data, error } = await supabase
      .from('address_records')
      .select('id, product_id, address, carton_count')
      .in('product_id', idChunk)
      .eq('is_active', true)
      .order('address')
    if (error) throw new Error(`Adresler aranırken hata: ${error.message}`)
    for (const row of (data ?? []) as unknown as Row[]) {
      const entry = { id: row.id, address: row.address, cartonCount: row.carton_count }
      const list = byProductId.get(row.product_id)
      if (list) list.push(entry)
      else byProductId.set(row.product_id, [entry])
    }
  }
  return byProductId
}

/**
 * Verilen ürünlerin barkodlarını getirir. Anahtar: ürün id'si.
 *
 * `listProducts()` de barkodları gömülü döndürür ama bunun için 94.900 ürünün
 * TAMAMINI çekmek gerekir. Elde zaten bir ürün kümesi varken (adres kayıtları,
 * dışa aktarma satırları) yalnızca onların barkodunu istemek doğru olan.
 */
export async function findBarcodesByProductId(productIds: string[]): Promise<Map<string, string[]>> {
  const unique = [...new Set(productIds)].filter(Boolean)
  const byProductId = new Map<string, string[]>()
  if (unique.length === 0) return byProductId

  type Row = { product_id: string; barcode: string }
  for (const idChunk of chunk(unique)) {
    const { data, error } = await supabase
      .from('product_barcodes')
      .select('product_id, barcode')
      .in('product_id', idChunk)
      .order('barcode')
    if (error) throw new Error(`Barkodlar aranırken hata: ${error.message}`)
    for (const row of (data ?? []) as unknown as Row[]) {
      const list = byProductId.get(row.product_id)
      if (list) list.push(row.barcode)
      else byProductId.set(row.product_id, [row.barcode])
    }
  }
  return byProductId
}

/** Verilen barkodların hangi ürüne ait olduğunu getirir. Anahtar: normalize barkod. */
export async function findProductIdsByBarcodes(barcodes: string[]): Promise<Map<string, string>> {
  const normalized = [...new Set(barcodes.map((barcode) => barcode.trim().toLowerCase()).filter(Boolean))]
  const owner = new Map<string, string>()
  if (normalized.length === 0) return owner

  type Row = { product_id: string; barcode: string }
  for (const barcodeChunk of chunk(normalized)) {
    // Barkod unique index'i lower(trim(barcode)) üzerinde, ama kolonun kendisi
    // ham değeri tutuyor; bu yüzden ham değerlerle sorgulanıp sonuç normalize
    // ediliyor.
    const { data, error } = await supabase
      .from('product_barcodes')
      .select('product_id, barcode')
      .in('barcode', barcodeChunk)
    if (error) throw new Error(`Barkodlar aranırken hata: ${error.message}`)
    for (const row of (data ?? []) as unknown as Row[]) {
      owner.set(row.barcode.trim().toLowerCase(), row.product_id)
    }
  }
  return owner
}
