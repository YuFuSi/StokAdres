import { supabase } from '../lib/supabase'
import type { OperationImportRow } from './operationImportService'

// CABA adres bulma — uygulamanın asıl günlük işi.
//
// Akış: depo çalışanı Harun abiye liste getirir → listedeki fiş CABA'da aranıp
// Excel alınır → buraya yapıştırılır → adresler ekranda çıkar ve yazdırılır.
//
// Bu servis yalnızca OKUR. Hiçbir kayıt oluşturmaz, güncellemez, silmez.

export type CabaMatch = {
  rowNumber: number
  stockCode: string
  cabaQuantity: string
  product: { id: string; stockCode: string; stockName: string }
  addresses: Array<{ id: string; address: string; cartonCount: number }>
}

export type CabaMiss = {
  rowNumber: number
  stockCode: string
  cabaQuantity: string
  /** 'no-product': stok kodu hiç kayıtlı değil · 'no-address': ürün var ama adresi yok */
  reason: 'no-product' | 'no-address'
  productName?: string
}

export type CabaLookupResult = {
  matches: CabaMatch[]
  misses: CabaMiss[]
  /** Dosyada/yapıştırmada stok kodu boş olan satır sayısı. */
  skippedRows: number
  /** Aynı stok kodu birden fazla satırda geçtiyse, tekrar sayısı. */
  duplicateRows: number
}

// PostgREST `in.(...)` filtresini URL'de taşır. Çok uzun URL'ler proxy
// tarafından reddedilir, bu yüzden sorgular parçalara bölünüyor. 200, uzun
// stok kodlarında bile güvenli tarafta kalıyor.
const LOOKUP_CHUNK_SIZE = 200

/**
 * Stok kodunu veritabanındaki `stock_code_normalized` kolonuyla aynı kurala
 * göre normalize eder (20260910000300 migration'ı: `lower(trim(stock_code))`).
 *
 * DİKKAT — burada bilerek `toLocaleLowerCase('tr-TR')` KULLANILMIYOR.
 * Veritabanı collation'ı en_US.UTF-8 ve Postgres `lower('IĞNE')` → `'iğne'`
 * (noktalı i) üretiyor. JavaScript'in Türkçe locale'i ise `'ığne'` (noktasız)
 * üretir; bu değer hiçbir zaman eşleşmez ve hata da vermez — sonuç sessizce
 * "bulunamadı" olur. Düz `toLowerCase()` Postgres ile birebir aynı sonucu verir
 * (canlıda doğrulandı).
 *
 * Bugün hiçbir stok kodu I/İ içermiyor, ama 100.000 ürün yüklenecek ve Türkçe
 * kodlarda "I" yaygın (IVORY, ISI, IC...). Bu yüzden şimdiden doğru kural.
 */
export function normalizeStockCode(code: string): string {
  return code.trim().toLowerCase()
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

/**
 * Ayrıştırılmış CABA satırlarını depodaki ürün ve adres kayıtlarıyla eşleştirir.
 *
 * İki aşamalı ve toplu: önce stok kodlarından ürünler, sonra ürün id'lerinden
 * aktif adresler. Satır başına sorgu atmak yerine parça başına tek sorgu —
 * 500 satırlık bir fişte 500 değil ~6 istek.
 */
export async function lookupCabaAddresses(rows: OperationImportRow[]): Promise<CabaLookupResult> {
  const usable = rows.filter((row) => row.stockCode.trim() !== '')
  const skippedRows = rows.length - usable.length

  // Aynı kod birden fazla satırdaysa ilk satır temsil eder; sorgu tekilleştirilir.
  const firstRowByCode = new Map<string, OperationImportRow>()
  let duplicateRows = 0
  for (const row of usable) {
    const key = normalizeStockCode(row.stockCode)
    if (firstRowByCode.has(key)) duplicateRows += 1
    else firstRowByCode.set(key, row)
  }

  const normalizedCodes = [...firstRowByCode.keys()]
  if (normalizedCodes.length === 0) {
    return { matches: [], misses: [], skippedRows, duplicateRows }
  }

  // 1) Kodlardan ürünler
  type ProductRow = { id: string; stock_code: string; stock_name: string; stock_code_normalized: string }
  const productByCode = new Map<string, ProductRow>()
  for (const codeChunk of chunk(normalizedCodes, LOOKUP_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('products_with_metrics')
      .select('id, stock_code, stock_name, stock_code_normalized')
      .in('stock_code_normalized', codeChunk)
    if (error) throw new Error(`Ürünler aranırken hata: ${error.message}`)
    for (const row of (data ?? []) as unknown as ProductRow[]) {
      productByCode.set(row.stock_code_normalized, row)
    }
  }

  // 2) Ürün id'lerinden aktif adresler
  type AddressRow = { id: string; product_id: string; address: string; carton_count: number }
  const addressesByProductId = new Map<string, AddressRow[]>()
  const productIds = [...productByCode.values()].map((product) => product.id)
  for (const idChunk of chunk(productIds, LOOKUP_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('address_records')
      .select('id, product_id, address, carton_count')
      .in('product_id', idChunk)
      .eq('is_active', true)
      .order('address')
    if (error) throw new Error(`Adresler aranırken hata: ${error.message}`)
    for (const row of (data ?? []) as unknown as AddressRow[]) {
      const list = addressesByProductId.get(row.product_id)
      if (list) list.push(row)
      else addressesByProductId.set(row.product_id, [row])
    }
  }

  // 3) Sonucu dosyadaki satır sırasına göre kur
  const matches: CabaMatch[] = []
  const misses: CabaMiss[] = []

  for (const [normalizedCode, row] of firstRowByCode) {
    const product = productByCode.get(normalizedCode)
    if (!product) {
      misses.push({ rowNumber: row.rowNumber, stockCode: row.stockCode, cabaQuantity: row.cabaQuantity, reason: 'no-product' })
      continue
    }
    const addresses = addressesByProductId.get(product.id) ?? []
    if (addresses.length === 0) {
      misses.push({
        rowNumber: row.rowNumber,
        stockCode: row.stockCode,
        cabaQuantity: row.cabaQuantity,
        reason: 'no-address',
        productName: product.stock_name,
      })
      continue
    }
    matches.push({
      rowNumber: row.rowNumber,
      stockCode: row.stockCode,
      cabaQuantity: row.cabaQuantity,
      product: { id: product.id, stockCode: product.stock_code, stockName: product.stock_name },
      addresses: addresses.map((address) => ({ id: address.id, address: address.address, cartonCount: address.carton_count })),
    })
  }

  const byRowNumber = (left: { rowNumber: number }, right: { rowNumber: number }) => left.rowNumber - right.rowNumber
  matches.sort(byRowNumber)
  misses.sort(byRowNumber)

  return { matches, misses, skippedRows, duplicateRows }
}
