import type { AddressRecord } from '../types/addressRecord'
import type { Product } from '../types/product'
import type { AddressRecordService } from '../services/addressRecordService'
import { create as createConflict } from '../services/conflictService'
import { validateImportRow } from './importValidation'
import type { ImportPreview, ImportPreviewRow, ImportResult, ImportRow } from './importTypes'

export function createImportPreview(
  rows: ImportRow[],
  existingRecords: AddressRecord[],
  products: Product[] = [],
): ImportPreview {
  const productsByStockCode = new Map(products.map((product) => [normalizeStockCode(product.stockCode), product]))
  const activeExistingRecords = existingRecords.filter((record) => record.isActive)
  const existingKeys = new Set(
    activeExistingRecords.flatMap((record) => [
      createProductAddressKey(record.productId, record.stockCode, record.address),
      createAddressKey(record.stockCode, record.address),
    ]),
  )
  const existingRecordsByKey = new Map(
    activeExistingRecords.flatMap((record) => [
      [createProductAddressKey(record.productId, record.stockCode, record.address), record] as const,
      [createAddressKey(record.stockCode, record.address), record] as const,
    ]),
  )
  const previewRows: ImportPreviewRow[] = []

  for (const row of rows) {
    const errors = validateImportRow(row)
    if (errors.length > 0) {
      previewRows.push({ ...row, status: 'invalid', errors })
      continue
    }

    const product = productsByStockCode.get(normalizeStockCode(row.stockCode))
    const key = createProductAddressKey(product?.id, row.stockCode, row.address)
    const legacyKey = createAddressKey(row.stockCode, row.address)
    const isDuplicate = existingKeys.has(key) || existingKeys.has(legacyKey)
    const existingRecord = existingRecordsByKey.get(key) ?? existingRecordsByKey.get(legacyKey)
    previewRows.push({
      ...row,
      status: isDuplicate ? 'duplicate' : 'new',
      errors: [],
      ...(existingRecord ? { existingRecord } : {}),
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
  return createProductAddressKey(undefined, stockCode, address)
}

function createProductAddressKey(productId: string | undefined, stockCode: string, address: string): string {
  return `${productId ?? normalizeStockCode(stockCode)}\u0000${normalizeAddress(address)}`
}

function normalizeStockCode(value: string): string {
  return value.trim().toLocaleLowerCase('tr-TR')
}

function normalizeAddress(value: string): string {
  return value.trim().toLocaleLowerCase('tr-TR')
}

export async function importNewRecords(
  preview: ImportPreview,
  addressRecordService: AddressRecordService,
  source = 'Excel/CSV import',
): Promise<ImportResult> {
  let addedRecords = 0
  let conflictRecords = 0
  let failedRecords = 0
  const errors: ImportResult['errors'] = []

  for (const row of preview.rows) {
    if (row.status === 'duplicate' && row.existingRecord && row.cartonCount !== null) {
      try {
        await createConflict({
          existingRecord: row.existingRecord,
          incomingRecord: {
            stockCode: row.stockCode,
            stockName: row.stockName,
            barcode: row.barcode,
            address: row.address,
            cartonCount: row.cartonCount,
            source,
          },
        })
        conflictRecords += 1
      } catch (error) {
        failedRecords += 1
        errors.push({ rowNumber: row.rowNumber, errors: [error instanceof Error ? error.message : 'Çakışma kaydedilemedi.'] })
      }
      continue
    }
    if (row.status !== 'new') continue

    try {
      await addressRecordService.create({
        stockCode: row.stockCode,
        stockName: row.stockName,
        barcode: row.barcode,
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
    conflictRecords,
    invalidRecords: preview.invalidRows,
    failedRecords,
    errors,
  }
}
