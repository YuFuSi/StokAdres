import type { AddressRecord } from '../types/addressRecord'
import type { Product } from '../types/product'

export const CSV_EXPORT_HEADERS = [
  'Stok Kodu',
  'Stok Adı',
  'Barkod',
  'Adres',
  'Koli Adedi',
  'Durum',
  'Oluşturulma Tarihi',
  'Güncellenme Tarihi',
] as const

type SaveFilePickerOptions = {
  suggestedName: string
  types: Array<{
    description: string
    accept: Record<string, string[]>
  }>
}

type FileSystemWritableFileStreamLike = {
  write(data: string | Blob): Promise<void>
  close(): Promise<void>
}

type FileSystemFileHandleLike = {
  createWritable(): Promise<FileSystemWritableFileStreamLike>
}

type WindowWithFilePicker = Window & {
  showSaveFilePicker?: (options: SaveFilePickerOptions) => Promise<FileSystemFileHandleLike>
  electronAPI?: {
    saveCsv?: (suggestedName: string, content: string) => Promise<{ canceled: boolean; filePath?: string }>
  }
}

export function createAddressRecordsCsv(records: AddressRecord[], products: Product[] = []): string {
  const productsById = new Map(products.map((product) => [product.id, product]))
  const barcodesByStockCode = new Map(products.map((product) => [product.stockCode, product.barcodes.join(' | ')]))
  const rows = records
    .filter((record) => record.isActive)
    .map((record) => [
      record.stockCode,
      record.stockName,
      productsById.get(record.productId)?.barcodes.join(' | ') ?? barcodesByStockCode.get(record.stockCode) ?? '',
      record.address,
      String(record.cartonCount),
      'Aktif',
      record.createdAt,
      record.updatedAt,
    ])

  return [CSV_EXPORT_HEADERS, ...rows]
    .map((row) => row.map(escapeCsvField).join(','))
    .join('\r\n')
}

/**
 * Nesne dizisinden CSV üretir; başlıklar ilk satırın anahtarlarından gelir.
 *
 * Tek kaçış kaynağı bilerek `escapeCsvField`: eskiden OperationsPage kendi
 * `toCsv`'sini taşıyordu ve HER alanı tırnaklıyordu, bu dosya ise yalnızca
 * gerektiğinde. Aynı veri, hangi yoldan dışa aktarıldığına göre iki farklı
 * biçimde çıkıyordu.
 */
export function createCsvFromRows(rows: Array<Record<string, string | number>>): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const body = rows.map((row) => headers.map((header) => String(row[header] ?? '')))
  return [headers, ...body].map((row) => row.map(escapeCsvField).join(',')).join('\r\n')
}

export async function exportAddressRecordsCsv(
  records: AddressRecord[],
  products: Product[],
  suggestedName: string,
): Promise<boolean> {
  const csv = `\uFEFF${createAddressRecordsCsv(records, products)}`
  const filePickerWindow = window as WindowWithFilePicker

  if (filePickerWindow.electronAPI?.saveCsv) {
    const result = await filePickerWindow.electronAPI.saveCsv(suggestedName, csv)
    return !result.canceled
  }

  if (filePickerWindow.showSaveFilePicker) {
    try {
      const fileHandle = await filePickerWindow.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'CSV dosyası', accept: { 'text/csv': ['.csv'] } }],
      })
      const writable = await fileHandle.createWritable()
      await writable.write(csv)
      await writable.close()
      return true
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false
      throw error
    }
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = suggestedName
  link.click()
  URL.revokeObjectURL(url)
  return true
}

function escapeCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}
