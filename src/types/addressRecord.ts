export type AddressRecord = {
  id: string
  stockCode: string
  stockName: string
  address: string
  cartonCount: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type CreateAddressRecordInput = {
  stockCode: string
  stockName: string
  address: string
  cartonCount: number
}

export type UpdateAddressRecordInput = Partial<CreateAddressRecordInput> & {
  isActive?: boolean
}
