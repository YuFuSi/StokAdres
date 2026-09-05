export type AddressRecord = {
  id: string
  productId: string
  stockCode: string
  stockName: string
  address: string
  cartonCount: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type CreateAddressRecordInput = {
  productId?: string
  stockCode: string
  stockName: string
  barcode?: string
  address: string
  cartonCount: number
  isActive?: boolean
}

export type UpdateAddressRecordInput = Partial<CreateAddressRecordInput> & {
  isActive?: boolean
}
