import type { AddressRecord } from '../types/addressRecord'

export const BACKUP_VERSION = 1

export type StokAdresBackup = {
  backupVersion: number
  exportedAt: string
  records: AddressRecord[]
}

export type BackupSummary = {
  totalRecords: number
  activeAddresses: number
  totalCartons: number
  uniqueStocks: number
}

type SaveFilePickerOptions = {
  suggestedName: string
  types: Array<{ description: string; accept: Record<string, string[]> }>
}
type FileSystemWritable = { write(data: string): Promise<void>; close(): Promise<void> }
type FileSystemHandle = { createWritable(): Promise<FileSystemWritable> }
type WindowWithSavePicker = Window & {
  showSaveFilePicker?: (options: SaveFilePickerOptions) => Promise<FileSystemHandle>
}

export function createBackup(records: AddressRecord[]): StokAdresBackup {
  return { backupVersion: BACKUP_VERSION, exportedAt: new Date().toISOString(), records: records.map((record) => ({ ...record })) }
}

export function createBackupJson(records: AddressRecord[]): string {
  return JSON.stringify(createBackup(records), null, 2)
}

export async function saveBackupJson(records: AddressRecord[], suggestedName: string): Promise<boolean> {
  const content = createBackupJson(records)
  const pickerWindow = window as WindowWithSavePicker
  if (pickerWindow.showSaveFilePicker) {
    try {
      const handle = await pickerWindow.showSaveFilePicker({ suggestedName, types: [{ description: 'StokAdres JSON yedeği', accept: { 'application/json': ['.json'] } }] })
      const writable = await handle.createWritable()
      await writable.write(content)
      await writable.close()
      return true
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false
      throw error
    }
  }
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = suggestedName
  link.click()
  URL.revokeObjectURL(url)
  return true
}

export function parseBackupJson(json: string): StokAdresBackup {
  let parsed: unknown
  try { parsed = JSON.parse(json) } catch { throw new Error('Yedek dosyası geçerli bir JSON içermiyor.') }
  if (!isBackup(parsed)) throw new Error('Geçersiz StokAdres yedeği. Backup sürümü veya kayıt yapısı tanınamadı.')
  return { backupVersion: parsed.backupVersion, exportedAt: parsed.exportedAt, records: parsed.records.map((record) => ({ ...record })) }
}

export function getBackupSummary(records: AddressRecord[]): BackupSummary {
  const activeRecords = records.filter((record) => record.isActive)
  return {
    totalRecords: records.length,
    activeAddresses: activeRecords.length,
    totalCartons: activeRecords.reduce((total, record) => total + record.cartonCount, 0),
    uniqueStocks: new Set(activeRecords.map((record) => record.stockCode)).size,
  }
}

function isBackup(value: unknown): value is StokAdresBackup {
  if (!value || typeof value !== 'object') return false
  const backup = value as Record<string, unknown>
  return backup.backupVersion === BACKUP_VERSION
    && typeof backup.exportedAt === 'string'
    && Array.isArray(backup.records)
    && backup.records.every(isAddressRecord)
    && hasUniqueRecordIds(backup.records)
    && hasUniqueActiveAddresses(backup.records)
}

function hasUniqueRecordIds(records: AddressRecord[]): boolean {
  const ids = records.map((record) => record.id)
  return new Set(ids).size === ids.length
}

function hasUniqueActiveAddresses(records: AddressRecord[]): boolean {
  const keys = records.filter((record) => record.isActive).map((record) => `${record.stockCode}\u0000${record.address}`)
  return new Set(keys).size === keys.length
}

function isAddressRecord(value: unknown): value is AddressRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.id === 'string'
    && typeof record.stockCode === 'string'
    && typeof record.stockName === 'string'
    && typeof record.address === 'string'
    && typeof record.cartonCount === 'number'
    && Number.isSafeInteger(record.cartonCount)
    && record.cartonCount >= 0
    && typeof record.isActive === 'boolean'
    && typeof record.createdAt === 'string'
    && typeof record.updatedAt === 'string'
}
