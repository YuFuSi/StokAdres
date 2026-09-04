import type { AddressRecord } from '../types/addressRecord'
import type { AddressRecordService } from '../services/addressRecordService'
import { validateImportRow } from './importValidation'
import type { ImportPreview, ImportPreviewRow, ImportResult, ImportRow } from './importTypes'

export function createImportPreview(
  rows: ImportRow[],
  existingRecords: AddressRecord[],
): ImportPreview {
  const existingKeys = new Set(
    existingRecords
      .filter((record) => record.isActive)
      .map((record) => createAddressKey(record.stockCode, record.address)),
  )
  const previewRows: ImportPreviewRow[] = []

  for (const row of rows) {
    const errors = validateImportRow(row)
    if (errors.length > 0) {
      previewRows.push({ ...row, status: 'invalid', errors })
      continue
    }

    const key = createAddressKey(row.stockCode, row.address)
    const isDuplicate = existingKeys.has(key)
    previewRows.push({
      ...row,
      status: isDuplicate ? 'duplicate' : 'new',
      errors: [],
    })
    existingKeys.add(key)
  }

  return {
    totalRows: previewRows.length,
    validRows: previewRows.filter((row) => row.status !== 'invalid').length,
    invalidRows: previewRows.filter((row) => row.status === 'invalid').length,
    newRecords: previewRows.filter((row) => row.status === 'new').length,
    duplicateRecords: previewRows.filter((row) => row.status === 'duplicate').length,
    rows: previewRows,
  }
}

export function createAddressKey(stockCode: string, address: string): string {
  return `${stockCode.trim().toLocaleLowerCase('tr-TR')}\u0000${address.trim().toLocaleLowerCase('tr-TR')}`
}

export function importNewRecords(
  preview: ImportPreview,
  addressRecordService: AddressRecordService,
): ImportResult {
  let addedRecords = 0
  let failedRecords = 0
  const errors: ImportResult['errors'] = []

  for (const row of preview.rows) {
    if (row.status !== 'new') continue

    try {
      addressRecordService.create({
        stockCode: row.stockCode,
        stockName: row.stockName,
        address: row.address,
        cartonCount: row.cartonCount!,
      })
      addedRecords += 1
    } catch (error) {
      failedRecords += 1
      errors.push({
        rowNumber: row.rowNumber,
        errors: [error instanceof Error ? error.message : 'Kayıt oluşturulamadı.'],
      })
    }
  }

  return {
    totalRows: preview.totalRows,
    addedRecords,
    duplicateRecords: preview.duplicateRecords,
    invalidRecords: preview.invalidRows,
    failedRecords,
    errors,
  }
}
