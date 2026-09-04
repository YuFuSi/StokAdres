import type { ImportRow } from './importTypes'

export function validateImportRow(row: ImportRow): string[] {
  const errors: string[] = []

  if (!row.stockCode) errors.push('Stok Kodu boş.')
  if (!row.stockName) errors.push('Stok İsmi boş.')
  if (!row.address) errors.push('Adres boş.')
  if (row.cartonCount === null) errors.push('Koli Adedi sayı olmalı ve boş bırakılamaz.')
  else if (!Number.isSafeInteger(row.cartonCount)) errors.push('Koli Adedi güvenli bir tam sayı olmalı.')
  else if (row.cartonCount <= 0) errors.push('Koli Adedi 0 veya negatif olamaz.')

  return errors
}
