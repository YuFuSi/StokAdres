import type { Product } from '../types/product'
import { getLocalStorage } from '../data/localStorage'

export const RECENT_SEARCHES_STORAGE_KEY = 'stokadres-recent-searches-v1'
export const RECENT_VIEWED_STORAGE_KEY = 'stokadres-recent-viewed-v1'
const MAX_RECENT_PRODUCTS = 8

type RecentProduct = Pick<Product, 'id' | 'stockCode' | 'stockName' | 'barcode'>

export function loadRecentSearches(): Product[] {
  return loadRecentProducts(RECENT_SEARCHES_STORAGE_KEY)
}

export function loadRecentViewed(): Product[] {
  return loadRecentProducts(RECENT_VIEWED_STORAGE_KEY)
}

export function recordRecentSearch(product: Product): Product[] {
  return recordRecentProduct(RECENT_SEARCHES_STORAGE_KEY, product)
}

export function recordRecentViewed(product: Product): Product[] {
  return recordRecentProduct(RECENT_VIEWED_STORAGE_KEY, product)
}

function loadRecentProducts(key: string): Product[] {
  const storage = getLocalStorage()
  if (!storage) return []

  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? 'null')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRecentProduct).slice(0, MAX_RECENT_PRODUCTS)
  } catch {
    return []
  }
}

function recordRecentProduct(key: string, product: Product): Product[] {
  const snapshot: RecentProduct = {
    id: product.id,
    stockCode: product.stockCode,
    stockName: product.stockName,
    ...(product.barcode ? { barcode: product.barcode } : {}),
  }
  const next = [snapshot, ...loadRecentProducts(key).filter((item) => item.id !== product.id)]
    .slice(0, MAX_RECENT_PRODUCTS)

  const storage = getLocalStorage()
  try {
    storage?.setItem(key, JSON.stringify(next))
  } catch {
    // Recent-item persistence is optional and must not interrupt the workflow.
  }
  return next
}

function isRecentProduct(value: unknown): value is Product {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string'
    && typeof item.stockCode === 'string'
    && typeof item.stockName === 'string'
    && (item.barcode === undefined || typeof item.barcode === 'string')
}
