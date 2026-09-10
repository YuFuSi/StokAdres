import * as XLSX from 'xlsx'
import type { AddressRecord } from '../types/addressRecord'
import type { Product } from '../types/product'

type ElectronSave = { saveFile?: (suggestedName: string, content: string, encoding: 'utf8' | 'base64') => Promise<{ canceled: boolean }> }

export type ExportDataset = 'stocks' | 'addresses' | 'stock-address' | 'summary'

export type ExportRow = Record<string, string | number>
export type ExportSheet = { name: string; rows: ExportRow[] }

/**
 * Hazır satırlardan çalışma kitabı üretir.
 *
 * Bu fonksiyon eskiden (records, products, datasets) alıyor ve hangi sayfanın
 * hangi veriye ihtiyacı olduğuna kendi karar veriyordu. Sonuç: yalnızca "Özet"
 * istendiğinde bile 94.900 ürünün tamamı çekiliyordu. Artık veri yükleme
 * çağıranın işi; burada yalnızca dosya üretiliyor.
 */
export async function exportWorkbook(sheets: ExportSheet[], suggestedName: string): Promise<boolean> {
  const workbook = XLSX.utils.book_new()
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sheet.rows), sheet.name)
  }
  const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' })
  const electron = window as Window & { electronAPI?: ElectronSave }
  if (electron.electronAPI?.saveFile) return !(await electron.electronAPI.saveFile(suggestedName, base64, 'base64')).canceled
  const link = document.createElement('a')
  link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`
  link.download = suggestedName
  link.click()
  return true
}

export function stockRows(products: Product[]): ExportRow[] { return products.map(product => ({ 'Stok Kodu': product.stockCode, 'Stok Adı': product.stockName, Barkodlar: product.barcodes.join(' | '), Durum: product.isActive === false ? 'Pasif' : 'Aktif', 'Oluşturulma Tarihi': product.createdAt ?? '', 'Güncellenme Tarihi': product.updatedAt ?? '' })) }

export function addressRows(records: AddressRecord[]): ExportRow[] { return records.map(record => ({ Adres: record.address, 'Stok Kodu': record.stockCode, 'Stok Adı': record.stockName, 'Koli Adedi': record.cartonCount, Durum: record.isActive ? 'Aktif' : 'Pasif', Güncellenme: record.updatedAt })) }

/**
 * Barkodlar artık ürün listesi yerine ürün id'sine göre bir haritadan geliyor.
 * Eskiden bu satırları üretmek için TÜM ürünler çekiliyordu; oysa yalnızca
 * adres kaydı olan ürünlerin barkodu gerekiyor (94.900 yerine ~1.900).
 */
export function stockAddressRows(records: AddressRecord[], barcodesByProductId: Map<string, string[]>): ExportRow[] {
  return records.map(record => ({
    'Stok Kodu': record.stockCode,
    'Stok Adı': record.stockName,
    Barkod: (barcodesByProductId.get(record.productId) ?? []).join(' | '),
    Adres: record.address,
    Koli: record.cartonCount,
    Durum: record.isActive ? 'Aktif' : 'Pasif',
  }))
}

/**
 * Ürün toplamları artık dizi uzunluğundan değil, çağırandan geliyor: özet için
 * 94.900 ürünü indirip saymak yerine `dashboard_summary` view'ından tek satır
 * okunuyor.
 */
export function summaryRows(records: AddressRecord[], totals: { totalProducts: number }): ExportRow[] {
  const activeRecords = records.filter(record => record.isActive)
  const totalCartons = activeRecords.reduce((sum, record) => sum + record.cartonCount, 0)
  return [{
    'Toplam Stok': totals.totalProducts,
    'Toplam Adres': records.length,
    'Toplam Koli': totalCartons,
    'Aktif Adres': activeRecords.length,
    'Adres Başına Koli': activeRecords.length ? totalCartons / activeRecords.length : 0,
  }]
}
