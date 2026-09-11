import type { CabaMatch } from '../services/cabaLookup'
import { aisleOf, compareAddresses } from './addressFormat'

// CABA sonucunu toplama listesine çevirir: her (ürün × konum) bir satır,
// satırlar depo rotası sırasında (koridor → raf → kat), koridorlara göre
// gruplu. Toplayıcı listeyi baştan sona tek turda yürür, geri dönmez.
//
// Saf modül: Supabase'e dokunmaz (CabaMatch yalnızca tip olarak geliyor).

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

export function buildPickList(matches: CabaMatch[]): { rows: PickRow[]; groups: PickGroup[] } {
  const rows = matches
    .flatMap((match) => match.addresses.map((address) => ({
      key: address.id,
      aisle: aisleOf(address.address),
      address: address.address,
      cartonCount: address.cartonCount,
      stockCode: match.product.stockCode,
      stockName: match.product.stockName,
      cabaQuantity: match.cabaQuantity,
      locationCount: match.addresses.length,
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
