
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

/**
 * CSV içeriğini kullanıcının seçtiği yere kaydeder. Sırayla: Electron kaydetme
 * diyaloğu → tarayıcı dosya seçici → indirme bağlantısı.
 *
 * Eskiden bu zincir `exportAddressRecordsCsv` içine gömülüydü ve satırları da
 * kendisi üretiyordu. Sonuç: Dışa Aktar ekranı Electron dışında çalıştığında
 * kullanıcının seçtiği veri kümesi YOK SAYILIP her zaman adres kayıtları
 * yazılıyordu. Artık üretim ile kaydetme ayrı.
 *
 * @returns Kaydedildiyse true, kullanıcı iptal ettiyse false.
 */
export async function saveCsvFile(csv: string, suggestedName: string): Promise<boolean> {
  const content = csv.startsWith('﻿') ? csv : `﻿${csv}`
  const filePickerWindow = window as WindowWithFilePicker

  if (filePickerWindow.electronAPI?.saveCsv) {
    const result = await filePickerWindow.electronAPI.saveCsv(suggestedName, content)
    return !result.canceled
  }

  if (filePickerWindow.showSaveFilePicker) {
    try {
      const fileHandle = await filePickerWindow.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'CSV dosyası', accept: { 'text/csv': ['.csv'] } }],
      })
      const writable = await fileHandle.createWritable()
      await writable.write(content)
      await writable.close()
      return true
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false
      throw error
    }
  }

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
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
