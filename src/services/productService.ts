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

// PostgREST tek istekte en fazla 1000 satır
// döndürür ve bunu hatasız yapar. Sayfalı çekilmezse veri sessizce eksik gelir.
// Bu fonksiyon artık yalnızca dışa aktarma gibi gerçekten tüm veriyi isteyen
// yerlerde kullanılıyor (94.894 üründe ~95 istek).
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
// (20260910085439 migration'ı).
//
// 94.894 üründe ölçüldü: filtresiz gezinme 3,8 ms. Arama ise ayrı bir yol
// kullanıyor — gerekçesi queryProducts içinde.
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

  // Arama varken ve yokken FARKLI yollar kullanılıyor; ikisi de kendi optimal
  // planına sahip. 94.894 üründe ölçüldü:
  //
  //   Arama yok  → view + stock_name index'i          →    3,8 ms
  //   Arama var  → view üzerinden ilike + ORDER BY    → 2.667 ms  ✗
  //   Arama var  → search_products fonksiyonu         →   80 ms   ✓
  //
  // Sebep: ORDER BY + LIMIT, planlayıcıyı trigram index'inden vazgeçirip
  // stock_name btree index'ini yürütüyor ve 83.019 satırı filtreyle eliyor.
  // Fonksiyon içindeki `as materialized` CTE filtreyi önce çalıştırarak bunu
  // engelliyor (bkz. 20260910131409 migration'ı).
  if (trimmedQuery) return searchProductsOnServer(trimmedQuery, filter, sort, page, pageSize)

  let request = supabase.from('products_with_metrics').select(METRICS_SELECT, { count: 'exact' })

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
 * Arama sonuclarini `search_products` fonksiyonundan alir. Fonksiyon toplam
 * sayiyi da her satirda dondurdugu icin ayrica `count` istegi gerekmiyor.
 */
async function searchProductsOnServer(
  query: string,
  filter: ProductListFilter,
  sort: ProductListSort,
  page: number,
  pageSize: number,
): Promise<ProductQueryResult> {
  const { data, error } = await supabase.rpc('search_products', {
    p_query: query,
    p_filter: filter,
    p_sort: sort,
    p_limit: pageSize,
    p_offset: page * pageSize,
  })
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as unknown as Array<{
    id: string; stock_code: string; stock_name: string; is_active: boolean
    address_count: number; total_cartons: number; barcodes: string[] | null; total_count: number
  }>

  return {
    items: rows.map((row) => ({
      id: row.id,
      stockCode: row.stock_code,
      stockName: row.stock_name,
      barcodes: row.barcodes ?? [],
      isActive: row.is_active,
      addressCount: row.address_count ?? 0,
      totalCartons: row.total_cartons ?? 0,
    })),
    // total_count her satırda aynı; satır yoksa sonuç da yok.
    total: rows.length > 0 ? Number(rows[0].total_count) : 0,
  }
}

/**
 * Filtre ciplerindeki sayilar. `product_filter_counts` view'i ucunu tek satirda
 * dondurur ve sayimi kucuk address_records tablosu uzerinden yapar.
 *
 * Eskiden view uzerinde uc ayri `count` sorgusu atiliyordu; her biri 94.894
 * urunu tariyordu (584 ms x 3 = ~1,75 s). Simdi tek sorguda 75 ms.
 */
export async function getProductFilterCounts(): Promise<{ all: number; single: number; multiple: number }> {
  const { data, error } = await supabase.from('product_filter_counts').select('*').single()
  if (error) throw new Error(error.message)
  const row = data as unknown as { all_products: number | null; single_address: number | null; multiple_address: number | null }
  return {
    all: row.all_products ?? 0,
    single: row.single_address ?? 0,
    multiple: row.multiple_address ?? 0,
  }
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