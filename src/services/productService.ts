import { supabase } from '../lib/supabase'
import type { CreateProductInput, Product, UpdateProductInput } from '../types/product'

type ProductRow = {
  id: string
  stock_code: string
  stock_name: string
  product_barcodes?: Array<{ barcode: string | null }> | null
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export class ProductNotFoundError extends Error {
  constructor(id: string) {
    super(`${id} kimlikli ürün bulunamadı.`)
    this.name = 'ProductNotFoundError'
  }
}

export class DuplicateProductBarcodeError extends Error {
  constructor() {
    super('Bu barkod zaten kayıtlı. Her barkod yalnızca bir üründe kullanılabilir.')
    this.name = 'DuplicateProductBarcodeError'
  }
}

export class DuplicateProductStockCodeError extends Error {
  constructor() {
    super('Bu stok kodu zaten kayıtlı. Farklı bir stok kodu girin.')
    this.name = 'DuplicateProductStockCodeError'
  }
}

export async function listProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('id, stock_code, stock_name, is_active, created_at, updated_at, product_barcodes(barcode)')
    .order('stock_code')
  if (error) throw mapProductCreateError(error)
  return ((data ?? []) as unknown as ProductRow[]).map(mapProduct)
}

export async function getProductById(id: string): Promise<Product | undefined> {
  const { data, error } = await supabase
    .from('products')
    .select('id, stock_code, stock_name, is_active, created_at, updated_at, product_barcodes(barcode)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? mapProduct(data as unknown as ProductRow) : undefined
}

export async function getProductByStockCode(stockCode: string): Promise<Product | undefined> {
  const { data, error } = await supabase
    .from('products')
    .select('id, stock_code, stock_name, is_active, created_at, updated_at, product_barcodes(barcode)')
    .eq('stock_code', stockCode)
    .maybeSingle()
  if (error) throw error
  return data ? mapProduct(data as unknown as ProductRow) : undefined
}

export async function createProduct(input: CreateProductInput): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .insert({ stock_code: input.stockCode, stock_name: input.stockName })
    .select('id')
    .single()
  if (error) throw error
  const productId = (data as { id: string }).id
  await replaceProductBarcodes(productId, input.barcodes ?? [])
  const product = await getProductById(productId)
  if (!product) throw new ProductNotFoundError(productId)
  return product
}

export async function updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
  const updates = {
    ...(input.stockCode !== undefined ? { stock_code: input.stockCode } : {}),
    ...(input.stockName !== undefined ? { stock_name: input.stockName } : {}),
    ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
  }

  if (Object.keys(updates).length > 0) {
    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) throw new ProductNotFoundError(id)
  }

  if (input.barcodes !== undefined) await replaceProductBarcodes(id, input.barcodes)
  const product = await getProductById(id)
  if (!product) throw new ProductNotFoundError(id)
  return product
}

export async function addProductBarcodes(productId: string, barcodes: string[]): Promise<Product> {
  const normalizedBarcodes = normalizeBarcodes(barcodes)
  if (normalizedBarcodes.length > 0) {
    const { error } = await supabase
      .from('product_barcodes')
      .insert(normalizedBarcodes.map((barcode) => ({ product_id: productId, barcode })))
    if (error) throw mapBarcodeError(error)
  }
  const product = await getProductById(productId)
  if (!product) throw new ProductNotFoundError(productId)
  return product
}

export async function removeProductBarcodes(productId: string, barcodes: string[]): Promise<Product> {
  const normalizedBarcodes = normalizeBarcodes(barcodes)
  if (normalizedBarcodes.length > 0) {
    const { error } = await supabase
      .from('product_barcodes')
      .delete()
      .eq('product_id', productId)
      .in('barcode', normalizedBarcodes)
    if (error) throw error
  }
  const product = await getProductById(productId)
  if (!product) throw new ProductNotFoundError(productId)
  return product
}

async function replaceProductBarcodes(productId: string, barcodes: string[]): Promise<void> {
  const { error: deleteError } = await supabase.from('product_barcodes').delete().eq('product_id', productId)
  if (deleteError) throw deleteError

  const normalizedBarcodes = normalizeBarcodes(barcodes)
  if (normalizedBarcodes.length === 0) return

  const { error: insertError } = await supabase
    .from('product_barcodes')
    .insert(normalizedBarcodes.map((barcode) => ({ product_id: productId, barcode })))
  if (insertError) throw mapBarcodeError(insertError)
}

function normalizeBarcodes(barcodes: string[]): string[] {
  return [...new Set(barcodes.map((barcode) => barcode.trim()).filter(Boolean))]
}

function mapBarcodeError(error: { code?: string; message: string }): Error {
  if (error.code === '23505' || error.message.toLowerCase().includes('unique')) {
    return new DuplicateProductBarcodeError()
  }
  return new Error(error.message)
}

function mapProductCreateError(error: { code?: string; message: string }): Error {
  if (error.code === '23505' || error.message.toLowerCase().includes('unique')) {
    return new DuplicateProductStockCodeError()
  }
  return new Error(error.message)
}

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    stockCode: row.stock_code,
    stockName: row.stock_name,
    barcodes: (row.product_barcodes ?? [])
      .map((barcodeRow) => barcodeRow.barcode?.trim() ?? '')
      .filter(Boolean),
    ...(row.is_active !== undefined ? { isActive: row.is_active } : {}),
    ...(row.created_at ? { createdAt: row.created_at } : {}),
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
  }
}