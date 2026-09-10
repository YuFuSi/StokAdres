import { supabase } from '../lib/supabase'
import { addressRecordService } from '../data/localData'
import type { AddressRecord } from '../types/addressRecord'

// Genel Bakış sayaçları eskiden tüm ürünleri VE tüm adres kayıtlarını çekip
// JavaScript'te sayıyordu — dört sayı için 1.677 üründe ~487 KB, 100.000 üründe
// ~27 MB. Artık `dashboard_summary` view'ı (20260910000200) dördünü tek satırda
// döndürüyor; "son eklenenler" de yalnızca 5 satır çekiyor.

export type DashboardData = {
  totalStocks: number
  totalCartons: number
  productsWithAddress: number
  productsWithoutAddress: number
  activeAddressRecords: number
  recentRecords: AddressRecord[]
}

type DashboardSummaryRow = {
  total_products: number
  active_address_records: number
  total_cartons: number
  products_with_address: number
}

const RECENT_RECORD_COUNT = 5

export async function getDashboardData(): Promise<DashboardData> {
  const [summaryResult, recentRecords] = await Promise.all([
    supabase.from('dashboard_summary').select('*').single(),
    addressRecordService.listRecent(RECENT_RECORD_COUNT),
  ])

  if (summaryResult.error) throw new Error(summaryResult.error.message)
  const summary = summaryResult.data as unknown as DashboardSummaryRow

  const totalStocks = summary.total_products ?? 0
  const productsWithAddress = summary.products_with_address ?? 0

  return {
    totalStocks,
    totalCartons: summary.total_cartons ?? 0,
    productsWithAddress,
    // Ürün başına adres olup olmadığını ayrıca saymak yerine çıkarma yapılıyor:
    // iki sayı da aynı view satırından geldiği için tutarlılıkları garanti.
    productsWithoutAddress: totalStocks - productsWithAddress,
    activeAddressRecords: summary.active_address_records ?? 0,
    recentRecords,
  }
}
