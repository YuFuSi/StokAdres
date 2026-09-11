import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { fetchAllRows } from '../lib/pagination'
import { getLocalStorage } from '../data/localStorage'

// Tek tıkla tam yedek.
//
// Neden gerekli: veritabanı Supabase'in ÜCRETSİZ planında (2026-09-11,
// get_organization → plan: free). Bu planda otomatik yedek yok ve proje 7 gün
// kullanılmazsa durduruluyor. Bir şey ters giderse elde kalan tek kopya bu
// dosya.
//
// Stoklar, barkodlar ve adres kayıtları TÜM kolonlarıyla yazılır (id'ler dahil;
// geri yüklemede ilişkiler bunlarla kurulur). audit_logs dahil değil: 200k
// satır ve geri yükleme için gerekmiyor.
//
// Uygulama içinde geri yükleme YOK — yıkıcı bir işlem. Kurtarma prosedürü
// scripts/README.md'de.

type ElectronBackupApi = {
  saveBackup?: (fileName: string, content: string) => Promise<{ filePath: string }>
  openBackupFolder?: () => Promise<{ ok: boolean }>
}

const electronApi = () => (window as Window & { electronAPI?: ElectronBackupApi }).electronAPI

export type BackupSummary = {
  products: number
  barcodes: number
  addresses: number
  /** Electron dışında (tarayıcıda) dosya indirilir, yol bilinmez. */
  filePath: string | null
}

export type LastBackup = BackupSummary & { at: string }

const LAST_BACKUP_KEY = 'stokadres-last-backup'

/** Genel Bakış bu kadar günden eski yedekte hatırlatır. */
export const BACKUP_REMINDER_DAYS = 7

export function getLastBackup(): LastBackup | null {
  try {
    const raw = getLocalStorage()?.getItem(LAST_BACKUP_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LastBackup>
    if (typeof parsed.at !== 'string' || Number.isNaN(Date.parse(parsed.at))) return null
    return {
      at: parsed.at,
      filePath: parsed.filePath ?? null,
      products: parsed.products ?? 0,
      barcodes: parsed.barcodes ?? 0,
      addresses: parsed.addresses ?? 0,
    }
  } catch {
    return null
  }
}

export function daysSince(iso: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / 86_400_000))
}

export function canOpenBackupFolder(): boolean {
  return Boolean(electronApi()?.openBackupFolder)
}

export async function openBackupFolder(): Promise<void> {
  await electronApi()?.openBackupFolder?.()
}

export async function createBackup(onProgress?: (message: string) => void): Promise<BackupSummary> {
  const count = (value: number) => value.toLocaleString('tr-TR')

  // Sıralama `id` ile: fetchAllRows sayfalar arası kararlı, benzersiz bir
  // sıralama istiyor (bkz. pagination.ts).
  const products = await fetchAllRows(
    (from, to) => supabase.from('products').select('*').order('id').range(from, to),
    undefined,
    (loaded) => onProgress?.(`Stoklar okunuyor… ${count(loaded)}`),
  )
  const barcodes = await fetchAllRows(
    (from, to) => supabase.from('product_barcodes').select('*').order('id').range(from, to),
    undefined,
    (loaded) => onProgress?.(`Barkodlar okunuyor… ${count(loaded)}`),
  )
  const addresses = await fetchAllRows(
    (from, to) => supabase.from('address_records').select('*').order('id').range(from, to),
    undefined,
    (loaded) => onProgress?.(`Adresler okunuyor… ${count(loaded)}`),
  )

  onProgress?.('Dosya hazırlanıyor…')
  // Durum metninin ekrana çizilmesine fırsat ver: çalışma kitabı üretimi
  // ~200k satırda ana iş parçacığını birkaç saniye meşgul ediyor.
  await new Promise((resolve) => setTimeout(resolve, 50))

  // Barkod ve adres sayfalarında stok kodu ilk kolon: dosya elle okunduğunda
  // uuid'lerden ürün bulmak zorunda kalınmasın.
  const stockCodeById = new Map(products.map((product) => [product.id, product.stock_code]))
  const withStockCode = <Row extends { product_id: string }>(rows: Row[]) =>
    rows.map((row) => ({ stock_code: stockCodeById.get(row.product_id) ?? '', ...row }))

  const createdAt = new Date()
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
    'Yedek tarihi': createdAt.toLocaleString('tr-TR'),
    Stoklar: products.length,
    Barkodlar: barcodes.length,
    Adresler: addresses.length,
    Not: 'Geri yükleme: scripts/README.md → Yedekten kurtarma',
  }]), 'Bilgi')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(products), 'Stoklar')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(withStockCode(barcodes)), 'Barkodlar')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(withStockCode(addresses)), 'Adresler')
  const content = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx', compression: true })

  const fileName = `StokAdres_yedek_${fileStamp(createdAt)}.xlsx`
  let filePath: string | null = null
  const api = electronApi()
  if (api?.saveBackup) {
    filePath = (await api.saveBackup(fileName, content)).filePath
  } else {
    const link = document.createElement('a')
    link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${content}`
    link.download = fileName
    link.click()
  }

  const summary: BackupSummary = { products: products.length, barcodes: barcodes.length, addresses: addresses.length, filePath }
  try {
    getLocalStorage()?.setItem(LAST_BACKUP_KEY, JSON.stringify({ ...summary, at: createdAt.toISOString() }))
  } catch {
    // Hatırlatıcı yalnızca bir kolaylık; kaydedilemezse yedek yine alınmıştır.
  }
  return summary
}

function fileStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`
}
