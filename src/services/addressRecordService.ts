import type {
  AddressRecord,
  CreateAddressRecordInput,
  UpdateAddressRecordInput,
} from '../types/addressRecord'
import { ADDRESS_RECORDS_STORAGE_KEY, getLocalStorage } from '../data/localStorage'

export class DuplicateActiveAddressError extends Error {
  constructor(stockCode: string, address: string) {
    super(`${stockCode} stok kodu ve ${address} adresi için zaten aktif bir kayıt var.`)
    this.name = 'DuplicateActiveAddressError'
  }
}

export class AddressRecordNotFoundError extends Error {
  constructor(id: string) {
    super(`${id} kimlikli adres kaydı bulunamadı.`)
    this.name = 'AddressRecordNotFoundError'
  }
}

export class AddressRecordService {
  private readonly records = new Map<string, AddressRecord>()
  private readonly storage: Storage | undefined

  constructor(initialRecords: AddressRecord[] = [], storage: Storage | undefined = getLocalStorage()) {
    this.storage = storage
    const storedRecords = this.readStoredRecords()
    const recordsToLoad = storedRecords ?? initialRecords

    recordsToLoad.forEach((record) => this.records.set(record.id, { ...record }))

    if (storedRecords === undefined) this.persist()
  }

  create(input: CreateAddressRecordInput): AddressRecord {
    this.assertNoActiveAddress(input.stockCode, input.address)

    const now = new Date().toISOString()
    const record: AddressRecord = {
      ...input,
      id: this.createId(),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }

    this.records.set(record.id, record)
    this.persist()
    return { ...record }
  }

  getById(id: string): AddressRecord | undefined {
    const record = this.records.get(id)
    return record ? { ...record } : undefined
  }

  getActiveByStockCode(stockCode: string): AddressRecord[] {
    return [...this.records.values()]
      .filter((record) => record.stockCode === stockCode && record.isActive)
      .map((record) => ({ ...record }))
  }

  getByStockCode(stockCode: string): AddressRecord | undefined {
    return this.getActiveByStockCode(stockCode)[0]
  }

  update(id: string, input: UpdateAddressRecordInput): AddressRecord {
    const existing = this.records.get(id)
    if (!existing) throw new AddressRecordNotFoundError(id)

    const nextRecord = { ...existing, ...input }
    if (nextRecord.isActive) this.assertNoActiveAddress(nextRecord.stockCode, nextRecord.address, id)

    const updatedRecord: AddressRecord = {
      ...nextRecord,
      updatedAt: new Date().toISOString(),
    }
    this.records.set(id, updatedRecord)
    this.persist()
    return { ...updatedRecord }
  }

  delete(id: string): boolean {
    const deleted = this.records.delete(id)
    if (deleted) this.persist()
    return deleted
  }

  replaceAll(records: AddressRecord[]): void {
    this.records.clear()
    records.forEach((record) => this.records.set(record.id, { ...record }))
    this.persist()
  }

  clear(): void {
    this.records.clear()
    this.persist()
  }

  list(): AddressRecord[] {
    return [...this.records.values()].map((record) => ({ ...record }))
  }

  private assertNoActiveAddress(stockCode: string, address: string, ignoredId?: string): void {
    const hasActiveRecord = [...this.records.values()].some(
      (record) => record.id !== ignoredId
        && record.stockCode === stockCode
        && record.address === address
        && record.isActive,
    )

    if (hasActiveRecord) throw new DuplicateActiveAddressError(stockCode, address)
  }

  private createId(): string {
    return `address-record-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  private readStoredRecords(): AddressRecord[] | undefined {
    if (!this.storage) return undefined

    try {
      const storedValue = this.storage.getItem(ADDRESS_RECORDS_STORAGE_KEY)
      if (storedValue === null) return undefined

      const parsedValue: unknown = JSON.parse(storedValue)
      return this.isAddressRecordArray(parsedValue) ? parsedValue : undefined
    } catch {
      return undefined
    }
  }

  private persist(): void {
    if (!this.storage) return

    try {
      this.storage.setItem(ADDRESS_RECORDS_STORAGE_KEY, JSON.stringify(this.list()))
    } catch {
      // Storage errors should not prevent the in-memory workflow from working.
    }
  }

  private isAddressRecordArray(value: unknown): value is AddressRecord[] {
    if (!Array.isArray(value) || !value.every((record) => this.isAddressRecord(record))) return false

    const activeAddressKeys = value
      .filter((record) => record.isActive)
      .map((record) => `${record.stockCode}\u0000${record.address}`)

    return new Set(activeAddressKeys).size === activeAddressKeys.length
  }

  private isAddressRecord(value: unknown): value is AddressRecord {
    if (!value || typeof value !== 'object') return false

    const record = value as Record<string, unknown>
    return typeof record.id === 'string'
      && typeof record.stockCode === 'string'
      && typeof record.stockName === 'string'
      && typeof record.address === 'string'
      && typeof record.cartonCount === 'number'
      && Number.isInteger(record.cartonCount)
      && record.cartonCount >= 0
      && typeof record.isActive === 'boolean'
      && typeof record.createdAt === 'string'
      && typeof record.updatedAt === 'string'
  }
}
