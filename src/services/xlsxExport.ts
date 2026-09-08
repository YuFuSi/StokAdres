import * as XLSX from 'xlsx'
import type { AddressRecord } from '../types/addressRecord'
import type { Product } from '../types/product'

type ElectronSave = { saveFile?: (suggestedName: string, content: string, encoding: 'utf8' | 'base64') => Promise<{ canceled: boolean }> }

export type ExportDataset = 'stocks' | 'addresses' | 'stock-address' | 'summary'

export async function exportWorkbook(records: AddressRecord[], products: Product[], suggestedName: string, datasets: ExportDataset[] = ['stocks', 'addresses']): Promise<boolean> {
  const workbook = XLSX.utils.book_new()
  if (datasets.includes('stocks')) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(stockRows(products)), 'Stoklar')
  if (datasets.includes('addresses')) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(addressRows(records)), 'Adresler')
  if (datasets.includes('stock-address')) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(stockAddressRows(records, products)), 'Stok_Adres')
  if (datasets.includes('summary')) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows(records, products)), 'Özet')
  const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' })
  const electron = window as Window & { electronAPI?: ElectronSave }
  if (electron.electronAPI?.saveFile) return !(await electron.electronAPI.saveFile(suggestedName, base64, 'base64')).canceled
  const link = document.createElement('a')
  link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`
  link.download = suggestedName
  link.click()
  return true
}

export function stockRows(products: Product[]) { return products.map(product => ({ 'Stok Kodu': product.stockCode, 'Stok Adı': product.stockName, Barkodlar: product.barcodes.join(' | '), Durum: product.isActive === false ? 'Pasif' : 'Aktif', 'Oluşturulma Tarihi': product.createdAt ?? '', 'Güncellenme Tarihi': product.updatedAt ?? '' })) }
export function addressRows(records: AddressRecord[]) { return records.map(record => ({ Adres: record.address, 'Stok Kodu': record.stockCode, 'Stok Adı': record.stockName, 'Koli Adedi': record.cartonCount, Durum: record.isActive ? 'Aktif' : 'Pasif', Güncellenme: record.updatedAt })) }
export function stockAddressRows(records: AddressRecord[], products: Product[]) { const map = new Map(products.map(product => [product.id, product])); return records.map(record => ({ 'Stok Kodu': record.stockCode, 'Stok Adı': record.stockName, Barkod: map.get(record.productId)?.barcodes.join(' | ') ?? '', Adres: record.address, Koli: record.cartonCount, Durum: record.isActive ? 'Aktif' : 'Pasif' })) }
export function summaryRows(records: AddressRecord[], products: Product[]) { const activeRecords = records.filter(record => record.isActive); return [{ 'Toplam Stok': products.length, 'Toplam Adres': records.length, 'Toplam Koli': activeRecords.reduce((sum, record) => sum + record.cartonCount, 0), 'Aktif Stok': products.filter(product => product.isActive !== false).length, 'Aktif Adres': activeRecords.length, 'Adres Başına Koli': activeRecords.length ? activeRecords.reduce((sum, record) => sum + record.cartonCount, 0) / activeRecords.length : 0 }] }
