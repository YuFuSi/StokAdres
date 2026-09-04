export type ImportRow = {
  rowNumber: number
  stockCode: string
  stockName: string
  address: string
  cartonCount: number | null
}

export type ImportRowStatus = 'new' | 'duplicate' | 'invalid'

export type ImportRowError = {
  rowNumber: number
  errors: string[]
}

export type ImportPreviewRow = ImportRow & {
  status: ImportRowStatus
  errors: string[]
}

export type ImportPreview = {
  totalRows: number
  validRows: number
  invalidRows: number
  newRecords: number
  duplicateRecords: number
  rows: ImportPreviewRow[]
}

export type ImportResult = {
  totalRows: number
  addedRecords: number
  duplicateRecords: number
  invalidRecords: number
  failedRecords: number
  errors: ImportRowError[]
}
