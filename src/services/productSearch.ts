import type { Product } from '../types/product'
import type { AddressRecord } from '../types/addressRecord'

const normalize = (value: string): string => value.trim().toLocaleLowerCase('tr-TR')

export function searchProducts(
  products: Product[],
  query: string,
  addressRecords: AddressRecord[] = [],
): Product[] {
  const normalizedQuery = normalize(query)

  if (!normalizedQuery) return products

  return products
    .map((product, index) => ({
      product,
      index,
      score: getMatchScore(product, normalizedQuery, addressRecords),
    }))
    .filter((result) => result.score !== null)
    .sort((left, right) => (left.score! - right.score!) || (left.index - right.index))
    .map((result) => result.product)
}

function getMatchScore(
  product: Product,
  query: string,
  addressRecords: AddressRecord[],
): number | null {
  const stockCode = normalize(product.stockCode)
  const stockName = normalize(product.stockName)
  const barcode = product.barcode ? normalize(product.barcode) : ''
  const addresses = addressRecords
    .filter((record) => record.isActive && normalize(record.stockCode) === stockCode)
    .map((record) => normalize(record.address))

  if (stockCode === query) return 0
  if (stockCode.startsWith(query)) return 1
  if (stockCode.includes(query)) return 2
  if (stockName.includes(query)) return 3
  if (barcode.includes(query)) return 4
  if (addresses.some((address) => address.includes(query))) return 5

  return null
}
