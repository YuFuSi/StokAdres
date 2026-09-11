import { supabase } from '../lib/supabase'
import { addressRecordService } from '../data/localData'
import type { AddressRecord } from '../types/addressRecord'
import type { DailyActivity } from '../lib/activitySeries'

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
  /** Koridor başına aktif konum (address_aisle_summary), koridor sırasında. */
  aisles: AisleSummary[]
  /** Yalnızca kayıt eklenen günler (address_daily_activity, son 31 gün). */
  dailyActivity: DailyActivity[]
}

export type AisleSummary = {
  aisle: string
  addressCount: number
  productCount: number
  cartonCount: number
  rackCount: number
}

type DashboardSummaryRow = {
  total_products: number
  active_address_records: number
  total_cartons: number
  products_with_address: number
}

const RECENT_RECORD_COUNT = 5

export async function getDashboardData(): Promise<DashboardData> {
  const [summaryResult, recentRecords, aisleResult, activityResult] = await Promise.all([
    supabase.from('dashboard_summary').select('*').single(),
    addressRecordService.listRecent(RECENT_RECORD_COUNT),
    supabase.from('address_aisle_summary').select('*').order('aisle'),
    supabase.from('address_daily_activity').select('day, created_count').order('day', { ascending: false }).limit(31),
  ])

  if (summaryResult.error) throw new Error(summaryResult.error.message)
  if (aisleResult.error) throw new Error(aisleResult.error.message)
  if (activityResult.error) throw new Error(activityResult.error.message)
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
    aisles: (aisleResult.data ?? []).flatMap((row) => row.aisle ? [{
      aisle: row.aisle,
      addressCount: row.address_count ?? 0,
      productCount: row.product_count ?? 0,
      cartonCount: row.carton_count ?? 0,
      rackCount: row.rack_count ?? 0,
    }] : []),
    dailyActivity: (activityResult.data ?? []).flatMap((row) => row.day ? [{ day: row.day, createdCount: row.created_count ?? 0 }] : []),
  }
}
