import { aisleOf, compareAddresses } from './addressFormat'

// Adres çıktısının iki düzeni (Çıktı Al ekranı, CABA fişi / adres aralığı /
// seçili ürünler için ortak):
//
//   Ürüne göre — her ürün bir kez: stok kodu, stok adı, altında adresleri alt
//                alta ve her adresin yanında koli. Harun abinin istediği,
//                Faz 2'deki ilk CABA çıktısının düzeni.
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

export type ProductGroup = {
  key: string
  stockCode: string
  stockName: string
  cabaQuantity: string
  /** Rota sırasında. */
  addresses: OutputAddress[]
  totalCartons: number
}

/**
 * Ürünler en önde gelen adreslerine göre rota sırasında dizilir: toplayıcı
 * kâğıdı yukarıdan aşağı okurken yine depoyu baştan sona dolaşır.
 */
export function buildProductList(items: OutputItem[]): ProductGroup[] {
  return items
    .filter((item) => item.addresses.length > 0)
    .map((item) => {
      const addresses = [...item.addresses].sort((left, right) => compareAddresses(left.address, right.address))
      return {
        key: item.product.id,
        stockCode: item.product.stockCode,
        stockName: item.product.stockName,
        cabaQuantity: item.cabaQuantity ?? '',
        addresses,
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
