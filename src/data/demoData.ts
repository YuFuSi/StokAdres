import type { AddressRecord } from '../types/addressRecord'
import type { Product } from '../types/product'

export const demoProducts: Product[] = [
  { id: 'product-1', stockCode: 'ZÜCC33687', stockName: 'PEROTTİ 16976', barcode: '8690000336871' },
  { id: 'product-2', stockCode: 'ZÜCC22528', stockName: 'PEROTTİ 18015', barcode: '8690000225288' },
  { id: 'product-3', stockCode: 'ZÜCC41707', stockName: 'PEROTTİ 16801', barcode: '8690000417074' },
]

export const demoAddressRecords: AddressRecord[] = [
  {
    id: 'address-record-1',
    stockCode: 'ZÜCC33687',
    stockName: 'PEROTTİ 16976',
    address: 'I37-2',
    cartonCount: 29,
    isActive: true,
    createdAt: '2026-09-01T08:30:00.000Z',
    updatedAt: '2026-09-01T08:30:00.000Z',
  },
  {
    id: 'address-record-1b',
    stockCode: 'ZÜCC33687',
    stockName: 'PEROTTİ 16976',
    address: 'J12-4',
    cartonCount: 12,
    isActive: true,
    createdAt: '2026-09-01T08:31:00.000Z',
    updatedAt: '2026-09-01T08:31:00.000Z',
  },
  {
    id: 'address-record-2',
    stockCode: 'ZÜCC22528',
    stockName: 'PEROTTİ 18015',
    address: 'I37-3',
    cartonCount: 85,
    isActive: true,
    createdAt: '2026-09-01T08:35:00.000Z',
    updatedAt: '2026-09-01T08:35:00.000Z',
  },
  {
    id: 'address-record-3',
    stockCode: 'ZÜCC41707',
    stockName: 'PEROTTİ 16801',
    address: 'I37-3',
    cartonCount: 6,
    isActive: true,
    createdAt: '2026-09-01T08:40:00.000Z',
    updatedAt: '2026-09-01T08:40:00.000Z',
  },
]
