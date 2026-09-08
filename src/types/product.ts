export type Product = {
  id: string
  stockCode: string
  stockName: string
  barcodes: string[]
  isActive?: boolean
  createdAt?: string
  updatedAt?: string
}

export type CreateProductInput = {
  stockCode: string
  stockName: string
  barcodes?: string[]
}

export type UpdateProductInput = Partial<CreateProductInput> & {
  isActive?: boolean
}
