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

// ---------------------------------------------------------------------------
// Sunucu tarafı listeleme — Faz 1.1
//
// listProducts() tüm tabloyu çeker. 1.677 satırda sorunsuz; 100.000 satırda
// ~33 MB demek ve her ekran açılışında bunu indirmek, kullanıcının kaçmak
// istediği Excel donmasının aynısını üretir.
//
// Bu yüzden liste ekranları aşağıdaki sayfalı sorguyu kullanır. Arama, filtre
// ve sıralama veritabanında yapılır; istemciye yalnızca görünen sayfa iner.
// listProducts() SİLİNMEDİ — dışa aktarma gibi gerçekten tüm veriyi isteyen
// yerler onu kullanmaya devam ediyor.
//
// `products_with_metrics` view'ı adres/koli sayılarını veritabanında hesaplar
// (20260910000100 migration'ı). Ölçüldü: 1.677 satırda trigram index'leriyle
// arama 1.4 ms ve plan Bitmap Index Scan kullanıyor, sequential scan değil.
// ---------------------------------------------------------------------------

export type ProductListFilter = 'all' | 'single-address' | 'multiple-addresses'
export type ProductListSort = 'stock-name' | 'stock-code' | 'address-count' | 'carton-count'

export type ProductListItem = Product & {
  addressCount: number
  totalCartons: number
}

export type ProductQueryOptions = {
  query?: string
  filter?: ProductListFilter
  sort?: ProductListSort
  page?: number
  pageSize?: number
}

export type ProductQueryResult = {
  items: ProductListItem[]
  total: number
}

export const PRODUCT_PAGE_SIZE = 50

type ProductMetricsRow = ProductRow & {
  address_count: number
  total_cartons: number
}

const METRICS_SELECT =
  'id, stock_code, stock_name, is_active, created_at, updated_at, address_count, total_cartons, product_barcodes(barcode)'

export async function queryProducts(options: ProductQueryOptions = {}): Promise<ProductQueryResult> {
  const { query = '', filter = 'all', sort = 'stock-name', page = 0, pageSize = PRODUCT_PAGE_SIZE } = options
  const trimmedQuery = query.trim()

  let request = supabase.from('products_with_metrics').select(METRICS_SELECT, { count: 'exact' })

  if (trimmedQuery) {
    // PostgREST `or` gömülü kaynaklara (product_barcodes) uzanamadığı için
    // barkodlar önce ürün id'sine çevrilir, sonra aynı `or` ifadesine katılır.
    // Böylece stok kodu / stok adı / barkod tek bir sayfalı sorguda aranır.
    const escaped = escapeForPostgrestPattern(trimmedQuery)
    const conditions = [`stock_code.ilike.*${escaped}*`, `stock_name.ilike.*${escaped}*`]

    const barcodeProductIds = await findProductIdsByBarcode(trimmedQuery)
    if (barcodeProductIds.length > 0) conditions.push(`id.in.(${barcodeProductIds.join(',')})`)

    request = request.or(conditions.join(','))
  }

  if (filter === 'single-address') request = request.eq('address_count', 1)
  if (filter === 'multiple-addresses') request = request.gt('address_count', 1)

  // Her sıralamaya `id` ikincil anahtar olarak ekleniyor: eşit değerli satırlar
  // sayfalar arasında kayarsa kayıt kaybolur veya tekrarlanır.
  if (sort === 'stock-code') request = request.order('stock_code').order('id')
  else if (sort === 'address-count') request = request.order('address_count', { ascending: false }).order('stock_name').order('id')
  else if (sort === 'carton-count') request = request.order('total_cartons', { ascending: false }).order('stock_name').order('id')
  else request = request.order('stock_name').order('id')

  const from = page * pageSize
  const { data, error, count } = await request.range(from, from + pageSize - 1)
  if (error) throw new Error(error.message)

  return {
    items: ((data ?? []) as unknown as ProductMetricsRow[]).map(mapProductListItem),
    total: count ?? 0,
  }
}

/**
 * Filtre çiplerindeki sayılar aramadan bağımsızdır (ekranda hep toplam gösterilir),
 * bu yüzden sayfa sorgusundan ayrı ve tek sefer çekilir. `head: true` satır
 * döndürmez, yalnızca sayıyı getirir — 100k'da bile ucuz.
 */
export async function getProductFilterCounts(): Promise<{ all: number; single: number; multiple: number }> {
  const countQuery = () => supabase.from('products_with_metrics').select('id', { count: 'exact', head: true })

  const [all, single, multiple] = await Promise.all([
    countQuery(),
    countQuery().eq('address_count', 1),
    countQuery().gt('address_count', 1),
  ])

  const firstError = [all, single, multiple].find((result) => result.error)?.error
  if (firstError) throw new Error(firstError.message)

  return { all: all.count ?? 0, single: single.count ?? 0, multiple: multiple.count ?? 0 }
}

async function findProductIdsByBarcode(query: string): Promise<string[]> {
  // Barkodlar yalnızca rakamdan oluşur. Harfli bir sorgu (ör. "TOHANA") hiçbir
  // barkodla eşleşemeyeceği için isteği hiç atmıyoruz — arama başına bir tam
  // gidiş-dönüş tasarrufu. Sayısal stok kodları da (ör. "025019") rakam içerdiği
  // için bu kontrolden geçer, dolayısıyla onlar etkilenmez.
  if (!/\d/.test(query)) return []

  const { data, error } = await supabase
    .from('product_barcodes')
    .select('product_id')
    .ilike('barcode', `%${escapeForPostgrestPattern(query)}%`)
    .limit(200)
  // Barkod araması yardımcı bir yol; başarısız olursa asıl aramayı düşürmek
  // yerine sessizce atlanır.
  if (error) return []
  return [...new Set((data ?? []).map((row) => (row as { product_id: string }).product_id))]
}

/**
 * PostgREST `or=(...)` ifadesinde virgül koşulları, parantez ise grubu ayırır;
 * `*` de joker karakterdir. Kullanıcı bu karakterleri yazarsa filtre bozulur,
 * bu yüzden temizleniyor.
 */
function escapeForPostgrestPattern(value: string): string {
  return value.replace(/[(),*\\]/g, ' ').trim()
}

function mapProductListItem(row: ProductMetricsRow): ProductListItem {
  return {
    ...mapProduct(row),
    addressCount: row.address_count ?? 0,
    totalCartons: row.total_cartons ?? 0,
  }
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