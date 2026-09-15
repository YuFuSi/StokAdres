import type { AddressRecord } from '../types/addressRecord'
import type { Product } from '../types/product'

// Ürün detayındaki sayaçlar. Eskiden burada istemci tarafı filtreleme ve
// sıralama da vardı (filterAndSortProducts); Stoklar ekranı sunucu tarafına
// taşınınca kullanılmaz hale geldi ve silindi (Faz 10.2).

export type ProductMetrics = {
  activeAddressCount: number
  totalCartons: number
}

export function getProductMetrics(product: Product, addressRecords: AddressRecord[]): ProductMetrics {
  const activeRecords = addressRecords.filter(
    (record) => record.isActive && (record.productId === product.id || record.stockCode === product.stockCode),
  )
  return {
    activeAddressCount: activeRecords.length,
    totalCartons: activeRecords.reduce((total, record) => total + record.cartonCount, 0),
  }
}
