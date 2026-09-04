import type { AddressRecord } from '../types/addressRecord'
import type { Product } from '../types/product'

export type ProductFilter = 'all' | 'has-address' | 'multiple-addresses' | 'single-address'
export type ProductSort = 'relevance' | 'stock-name' | 'stock-code' | 'address-count' | 'carton-count'
export type SortDirection = 'asc' | 'desc'

export type ProductMetrics = {
  addressCount: number
  cartonCount: number
}

export function getProductMetrics(product: Product, addressRecords: AddressRecord[]): ProductMetrics {
  const activeRecords = addressRecords.filter(
    (record) => record.isActive && record.stockCode === product.stockCode,
  )

  return {
    addressCount: activeRecords.length,
    cartonCount: activeRecords.reduce((total, record) => total + record.cartonCount, 0),
  }
}

export function filterAndSortProducts(
  products: Product[],
  addressRecords: AddressRecord[],
  filter: ProductFilter,
  sort: ProductSort,
  direction: SortDirection,
): Product[] {
  const filteredProducts = products.filter((product) => {
    const { addressCount } = getProductMetrics(product, addressRecords)
    if (filter === 'has-address') return addressCount > 0
    if (filter === 'multiple-addresses') return addressCount > 1
    if (filter === 'single-address') return addressCount === 1
    return true
  })

  if (sort === 'relevance') return filteredProducts

  return filteredProducts
    .map((product, index) => ({ product, index }))
    .sort((left, right) => {
      const comparison = compareProducts(left.product, right.product, addressRecords, sort)
      return (direction === 'asc' ? comparison : -comparison) || (left.index - right.index)
    })
    .map((item) => item.product)
}

function compareProducts(
  left: Product,
  right: Product,
  addressRecords: AddressRecord[],
  sort: ProductSort,
): number {
  if (sort === 'stock-name') return left.stockName.localeCompare(right.stockName, 'tr-TR')
  if (sort === 'stock-code') return left.stockCode.localeCompare(right.stockCode, 'tr-TR', { numeric: true })

  const leftMetrics = getProductMetrics(left, addressRecords)
  const rightMetrics = getProductMetrics(right, addressRecords)
  const leftValue = sort === 'address-count' ? leftMetrics.addressCount : leftMetrics.cartonCount
  const rightValue = sort === 'address-count' ? rightMetrics.addressCount : rightMetrics.cartonCount

  return leftValue - rightValue
}
