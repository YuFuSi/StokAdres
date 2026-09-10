import { supabase } from '../lib/supabase'
import { fetchAllRows } from '../lib/pagination'
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

// Canlı veritabanında 1655 ürün var; PostgREST tek istekte en fazla 1000 satır
// döndürür ve bunu hatasız yapar (Content-Range: 0-999/1655). Sayfalı
// çekilmezse stok listesi, dashboard sayaçları ve dışa aktarma sessizce 655
// ürünü atlar.
//
// `stock_code` benzersiz olsa da sayfalar arası sıralamayı garantiye almak için
// ikincil anahtar olarak `id` de ekleniyor; böylece eşit değerli satırlar
// sayfalar arasında kayıp veya tekrar üretmez.
export async function listProducts(): Promise<Product[]> {
  const rows = await fetchAllRows<ProductRow>(
    (from, to) =>
      supabase
        .from('products')
        .select('id, stock_code, stock_name, is_active, created_at, updated_at, product_barcodes(barcode)')
        .order('stock_code')
        .order('id')
        .range(from, to),
  )
  return rows.map(mapProduct)
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

// Ürün oluşturma iki ayrı yazma isteğinden oluşur: önce products'a INSERT,
// sonra product_barcodes'a INSERT. PostgREST her isteği kendi transaction'ında
// commit ettiği için bunları tek bir atomik işlemde toplayamıyoruz.
//
// Barkod adımı patladığında (en olası sebep: barkod başka bir üründe kayıtlı,
// product_barcodes.barcode global UNIQUE) ürün çoktan yazılmış oluyordu.
// Kullanıcı hata mesajı görüyor ama depoda barkodsuz, "oluşmadı" sandığı bir
// ürün kalıyordu. Telafi ederek çözüyoruz: yeni oluşturduğumuz ürünü siliyor,
// çağrı öncesi duruma dönüyoruz. products -> product_barcodes FK'si
// ON DELETE CASCADE olduğu için araya girmiş barkod satırları da temizlenir.
export async function createProduct(input: CreateProductInput): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .insert({ stock_code: input.stockCode, stock_name: input.stockName })
    .select('id')
    .single()
  if (error) throw mapStockCodeError(error)
  const productId = (data as { id: string }).id

  try {
    await replaceProductBarcodes(productId, input.barcodes ?? [])
  } catch (barcodeError) {
    await rollbackCreatedProduct(productId)
    throw barcodeError
  }

  const product = await getProductById(productId)
  if (!product) throw new ProductNotFoundError(productId)
  return product
}

// Yalnızca createProduct'ın telafi yolundan çağrılır ve yalnızca birkaç
// milisaniye önce kendi oluşturduğumuz ürünün id'sini alır. Silme başarısız
// olursa çağrıyı bozmayız: kullanıcı zaten asıl hatayı görecek, ama sorunu
// izleyebilmek için loglarız.
async function rollbackCreatedProduct(productId: string): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', productId)
  if (error) {
    console.error(
      `Ürün oluşturma geri alınamadı; ${productId} kimlikli barkodsuz ürün kalmış olabilir.`,
      error,
    )
  }
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
    // stock_code UNIQUE olduğu için mevcut bir koda güncelleme de 23505 verir;
    // ProductDetailPage stok kodu düzenlemeye izin veriyor, bu yüzden create
    // ile aynı mesaja eşlenmeli.
    if (error) throw mapStockCodeError(error)
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

// products.stock_code UNIQUE ihlalini kullanıcıya gösterilebilir hataya çevirir.
// Eskiden bu mapper yanlışlıkla listProducts'a bağlıydı; orada bir UNIQUE ihlali
// asla oluşamayacağı için hiç çalışmıyor, buna karşılık ağ/izin hatalarını
// "stok kodu zaten kayıtlı" diye yanlış raporlama riski taşıyordu. Asıl ihtiyacı
// olan createProduct ve updateProduct ham hata fırlatıyordu; bu yüzden
// StocksPage'in `instanceof DuplicateProductStockCodeError` kontrolü hiçbir
// zaman tutmuyor, kullanıcı hep genel mesajı görüyordu.
function mapStockCodeError(error: { code?: string; message: string }): Error {
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