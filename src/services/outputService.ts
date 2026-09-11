import { supabase } from '../lib/supabase'
import { fetchAllRows } from '../lib/pagination'
import type { AddressRange } from '../lib/addressRange'
import type { OutputItem } from '../lib/pickList'
import type { CabaMiss } from './cabaLookup'
import { findActiveAddresses, type ProductLite } from './productLookup'

// Çıktı Al ekranının CABA dışındaki iki kaynağı. İkisi de yalnızca OKUR.
// CABA fişi kaynağı cabaLookup.ts'te.

export type AisleOption = { aisle: string; addressCount: number }

/** Adres aralığı sekmesindeki hızlı koridor seçimi. */
export async function listAisles(): Promise<AisleOption[]> {
  const { data, error } = await supabase.from('address_aisle_summary').select('aisle, address_count').order('aisle')
  if (error) throw new Error(`Koridorlar okunamadı: ${error.message}`)
  return (data ?? []).flatMap((row) => row.aisle ? [{ aisle: row.aisle, addressCount: row.address_count ?? 0 }] : [])
}

/**
 * Aralıktaki aktif adresler, ürün bazında gruplu. Sıralama sunucuda
 * (rota anahtarı, stok kodu, id) — sayfalar arası kararlı, fetchAllRows için
 * gerekli. Bir aralık bütün bir koridor olabilir; 1000 satır sınırına takılmasın
 * diye sayfalı çekiliyor.
 */
export async function findAddressesInRange(range: AddressRange, onProgress?: (loaded: number) => void): Promise<OutputItem[]> {
  const rows = await fetchAllRows(
    (from, to) => supabase.rpc('list_addresses_in_range', { p_from_key: range.fromKey, p_to_key: range.toKey }).range(from, to),
    (error) => new Error(`Aralıktaki adresler okunamadı: ${error.message}`),
    onProgress,
  )

  const byProduct = new Map<string, OutputItem>()
  for (const row of rows) {
    const item = byProduct.get(row.product_id)
    const address = { id: row.id, address: row.address, cartonCount: row.carton_count }
    if (item) item.addresses.push(address)
    else byProduct.set(row.product_id, { product: { id: row.product_id, stockCode: row.stock_code, stockName: row.stock_name }, addresses: [address] })
  }
  return [...byProduct.values()]
}

/** Aranıp seçilen ürünlerin tüm aktif adresleri; adresi olmayanlar ayrı listede. */
export async function findAddressesForProducts(products: ProductLite[]): Promise<{ items: OutputItem[]; misses: CabaMiss[] }> {
  const addresses = await findActiveAddresses(products.map((product) => product.id))
  const items: OutputItem[] = []
  const misses: CabaMiss[] = []
  products.forEach((product, index) => {
    const productAddresses = addresses.get(product.id) ?? []
    if (productAddresses.length > 0) {
      items.push({ product: { id: product.id, stockCode: product.stockCode, stockName: product.stockName }, addresses: productAddresses })
    } else {
      misses.push({ rowNumber: index + 1, stockCode: product.stockCode, cabaQuantity: '', reason: 'no-address', productName: product.stockName })
    }
  })
  return { items, misses }
}
