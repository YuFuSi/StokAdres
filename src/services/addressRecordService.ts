import type {
  AddressRecord,
  CreateAddressRecordInput,
  UpdateAddressRecordInput,
} from '../types/addressRecord'
import type { Product } from '../types/product'
import { supabase } from '../lib/supabase'
import { createProduct, getProductByStockCode, listProducts, updateProduct } from './productService'
import { createOperationId } from './auditLogService'

type ProductRelation = {
  stock_code: string
  stock_name: string
}

type AddressRecordRow = {
  id: string
  product_id: string
  address: string
  carton_count: number
  is_active: boolean
  created_at: string
  updated_at: string
  products: ProductRelation | ProductRelation[]
}

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
  async create(input: CreateAddressRecordInput): Promise<AddressRecord> {
    const product = input.productId
      ? { id: input.productId }
      : await this.findOrCreateProduct(input)
    const { data, error } = await supabase
      .from('address_records')
      .insert({ product_id: product.id, address: input.address, carton_count: input.cartonCount, is_active: input.isActive ?? true })
      .select('id, product_id, address, carton_count, is_active, created_at, updated_at, products!inner(stock_code, stock_name)')
      .single()

    if (error) throw this.mapSupabaseError(error, input.stockCode, input.address)
    return this.mapRecord(data as unknown as AddressRecordRow)
  }

  async getById(id: string): Promise<AddressRecord | undefined> {
    const { data, error } = await supabase
      .from('address_records')
      .select('id, product_id, address, carton_count, is_active, created_at, updated_at, products!inner(stock_code, stock_name)')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    return data ? this.mapRecord(data as unknown as AddressRecordRow) : undefined
  }

  async getActiveByStockCode(stockCode: string): Promise<AddressRecord[]> {
    const records = await this.list()
    return records.filter((record) => record.stockCode === stockCode && record.isActive)
  }

  async getByProductId(productId: string): Promise<AddressRecord[]> {
    const records = await this.list()
    return records.filter((record) => record.productId === productId)
  }

  async getByStockCode(stockCode: string): Promise<AddressRecord | undefined> {
    return (await this.getActiveByStockCode(stockCode))[0]
  }

  async update(id: string, input: UpdateAddressRecordInput): Promise<AddressRecord> {
    const existing = await this.getById(id)
    if (!existing) throw new AddressRecordNotFoundError(id)
    const next = { ...existing, ...input }
    const product = input.productId || input.stockCode || input.stockName
      ? { id: input.productId ?? (await this.findOrCreateProduct({ stockCode: next.stockCode, stockName: next.stockName, barcode: next.barcode, address: next.address, cartonCount: next.cartonCount })).id }
      : undefined
    const updates = {
      ...(product ? { product_id: product.id } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.cartonCount !== undefined ? { carton_count: input.cartonCount } : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
    }
    const { data, error } = await supabase
      .from('address_records')
      .update(updates)
      .eq('id', id)
      .select('id, product_id, address, carton_count, is_active, created_at, updated_at, products!inner(stock_code, stock_name)')
      .single()
    if (error) throw this.mapSupabaseError(error, next.stockCode, next.address)
    return this.mapRecord(data as unknown as AddressRecordRow)
  }

  async delete(id: string): Promise<boolean> {
    const { error, count } = await supabase.from('address_records').delete({ count: 'exact' }).eq('id', id)
    if (error) throw error
    return Boolean(count)
  }

  async replaceAll(records: AddressRecord[]): Promise<void> {
    const { error } = await supabase.rpc('restore_address_records', {
      p_records: records,
      p_operation_id: createOperationId(),
    })
    if (error) throw error
  }

  async clear(): Promise<void> {
    const { error } = await supabase.rpc('clear_address_records', { p_operation_id: createOperationId() })
    if (error) throw error
  }

  async list(): Promise<AddressRecord[]> {
    const { data, error } = await supabase
      .from('address_records')
      .select('id, product_id, address, carton_count, is_active, created_at, updated_at, products!inner(stock_code, stock_name)')
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []).map((record) => this.mapRecord(record as unknown as AddressRecordRow))
  }

  async listProducts(): Promise<Product[]> {
    return listProducts()
  }

  private async findOrCreateProduct(input: CreateAddressRecordInput): Promise<{ id: string }> {
    const existing = await getProductByStockCode(input.stockCode)
    if (existing) {
      if (input.barcode && !existing.barcode) {
        await updateProduct(existing.id, { barcode: input.barcode })
      }
      return { id: existing.id }
    }
    try {
      const created = await createProduct({ stockCode: input.stockCode, stockName: input.stockName, barcode: input.barcode })
      return { id: created.id }
    } catch (error) {
      if (isUniqueViolation(error)) {
        const product = await getProductByStockCode(input.stockCode)
        if (product) return { id: product.id }
      }
      throw error
    }
  }

  private mapRecord(record: AddressRecordRow): AddressRecord {
    const product = Array.isArray(record.products) ? record.products[0] : record.products
    if (!product) throw new Error('Adres kaydı ilişkili ürün bilgisi olmadan döndü.')
    return {
      id: record.id,
      productId: record.product_id,
      stockCode: product.stock_code,
      stockName: product.stock_name,
      address: record.address,
      cartonCount: record.carton_count,
      isActive: record.is_active,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    }
  }

  private mapSupabaseError(error: { code?: string; message: string }, stockCode: string, address: string): Error {
    if (error.code === '23505' || error.message.toLowerCase().includes('unique')) return new DuplicateActiveAddressError(stockCode, address)
    return new Error(error.message)
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505')
}
