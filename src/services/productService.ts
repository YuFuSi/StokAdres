import { supabase } from '../lib/supabase'
import type { CreateProductInput, Product, UpdateProductInput } from '../types/product'

type ProductRow = {
  id: string
  stock_code: string
  stock_name: string
  barcode: string | null
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

export async function listProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('id, stock_code, stock_name, barcode, created_at, updated_at')
    .order('stock_code')
  if (error) throw error
  return ((data ?? []) as unknown as ProductRow[]).map(mapProduct)
}

export async function getProductById(id: string): Promise<Product | undefined> {
  const { data, error } = await supabase
    .from('products')
    .select('id, stock_code, stock_name, barcode, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? mapProduct(data as unknown as ProductRow) : undefined
}

export async function getProductByStockCode(stockCode: string): Promise<Product | undefined> {
  const { data, error } = await supabase
    .from('products')
    .select('id, stock_code, stock_name, barcode, created_at, updated_at')
    .eq('stock_code', stockCode)
    .maybeSingle()
  if (error) throw error
  return data ? mapProduct(data as unknown as ProductRow) : undefined
}

export async function createProduct(input: CreateProductInput): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .insert({ stock_code: input.stockCode, stock_name: input.stockName, barcode: input.barcode || null })
    .select('id, stock_code, stock_name, barcode, created_at, updated_at')
    .single()
  if (error) throw error
  return mapProduct(data as unknown as ProductRow)
}

export async function updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
  const updates = {
    ...(input.stockCode !== undefined ? { stock_code: input.stockCode } : {}),
    ...(input.stockName !== undefined ? { stock_name: input.stockName } : {}),
    ...(input.barcode !== undefined ? { barcode: input.barcode || null } : {}),
    ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
  }
  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', id)
    .select('id, stock_code, stock_name, barcode, created_at, updated_at')
    .single()
  if (error) throw error
  if (!data) throw new ProductNotFoundError(id)
  return mapProduct(data as unknown as ProductRow)
}

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    stockCode: row.stock_code,
    stockName: row.stock_name,
    barcode: row.barcode ?? undefined,
    ...(row.is_active !== undefined ? { isActive: row.is_active } : {}),
    ...(row.created_at ? { createdAt: row.created_at } : {}),
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
  }
}