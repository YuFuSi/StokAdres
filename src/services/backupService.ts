import { supabase } from '../lib/supabase'
import { fetchAllRows } from '../lib/pagination'
import { getLocalStorage } from '../data/localStorage'
import { createCsvFromRows } from './csvExport'

// Tek tıkla tam yedek.
//
// Neden gerekli: veritabanı Supabase'in ÜCRETSİZ planında (2026-09-11,
// get_organization → plan: free). Bu planda otomatik yedek yok ve proje 7 gün
// kullanılmazsa durduruluyor. Bir şey ters giderse elde kalan tek kopya bu.
//
// Biçim CSV, Excel DEĞİL (2026-09-11 ölçümü, 300 bin ürün = 680 bin satır):
// Excel dosyası 61 sn ve 2,4 GB bellek; uygulama penceresi donuyor. CSV 1 sn.
// Ayrıca CSV'ler Supabase'e doğrudan geri yüklenebiliyor (scripts/README.md).
//
// Stoklar, barkodlar ve adres kayıtları TÜM kolonlarıyla yazılır (id'ler dahil;
// geri yüklemede ilişkiler bunlarla kurulur). audit_logs dahil değil.
// Uygulama içinde geri yükleme YOK — yıkıcı bir işlem.

export type BackupFile = { name: 'bilgi.txt' | 'stoklar.csv' | 'barkodlar.csv' | 'adresler.csv'; content: string }

type ElectronBackupApi = {
  saveBackup?: (folderName: string, files: BackupFile[]) => Promise<{ folderPath: string }>
  openBackupFolder?: () => Promise<{ ok: boolean }>
}

const electronApi = () => (window as Window & { electronAPI?: ElectronBackupApi }).electronAPI

export type BackupSummary = {
  products: number
  barcodes: number
  addresses: number
  /** Yedek klasörü. Electron dışında (tarayıcıda) dosyalar indirilir, yol bilinmez. */
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

/**
 * Supabase satırını CSV hücrelerine çevirir: null boş hücre, jsonb metin.
 * BOM eklenmez — Supabase'in CSV içe aktarması ilk başlığı "﻿id" okurdu.
 */
function toCsv(rows: Array<Record<string, unknown>>): string {
  return createCsvFromRows(rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value),
  ]))))
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

  onProgress?.('Dosyalar yazılıyor…')
  await new Promise((resolve) => setTimeout(resolve, 50))

  const createdAt = new Date()
  const folderName = `StokAdres_yedek_${fileStamp(createdAt)}`
  const files: BackupFile[] = [
    {
      name: 'bilgi.txt',
      content: [
        'StokAdres yedeği',
        `Tarih: ${createdAt.toLocaleString('tr-TR')}`,
        '',
        `stoklar.csv    products          ${products.length} satır`,
        `barkodlar.csv  product_barcodes  ${barcodes.length} satır`,
        `adresler.csv   address_records   ${addresses.length} satır`,
        '',
        'Geri yükleme: scripts/README.md → "Yedekten kurtarma".',
        'Sıra önemli: stoklar → barkodlar → adresler.',
      ].join('\r\n'),
    },
    { name: 'stoklar.csv', content: toCsv(products) },
    { name: 'barkodlar.csv', content: toCsv(barcodes) },
    { name: 'adresler.csv', content: toCsv(addresses) },
  ]

  let filePath: string | null = null
  const api = electronApi()
  if (api?.saveBackup) {
    filePath = (await api.saveBackup(folderName, files)).folderPath
  } else {
    for (const file of files) {
      const url = URL.createObjectURL(new Blob([file.content], { type: file.name.endsWith('.csv') ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `${folderName}_${file.name}`
      link.click()
      URL.revokeObjectURL(url)
    }
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
