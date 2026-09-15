import { aisleOf, compareAddresses } from './addressFormat'

// Adres çıktısının iki düzeni (Çıktı Al ekranı, CABA fişi / adres aralığı /
// seçili ürünler için ortak):
//
//   Ürüne göre — her ürün tek satır: stok kodu, stok adı, en çok kolili 3
//                adres yan yana, her adresin altında koli. Kalan adresler
//                "+N adres daha" (kâğıt) · Excel'de hepsi. Harun abinin isteği.
//   Rafa göre  — her (ürün × konum) bir satır, depo rotası sırasında
//                (koridor → raf → kat), koridorlara göre gruplu. Toplayıcı
//                listeyi baştan sona tek turda yürür.
//
// Saf modül: Supabase'e dokunmaz.

export type OutputAddress = { id: string; address: string; cartonCount: number }

export type OutputItem = {
  product: { id: string; stockCode: string; stockName: string }
  addresses: OutputAddress[]
  /** Yalnızca CABA fişinden gelen listelerde. */
  cabaQuantity?: string
}

export type OutputLayout = 'product' | 'rack'

// ---------------------------------------------------------------- ürüne göre

/** Kâğıtta ürün başına en fazla bu kadar adres sütunu (Harun abi, 2026-09-14). */
export const PRINTED_ADDRESS_LIMIT = 3

export type ProductGroup = {
  key: string
  stockCode: string
  stockName: string
  cabaQuantity: string
  /** Tüm adresler, en çok koliden aza; eşit kolide rota sırası. */
  addresses: OutputAddress[]
  /** Kâğıda basılan ilk PRINTED_ADDRESS_LIMIT adres. */
  shown: OutputAddress[]
  hiddenCount: number
  totalCartons: number
}

/**
 * Her ürün tek satır: en çok kolisi olan adresleri Adres 1, 2, 3. Ürünler
 * Adres 1'e göre rota sırasında dizilir; toplayıcı kâğıdı yukarıdan aşağı
 * okurken en dolu rafları depo rotasında dolaşır.
 */
export function buildProductList(items: OutputItem[]): ProductGroup[] {
  return items
    .filter((item) => item.addresses.length > 0)
    .map((item) => {
      const addresses = [...item.addresses].sort((left, right) =>
        right.cartonCount - left.cartonCount || compareAddresses(left.address, right.address))
      return {
        key: item.product.id,
        stockCode: item.product.stockCode,
        stockName: item.product.stockName,
        cabaQuantity: item.cabaQuantity ?? '',
        addresses,
        shown: addresses.slice(0, PRINTED_ADDRESS_LIMIT),
        hiddenCount: Math.max(0, addresses.length - PRINTED_ADDRESS_LIMIT),
        totalCartons: addresses.reduce((sum, address) => sum + address.cartonCount, 0),
      }
    })
    .sort((left, right) =>
      compareAddresses(left.addresses[0].address, right.addresses[0].address)
      || left.stockCode.localeCompare(right.stockCode, 'tr-TR'))
}

// ---------------------------------------------------------------- rafa göre

export type PickRow = {
  key: string
  aisle: string | null
  address: string
  cartonCount: number
  stockCode: string
  stockName: string
  cabaQuantity: string
  /** Ürün kaç ayrı konumda: toplayıcı miktarı tek rafta aramasın diye. */
  locationCount: number
}

export type PickGroup = {
  /** null: biçim dışı adresler ("Diğer adresler"), her zaman en sonda. */
  aisle: string | null
  rows: PickRow[]
}

export function buildPickList(items: OutputItem[]): { rows: PickRow[]; groups: PickGroup[] } {
  const rows = items
    .flatMap((item) => item.addresses.map((address) => ({
      key: address.id,
      aisle: aisleOf(address.address),
      address: address.address,
      cartonCount: address.cartonCount,
      stockCode: item.product.stockCode,
      stockName: item.product.stockName,
      cabaQuantity: item.cabaQuantity ?? '',
      locationCount: item.addresses.length,
    })))
    .sort((left, right) => compareAddresses(left.address, right.address) || left.stockCode.localeCompare(right.stockCode, 'tr-TR'))

  // Satırlar zaten sıralı; ardışık aynı koridorlar tek grup olur.
  const groups: PickGroup[] = []
  for (const row of rows) {
    const last = groups[groups.length - 1]
    if (last && last.aisle === row.aisle) last.rows.push(row)
    else groups.push({ aisle: row.aisle, rows: [row] })
  }
  return { rows, groups }
}

/** Özet şeridi için: kaç farklı koridor. */
export function countAisles(items: OutputItem[]): number {
  return new Set(items.flatMap((item) => item.addresses.map((address) => aisleOf(address.address)).filter(Boolean))).size
}
