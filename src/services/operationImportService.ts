import * as XLSX from 'xlsx'

export type ImportOperation = 'stocks' | 'names' | 'barcodes' | 'addresses'
export type OperationImportRow = { rowNumber: number; stockCode: string; stockName: string; barcode: string; address: string; cartonCount: number | null; cabaQuantity: string }

const aliases: Record<keyof Omit<OperationImportRow, 'rowNumber' | 'cartonCount'>, string[]> = {
  stockCode: ['stok kodu', 'stock code', 'stockcode', 'kod', 'ürün kodu'],
  stockName: ['stok ismi', 'stok adı', 'stock name', 'stockname', 'ürün adı', 'ürün ismi'],
  barcode: ['barkod', 'barcode', 'ean'],
  address: ['adres', 'address', 'lokasyon', 'konum'],
  cabaQuantity: ['caba miktar', 'caba miktarı', 'caba quantity', 'miktar', 'koli adedi', 'koli', 'carton count'],
}

export class OperationImportFileError extends Error {}

export async function parseOperationImportFile(file: File): Promise<OperationImportRow[]> {
  const lowerName = file.name.toLocaleLowerCase('tr-TR')
  if (!lowerName.endsWith('.csv') && !lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls')) throw new OperationImportFileError('Dosya okunamadı. Lütfen CSV, XLSX veya XLS dosyası seçin.')
  const isText = lowerName.endsWith('.csv')
  const workbook = XLSX.read(isText ? await file.text() : await file.arrayBuffer(), { type: isText ? 'string' : 'array', raw: false })
  return rowsFromWorkbook(workbook, 'Dosyada')
}

/**
 * Excel'den KOPYALANIP yapıştırılan metni ayrıştırır. Kullanıcının gerçek iş
 * akışı dosya seçmek değil, CABA çıktısını doğrudan yapıştırmak — bu yüzden
 * yapıştırma birinci sınıf bir giriş yolu.
 *
 * Excel panoya sekmeyle ayrılmış metin koyar; SheetJS bunu CSV ile aynı
 * çözümleyiciden geçirir, dolayısıyla kolon eşleştirme ve satır şekli dosya
 * yoluyla birebir aynı kalır.
 */
export function parseOperationImportText(text: string): OperationImportRow[] {
  if (!text.trim()) throw new OperationImportFileError('Yapıştırılan alan boş.')
  const workbook = XLSX.read(text, { type: 'string', raw: false })
  return rowsFromWorkbook(workbook, 'Yapıştırılan veride')
}

function rowsFromWorkbook(workbook: XLSX.WorkBook, subject: string): OperationImportRow[] {
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? '']
  if (!sheet) throw new OperationImportFileError(`${subject} okunabilir bir sayfa bulunamadı.`)
  const matrix = XLSX.utils.sheet_to_json<Array<string | number>>(sheet, { header: 1, defval: '', raw: false })
  if (matrix.length < 2) throw new OperationImportFileError(`${subject} başlık ve veri satırı bulunamadı.`)
  const headerRow = matrix[0].map(value => String(value))
  const columns = mapColumns(headerRow)

  // Stok kodu her işlem için zorunlu (bkz. validateOperationRow). Kolon
  // tanınmazsa `read()` her satır için boş string döndürür ve kullanıcı
  // "kolon eksik" yerine yüzlerce "Stok kodu boş" satırı görür — kök sebep
  // gizlenir. Bunun yerine hangi başlıkların bulunduğunu söyleyerek duruyoruz.
  if (columns.stockCode === undefined) {
    const found = headerRow.map(header => header.trim()).filter(Boolean)
    throw new OperationImportFileError(
      `${subject} "Stok Kodu" kolonu bulunamadı. ` +
      (found.length ? `Bulunan başlıklar: ${found.join(', ')}. ` : 'Başlık satırı boş görünüyor. ') +
      `Kabul edilen adlar: ${aliases.stockCode.join(', ')}.`,
    )
  }
  return matrix.slice(1).map((cells, index) => {
    const read = (key: keyof typeof aliases) => String(cells[columns[key] ?? -1] ?? '').trim()
    const cartonValue = read('cabaQuantity')
    return { rowNumber: index + 2, stockCode: read('stockCode'), stockName: read('stockName'), barcode: read('barcode'), address: read('address'), cartonCount: cartonValue === '' ? null : Number(cartonValue.replace(',', '.')), cabaQuantity: cartonValue }
  }).filter(row => Object.values(row).some(value => value !== '' && value !== null && value !== row.rowNumber))
}

export function validateOperationRow(operation: ImportOperation, row: OperationImportRow): string[] {
  const errors: string[] = []
  if (!row.stockCode) errors.push('Stok kodu boş.')
  if ((operation === 'names' || operation === 'stocks') && !row.stockName) errors.push('Stok adı boş.')
  if (operation === 'barcodes' && !row.barcode) errors.push('Barkod boş.')
  if (operation === 'addresses') {
    if (!row.address) errors.push('Adres boş.')
    if (!Number.isSafeInteger(row.cartonCount) || (row.cartonCount ?? 0) <= 0) errors.push('Koli adedi pozitif tam sayı olmalı.')
  }
  return errors
}

function mapColumns(headers: string[]): Partial<Record<keyof typeof aliases, number>> {
  const normalized = headers.map(header => header.toLocaleLowerCase('tr-TR').replace(/[._-]/g, ' ').replace(/\s+/g, ' ').trim())
  return Object.fromEntries(Object.entries(aliases).flatMap(([key, values]) => {
    const index = normalized.findIndex(header => values.includes(header))
    return index >= 0 ? [[key, index]] : []
  })) as Partial<Record<keyof typeof aliases, number>>
}
