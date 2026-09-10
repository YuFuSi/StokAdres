import type { OperationImportRow } from './operationImportService'
import { findActiveAddresses, findProductsByStockCodes, normalizeStockCode } from './productLookup'

// CABA adres bulma — uygulamanın asıl günlük işi.
//
// Akış: depo çalışanı Harun abiye liste getirir → listedeki fiş CABA'da aranıp
// Excel alınır → buraya yapıştırılır → adresler ekranda çıkar ve yazdırılır.
//
// Bu servis yalnızca OKUR. Hiçbir kayıt oluşturmaz, güncellemez, silmez.
// Parçalı arama mantığı productLookup'ta; içe aktarma önizlemesi de aynı
// katmanı kullanıyor.

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

/**
 * Ayrıştırılmış CABA satırlarını depodaki ürün ve adres kayıtlarıyla eşleştirir.
 * Satır başına sorgu atmaz: kodlar tekilleştirilip parçalar halinde aranır,
 * 500 satırlık bir fişte 500 değil ~6 istek olur.
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

  if (firstRowByCode.size === 0) {
    return { matches: [], misses: [], skippedRows, duplicateRows }
  }

  const products = await findProductsByStockCodes([...firstRowByCode.keys()])
  const addresses = await findActiveAddresses([...products.values()].map((product) => product.id))

  const matches: CabaMatch[] = []
  const misses: CabaMiss[] = []

  for (const [normalizedCode, row] of firstRowByCode) {
    const product = products.get(normalizedCode)
    if (!product) {
      misses.push({ rowNumber: row.rowNumber, stockCode: row.stockCode, cabaQuantity: row.cabaQuantity, reason: 'no-product' })
      continue
    }
    const productAddresses = addresses.get(product.id) ?? []
    if (productAddresses.length === 0) {
      misses.push({
        rowNumber: row.rowNumber,
        stockCode: row.stockCode,
        cabaQuantity: row.cabaQuantity,
        reason: 'no-address',
        productName: product.stockName,
      })
      continue
    }
    matches.push({
      rowNumber: row.rowNumber,
      stockCode: row.stockCode,
      cabaQuantity: row.cabaQuantity,
      product,
      addresses: productAddresses,
    })
  }

  const byRowNumber = (left: { rowNumber: number }, right: { rowNumber: number }) => left.rowNumber - right.rowNumber
  matches.sort(byRowNumber)
  misses.sort(byRowNumber)

  return { matches, misses, skippedRows, duplicateRows }
}
