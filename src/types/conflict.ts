import type { AddressRecord, CreateAddressRecordInput } from './addressRecord'

export type ConflictStatus = 'pending' | 'resolved' | 'ignored'
export type ConflictType = 'address-duplicate'
export type ConflictResolution = 'keep-existing' | 'replace-with-incoming' | 'ignored'

export type IncomingConflictRecord = CreateAddressRecordInput & {
  source?: string
}

export type AddressConflict = {
  id: string
  type: ConflictType
  productId: string
  existingRecord: AddressRecord
  stockCode: string
  stockName: string
  address: string
  incomingRecord: IncomingConflictRecord
  createdAt: string
  status: ConflictStatus
  resolvedAt?: string
  resolution?: ConflictResolution
}