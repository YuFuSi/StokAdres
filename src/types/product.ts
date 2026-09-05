export type Product = {
  id: string
  stockCode: string
  stockName: string
  barcode?: string
  isActive?: boolean
  createdAt?: string
  updatedAt?: string
}

export type CreateProductInput = {
  stockCode: string
  stockName: string
  barcode?: string
}

export type UpdateProductInput = Partial<CreateProductInput> & {
  isActive?: boolean
}
