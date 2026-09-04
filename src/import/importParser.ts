import * as XLSX from 'xlsx'
import type { ImportRow } from './importTypes'

const REQUIRED_COLUMNS = ['Stok Kodu', 'Stok İsmi', 'Adres', 'Koli Adedi'] as const

type RawCell = string | number | boolean | Date | null | undefined
type RawRow = RawCell[]

export class ImportFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportFileError'
  }
}

export async function parseImportFile(file: File): Promise<ImportRow[]> {
  const isCsv = file.name.toLocaleLowerCase('tr-TR').endsWith('.csv')
  const source = isCsv ? await file.text() : await file.arrayBuffer()
  const workbook = XLSX.read(source, { type: isCsv ? 'string' : 'array', cellDates: true })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) throw new ImportFileError('Dosyada okunabilir bir sayfa bulunamadı.')

  const sheet = workbook.Sheets[firstSheetName]
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  })

  if (rows.length === 0) throw new ImportFileError('Dosyada başlık satırı bulunamadı.')

  const headerIndexes = getHeaderIndexes(rows[0])
  return rows
    .slice(1)
    .map((row, index) => toImportRow(row, index + 2, headerIndexes))
    .filter((row): row is ImportRow => row !== null)
}

function getHeaderIndexes(headerRow: RawRow): Record<typeof REQUIRED_COLUMNS[number], number> {
  const normalizedHeaders = new Map(
    headerRow.map((cell, index) => [normalizeText(cell), index]),
  )
  const missingColumn = REQUIRED_COLUMNS.find((column) => !normalizedHeaders.has(normalizeText(column)))

  if (missingColumn) {
    throw new ImportFileError(`Gerekli kolon bulunamadı: ${missingColumn}.`)
  }

  return {
    'Stok Kodu': normalizedHeaders.get(normalizeText('Stok Kodu'))!,
    'Stok İsmi': normalizedHeaders.get(normalizeText('Stok İsmi'))!,
    'Adres': normalizedHeaders.get(normalizeText('Adres'))!,
    'Koli Adedi': normalizedHeaders.get(normalizeText('Koli Adedi'))!,
  }
}

function toImportRow(
  row: RawRow,
  rowNumber: number,
  headerIndexes: Record<typeof REQUIRED_COLUMNS[number], number>,
): ImportRow | null {
  const stockCode = normalizeText(row[headerIndexes['Stok Kodu']])
  const stockName = normalizeText(row[headerIndexes['Stok İsmi']])
  const address = normalizeText(row[headerIndexes.Adres])
  const cartonValue = row[headerIndexes['Koli Adedi']]

  if (!stockCode && !stockName && !address && isBlank(cartonValue)) return null

  return {
    rowNumber,
    stockCode,
    stockName,
    address,
    cartonCount: parseCartonCount(cartonValue),
  }
}

function parseCartonCount(value: RawCell): number | null {
  if (isBlank(value)) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null

  const normalizedValue = String(value).trim().replace(',', '.')
  if (!normalizedValue) return null

  const parsedValue = Number(normalizedValue)
  return Number.isFinite(parsedValue) ? parsedValue : null
}

function normalizeText(value: RawCell): string {
  return isBlank(value) ? '' : String(value).trim()
}

function isBlank(value: RawCell): boolean {
  return value === null || value === undefined || String(value).trim() === ''
}
