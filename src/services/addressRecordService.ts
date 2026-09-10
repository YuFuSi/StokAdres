import type {
  AddressRecord,
  CreateAddressRecordInput,
  UpdateAddressRecordInput,
} from '../types/addressRecord'
import type { Product } from '../types/product'
import { supabase } from '../lib/supabase'
import { fetchAllRows } from '../lib/pagination'
import { createProduct, DuplicateProductStockCodeError, getProductByStockCode, listProducts } from './productService'

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

/**
 * Toplu silme/geri yükleme yetenekleri Sprint 0.1'de istemci tarafından
 * kaldırıldı. Detaylı gerekçe AddressRecordService.replaceAll/clear üzerinde.
 */
export class DestructiveOperationUnavailableError extends Error {
  constructor(operation: string) {
    super(
      `${operation} işlemi bu uygulamadan kullanılamıyor. Tüm adres kayıtlarını tek seferde silen bu yetenek güvenlik nedeniyle kaldırıldı.`,
    )
    this.name = 'DestructiveOperationUnavailableError'
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

  async getActiveByProductId(productId: string): Promise<AddressRecord[]> {
    const records = await this.getByProductId(productId)
    return records.filter((record) => record.isActive)
  }

  async getByStockCode(stockCode: string): Promise<AddressRecord | undefined> {
    return (await this.getActiveByStockCode(stockCode))[0]
  }

  async update(id: string, input: UpdateAddressRecordInput): Promise<AddressRecord> {
    const existing = await this.getById(id)
    if (!existing) throw new AddressRecordNotFoundError(id)
    const next = { ...existing, ...input }
    const product = input.productId || input.stockCode || input.stockName
      ? { id: input.productId ?? (await this.findOrCreateProduct({ stockCode: next.stockCode, stockName: next.stockName, address: next.address, cartonCount: next.cartonCount })).id }
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

  // Sprint 0.1'de public.restore_address_records(jsonb, uuid) ve
  // public.clear_address_records(uuid) fonksiyonlarının EXECUTE yetkisi
  // public/anon/authenticated rollerinden geri alındı
  // (20260908_revoke_destructive_rpc_grants.sql). Her ikisi de SECURITY DEFINER
  // ve WHERE'siz `delete from public.address_records` çalıştırıyor; uygulama
  // publishable anahtarı renderer bundle'ına gömdüğü için installer'ı eline
  // geçiren herkes tüm adres verisini silebiliyordu.
  //
  // Bu iki metot yalnızca src/pages/HomePage.tsx'ten çağrılıyor ve HomePage
  // erişilebilir değil: src/App.tsx:35 onu ancak activePage AppPage
  // birleşimindeki 9 değerin hiçbiri değilken render ediyor, ki bu imkânsız.
  // Yani hiçbir kullanıcı akışı etkilenmiyor.
  //
  // RPC çağrıları burada bilerek KALDIRILDI, geri getirilmedi:
  //   * Çağrı bırakılsaydı yetki reddi ham bir Postgres hatası olarak
  //     ("permission denied for function ...") kullanıcıya yansırdı.
  //   * Ayrıca bu iki fonksiyonun adı ve parametre şekli, dağıtılan renderer
  //     bundle'ında iki adet "tüm tabloyu sil" fonksiyonunun tarifi olarak
  //     duruyordu. Çağrıyı kaldırmak bu haritayı bundle'dan da siliyor.
  //
  // Yeni bir yıkıcı RPC AÇILMADI ve eski yetkiler geri verilmedi. Toplu geri
  // yükleme/temizleme gerçekten gerekirse, ayrı bir yetkili rol altında
  // (Phase 8 admin rolü veya sunucu tarafı) yeniden tasarlanmalıdır.
  async replaceAll(_records: AddressRecord[]): Promise<void> {
    throw new DestructiveOperationUnavailableError('Yedekten toplu geri yükleme')
  }

  async clear(): Promise<void> {
    throw new DestructiveOperationUnavailableError('Tüm adres verilerini temizleme')
  }

  // PostgREST tek istekte en fazla 1000 satır döndürür ve sınıra takıldığında
  // hata vermez. Bu liste dashboard sayaçlarının, stok/adres ekranlarının ve
  // dışa aktarmanın tek veri kaynağı olduğu için sayfalı çekiliyor: tablo
  // 1000 kaydı aştığında uygulamanın sessizce eksik veri göstermemesi gerekir.
  //
  // `created_at` benzersiz değildir (toplu içe aktarmalar aynı damgayı
  // üretebilir), bu yüzden sayfalar arası sıralamanın kararlı kalması için
  // ikincil anahtar olarak `id` ekleniyor.
  async list(): Promise<AddressRecord[]> {
    const rows = await fetchAllRows<AddressRecordRow>((from, to) =>
      supabase
        .from('address_records')
        .select('id, product_id, address, carton_count, is_active, created_at, updated_at, products!inner(stock_code, stock_name)')
        .order('created_at', { ascending: true })
        .order('id')
        .range(from, to),
    )
    return rows.map((record) => this.mapRecord(record))
  }

  async listProducts(): Promise<Product[]> {
    return listProducts()
  }

  private async findOrCreateProduct(input: CreateAddressRecordInput): Promise<{ id: string }> {
    const existing = await getProductByStockCode(input.stockCode)
    if (existing) {
      return { id: existing.id }
    }
    try {
      const created = await createProduct({ stockCode: input.stockCode, stockName: input.stockName })
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

// createProduct artık stok kodu çakışmasını DuplicateProductStockCodeError'a
// eşliyor; o hatanın `code` alanı yok. Yalnızca ham 23505'e bakmak, iki istek
// aynı stok kodunu aynı anda oluşturmaya çalıştığındaki kurtarma yolunu sessizce
// devre dışı bırakırdı. Her iki biçim de burada tanınmalı.
function isUniqueViolation(error: unknown): boolean {
  if (error instanceof DuplicateProductStockCodeError) return true
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505')
}
