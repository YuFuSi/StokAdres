import { addressRecordService } from '../data/localData'
import type { AddressRecord } from '../types/addressRecord'

export type DashboardData = {
  totalStocks: number
  totalActiveAddresses: number
  stocksWithMultipleAddresses: number
  totalActiveRecords: number
  recentRecords: AddressRecord[]
}

export async function getDashboardData(): Promise<DashboardData> {
  const [records, products] = await Promise.all([
    addressRecordService.list(),
    addressRecordService.listProducts(),
  ])
  const activeRecords = records.filter((record) => record.isActive)
  const addressesByStock = new Map<string, number>()

  activeRecords.forEach((record) => {
    addressesByStock.set(record.stockCode, (addressesByStock.get(record.stockCode) ?? 0) + 1)
  })

  return {
    totalStocks: products.length,
    totalActiveAddresses: activeRecords.length,
    stocksWithMultipleAddresses: [...addressesByStock.values()].filter((count) => count > 1).length,
    totalActiveRecords: activeRecords.length,
    recentRecords: [...records]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 5),
  }
}