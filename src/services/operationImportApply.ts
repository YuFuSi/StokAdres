import { supabase } from '../lib/supabase'
import { validateOperationRow, type ImportOperation, type OperationImportRow } from './operationImportService'
import {
  findActiveAddresses,
  findProductIdsByBarcodes,
  findProductsByStockCodes,
  normalizeAddress,
  normalizeStockCode,
  type AddressLite,
  type ProductLite,
} from './productLookup'

// İçe aktarmanın çekirdeği: önizleme ve toplu yazma.
//
// Kullanıcının gerçek akışı: depoda kâğıda yaz → Gemini ile Excel'e çevir →
// buraya yapıştır → HATALARI DÜZELT → uygula. Yani önizleme ve satır bazlı hata
// raporu bu akışın süsü değil çekirdeği; düzeltme adımı burada yaşıyor.

export type PreviewStatus =
  | 'ready'      // yazılacak
  | 'update'     // mevcut kayıt güncellenecek (eski → yeni)
  | 'unchanged'  // zaten aynı, atlanacak
  | 'missing'    // ilgili ürün kayıtlı değil
  | 'invalid'    // satır kendi içinde hatalı

export type PreviewRow = {
  rowNumber: number
  stockCode: string
  stockName: string
  barcode: string
  address: string
  cartonCount: number | null
  /**
   * Kullanıcının yazdığı ham koli metni. cartonCount sayıya çevrilemediğinde
   * (ör. "abc") null olur; ham metin olmadan hücrede "NaN" görünür ve kullanıcı
   * neyi düzelteceğini göremez. Düzeltme bu ekranın çekirdeği olduğu için
   * girilen değer olduğu gibi saklanıyor.
   */
  cartonText: string
  status: PreviewStatus
  detail: string
  product?: ProductLite
  /** 'addresses' işleminde mevcut kayıt varsa: eski koli sayısı. */
  existingRecord?: { id: string; cartonCount: number }
}

export type ApplyOutcome = {
  applied: number
  failed: Array<{ rowNumber: number; stockCode: string; message: string }>
  aborted: boolean
}

export type ApplyOptions = {
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

// Tek istekte yazılacak satır sayısı. Supabase dizi insert'ini tek sorguya
// çeviriyor; 500 satır = 1 istek. Eskiden satır başına 1-4 istek atılıyordu.
const WRITE_BATCH_SIZE = 500

class AbortedError extends Error {}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new AbortedError()
}

// ---------------------------------------------------------------- ÖNİZLEME

/**
 * Satırları depodaki mevcut kayıtlarla karşılaştırıp ne olacağını gösterir.
 * Hiçbir şey yazmaz.
 *
 * Tüm ürün/adres tablosunu çekmez — yalnızca listede geçen stok kodlarını
 * arar (productLookup, parçalı). 100k ürün olsa da maliyeti listenin boyutuyla
 * orantılı kalır.
 */
export async function buildPreview(operation: ImportOperation, rows: OperationImportRow[]): Promise<PreviewRow[]> {
  const products = await findProductsByStockCodes(rows.map((row) => row.stockCode))

  // Adres işleminde mevcut adres kayıtları da gerekli (eski → yeni gösterimi).
  let addressesByProductId = new Map<string, AddressLite[]>()
  if (operation === 'addresses') {
    addressesByProductId = await findActiveAddresses([...products.values()].map((product) => product.id))
  }

  // Barkod işleminde barkodun başka üründe kayıtlı olup olmadığı gerekli.
  let barcodeOwner = new Map<string, string>()
  if (operation === 'barcodes' || operation === 'stocks') {
    barcodeOwner = await findProductIdsByBarcodes(rows.map((row) => row.barcode))
  }

  const seenCodes = new Set<string>()
  const seenBarcodes = new Set<string>()

  return rows.map((row) => {
    const base = {
      rowNumber: row.rowNumber,
      stockCode: row.stockCode,
      stockName: row.stockName,
      barcode: row.barcode,
      address: row.address,
      cartonCount: row.cartonCount,
      cartonText: row.cabaQuantity,
    }

    const errors = validateOperationRow(operation, row)
    const normalizedCode = normalizeStockCode(row.stockCode)
    const normalizedBarcode = row.barcode.trim().toLowerCase()

    // Dosya içi tekrarlar
    if (operation === 'stocks' && normalizedCode && seenCodes.has(normalizedCode)) {
      errors.push('Listede bu stok kodu tekrar ediyor.')
    }
    if (normalizedCode) seenCodes.add(normalizedCode)
    if (normalizedBarcode) {
      if (seenBarcodes.has(normalizedBarcode)) errors.push('Listede bu barkod tekrar ediyor.')
      seenBarcodes.add(normalizedBarcode)
    }

    if (errors.length) return { ...base, status: 'invalid' as const, detail: errors.join(' ') }

    const product = products.get(normalizedCode)

    if (operation === 'stocks') {
      if (product) return { ...base, product, status: 'unchanged' as const, detail: 'Bu stok kodu zaten kayıtlı' }
      if (normalizedBarcode && barcodeOwner.has(normalizedBarcode)) {
        return { ...base, status: 'invalid' as const, detail: 'Bu barkod başka bir üründe kayıtlı' }
      }
      return { ...base, status: 'ready' as const, detail: 'Yeni stok' }
    }

    if (!product) return { ...base, status: 'missing' as const, detail: 'Bu stok kodu kayıtlı değil' }

    if (operation === 'names') {
      if (product.stockName === row.stockName) return { ...base, product, status: 'unchanged' as const, detail: 'Stok adı zaten aynı' }
      return { ...base, product, status: 'update' as const, detail: `${product.stockName} → ${row.stockName}` }
    }

    if (operation === 'barcodes') {
      const owner = barcodeOwner.get(normalizedBarcode)
      if (owner === product.id) return { ...base, product, status: 'unchanged' as const, detail: 'Bu barkod zaten bu üründe' }
      if (owner) return { ...base, product, status: 'invalid' as const, detail: 'Bu barkod başka bir üründe kayıtlı' }
      return { ...base, product, status: 'ready' as const, detail: 'Barkod eklenecek' }
    }

    // operation === 'addresses'
    const existing = (addressesByProductId.get(product.id) ?? [])
      .find((record) => normalizeAddress(record.address) === normalizeAddress(row.address))

    if (!existing) return { ...base, product, status: 'ready' as const, detail: 'Yeni adres' }
    if (existing.cartonCount === row.cartonCount) {
      return { ...base, product, existingRecord: { id: existing.id, cartonCount: existing.cartonCount }, status: 'unchanged' as const, detail: 'Koli sayısı zaten aynı' }
    }
    // Koli sayısı farklı: sessizce ezmek yerine eski → yeni gösteriliyor.
    return {
      ...base,
      product,
      existingRecord: { id: existing.id, cartonCount: existing.cartonCount },
      status: 'update' as const,
      detail: `${existing.cartonCount} → ${row.cartonCount}`,
    }
  })
}

// ---------------------------------------------------------------- UYGULAMA

/**
 * Seçili satırları yazar. Her satırın sonucu ayrı raporlanır; bir satır
 * patladığında geri kalanlar durmaz.
 *
 * Eskiden tek `try` tüm döngüyü sarıyordu: ilk hata her şeyi durduruyor, o ana
 * kadar yazılanlar kalıcı oluyor ama kullanıcıya ne yazıldığı söylenmiyordu.
 */
export async function applyRows(
  operation: ImportOperation,
  rows: PreviewRow[],
  options: ApplyOptions = {},
): Promise<ApplyOutcome> {
  const outcome: ApplyOutcome = { applied: 0, failed: [], aborted: false }
  const total = rows.length
  let done = 0
  const advance = (count: number) => {
    done += count
    options.onProgress?.(done, total)
  }

  try {
    if (operation === 'stocks') await applyNewProducts(rows, outcome, advance, options.signal)
    else if (operation === 'barcodes') await applyNewBarcodes(rows, outcome, advance, options.signal)
    else if (operation === 'addresses') await applyAddresses(rows, outcome, advance, options.signal)
    else await applyNameUpdates(rows, outcome, advance, options.signal)
  } catch (error) {
    if (error instanceof AbortedError) outcome.aborted = true
    else throw error
  }

  return outcome
}

async function applyNewProducts(
  rows: PreviewRow[],
  outcome: ApplyOutcome,
  advance: (count: number) => void,
  signal?: AbortSignal,
) {
  for (const batch of toBatches(rows)) {
    throwIfAborted(signal)
    const { error } = await supabase
      .from('products')
      .insert(batch.map((row) => ({ stock_code: row.stockCode.trim(), stock_name: row.stockName.trim() })))
    if (error) {
      await retryIndividually(batch, outcome, async (row) => {
        const { error: rowError } = await supabase
          .from('products')
          .insert({ stock_code: row.stockCode.trim(), stock_name: row.stockName.trim() })
        if (rowError) throw new Error(rowError.message)
      })
    } else {
      outcome.applied += batch.length
    }
    advance(batch.length)
  }

  // Barkodlar ürünler yazıldıktan sonra, id eşleştirilerek.
  const withBarcode = rows.filter((row) => row.barcode.trim())
  if (withBarcode.length === 0) return
  throwIfAborted(signal)

  const products = await findProductsByStockCodes(withBarcode.map((row) => row.stockCode))
  const pairs = withBarcode
    .map((row) => ({ row, productId: products.get(normalizeStockCode(row.stockCode))?.id }))
    .filter((pair): pair is { row: PreviewRow; productId: string } => Boolean(pair.productId))

  for (const batch of toBatches(pairs.map((pair) => pair.row))) {
    throwIfAborted(signal)
    const productIdByRow = new Map(pairs.map((pair) => [pair.row.rowNumber, pair.productId]))
    const { error } = await supabase
      .from('product_barcodes')
      .insert(batch.map((row) => ({ product_id: productIdByRow.get(row.rowNumber)!, barcode: row.barcode.trim() })))
    if (error) {
      // Ürünler yazıldı ama barkod yazılamadı: ürün kaybolmaz, yalnızca barkodu
      // eksik kalır. Kullanıcıya satır bazında bildiriliyor.
      for (const row of batch) {
        outcome.failed.push({ rowNumber: row.rowNumber, stockCode: row.stockCode, message: `Ürün yazıldı, barkod yazılamadı: ${error.message}` })
      }
    }
  }
}

async function applyNewBarcodes(
  rows: PreviewRow[],
  outcome: ApplyOutcome,
  advance: (count: number) => void,
  signal?: AbortSignal,
) {
  for (const batch of toBatches(rows)) {
    throwIfAborted(signal)
    const { error } = await supabase
      .from('product_barcodes')
      .insert(batch.map((row) => ({ product_id: row.product!.id, barcode: row.barcode.trim() })))
    if (error) {
      await retryIndividually(batch, outcome, async (row) => {
        const { error: rowError } = await supabase
          .from('product_barcodes')
          .insert({ product_id: row.product!.id, barcode: row.barcode.trim() })
        if (rowError) throw new Error(rowError.message)
      })
    } else {
      outcome.applied += batch.length
    }
    advance(batch.length)
  }
}

async function applyAddresses(
  rows: PreviewRow[],
  outcome: ApplyOutcome,
  advance: (count: number) => void,
  signal?: AbortSignal,
) {
  // Yeni adresler toplu yazılabilir; mevcut kayıtların koli güncellemesi satır
  // bazında gider, çünkü her satırın değeri farklı.
  const newRows = rows.filter((row) => !row.existingRecord)
  const updateRows = rows.filter((row) => row.existingRecord)

  for (const batch of toBatches(newRows)) {
    throwIfAborted(signal)
    const { error } = await supabase
      .from('address_records')
      .insert(batch.map((row) => ({ product_id: row.product!.id, address: row.address.trim(), carton_count: row.cartonCount! })))
    if (error) {
      await retryIndividually(batch, outcome, async (row) => {
        const { error: rowError } = await supabase
          .from('address_records')
          .insert({ product_id: row.product!.id, address: row.address.trim(), carton_count: row.cartonCount! })
        if (rowError) throw new Error(rowError.message)
      })
    } else {
      outcome.applied += batch.length
    }
    advance(batch.length)
  }

  for (const row of updateRows) {
    throwIfAborted(signal)
    const { error } = await supabase
      .from('address_records')
      .update({ carton_count: row.cartonCount! })
      .eq('id', row.existingRecord!.id)
    if (error) outcome.failed.push({ rowNumber: row.rowNumber, stockCode: row.stockCode, message: error.message })
    else outcome.applied += 1
    advance(1)
  }
}

async function applyNameUpdates(
  rows: PreviewRow[],
  outcome: ApplyOutcome,
  advance: (count: number) => void,
  signal?: AbortSignal,
) {
  for (const row of rows) {
    throwIfAborted(signal)
    const { error } = await supabase.from('products').update({ stock_name: row.stockName.trim() }).eq('id', row.product!.id)
    if (error) outcome.failed.push({ rowNumber: row.rowNumber, stockCode: row.stockCode, message: error.message })
    else outcome.applied += 1
    advance(1)
  }
}

function toBatches(rows: PreviewRow[]): PreviewRow[][] {
  const batches: PreviewRow[][] = []
  for (let index = 0; index < rows.length; index += WRITE_BATCH_SIZE) {
    batches.push(rows.slice(index, index + WRITE_BATCH_SIZE))
  }
  return batches
}

/**
 * Toplu yazma reddedilirse satırları tek tek dener. Amaç: tek bozuk satır
 * yüzünden 499 sağlam satırın "başarısız" sayılmaması.
 */
async function retryIndividually(
  batch: PreviewRow[],
  outcome: ApplyOutcome,
  write: (row: PreviewRow) => Promise<void>,
) {
  for (const row of batch) {
    try {
      await write(row)
      outcome.applied += 1
    } catch (error) {
      outcome.failed.push({
        rowNumber: row.rowNumber,
        stockCode: row.stockCode,
        message: error instanceof Error ? error.message : 'Bilinmeyen hata',
      })
    }
  }
}
