import type {
  AddressRecord,
  CreateAddressRecordInput,
  UpdateAddressRecordInput,
} from '../types/addressRecord'
import { supabase } from '../lib/supabase'
import { fetchAllRows } from '../lib/pagination'
import { planMove, type MovePlan } from '../lib/addressMove'
import { createProduct, DuplicateProductStockCodeError, getProductByStockCode, rollbackCreatedProduct } from './productService'

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

/**
 * Adres kaydı + ilişkili ürün bilgisi. Altı ayrı sorguda aynı şekil kullanılıyor.
 * `as const` şart: supabase-js dönüş tipini select ifadesinin literal tipinden
 * çözüyor, geniş `string` tipiyle çözümleme başarısız oluyor.
 */
const ADDRESS_RECORD_SELECT =
  'id, product_id, address, carton_count, is_active, created_at, updated_at, products!inner(stock_code, stock_name)' as const

export type AddressRecordFilter = 'all' | 'active' | 'inactive'
export type AddressRecordSort = 'address' | 'stock-code' | 'stock-name' | 'carton' | 'updated-at'

export type AddressQueryOptions = {
  query?: string
  filter?: AddressRecordFilter
  sort?: AddressRecordSort
  /** Koridor harfi (adresin ilk harfi); boş = hepsi. */
  aisle?: string
  page?: number
  pageSize?: number
}

export type AddressQueryResult = { items: AddressRecord[]; total: number }

/** `in.(...)` URL'de taşınır; uzun listeler parçalanır. */
const UPDATE_CHUNK = 200

/** Stoklar ekranıyla aynı sayfa boyutu; iki liste aynı ritimde geziliyor. */
export const ADDRESS_PAGE_SIZE = 50

type AddressSearchRow = {
  id: string
  product_id: string
  stock_code: string
  stock_name: string
  address: string
  carton_count: number
  is_active: boolean
  created_at: string
  updated_at: string
  total_count: number
}

export class AddressRecordService {
  async create(input: CreateAddressRecordInput): Promise<AddressRecord> {
    const product = input.productId
      ? { id: input.productId, wasCreated: false }
      : await this.findOrCreateProduct(input)
    const { data, error } = await supabase
      .from('address_records')
      .insert({ product_id: product.id, address: input.address, carton_count: input.cartonCount, is_active: input.isActive ?? true })
      .select(ADDRESS_RECORD_SELECT)
      .single()

    if (error) {
      // Ürünü bu çağrı oluşturduysa ve adres kaydı yazılamadıysa (en olası:
      // aynı ürün+adres için zaten aktif kayıt var → 23505), ürün adressiz ve
      // barkodsuz bir yetim olarak kalırdı. Telafi et.
      if (product.wasCreated) await rollbackCreatedProduct(product.id)
      throw this.mapSupabaseError(error, input.stockCode, input.address)
    }
    return this.mapRecord(data as unknown as AddressRecordRow)
  }

  async getById(id: string): Promise<AddressRecord | undefined> {
    const { data, error } = await supabase
      .from('address_records')
      .select(ADDRESS_RECORD_SELECT)
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    return data ? this.mapRecord(data as unknown as AddressRecordRow) : undefined
  }

  // Bu dört metot eskiden list() ile TÜM adres tablosunu çekip istemcide
  // filtreliyordu. Tek bir ürünün adreslerini görmek için tüm tabloyu indirmek,
  // ürün detay ekranını 100k ölçeğinde kullanılamaz hale getirirdi.
  // Artık filtre veritabanında; address_records.product_id index'li
  // (idx_address_records_product_id).

  async getActiveByStockCode(stockCode: string): Promise<AddressRecord[]> {
    // Gömülü kaynağa filtre: products!inner sayesinde stok koduna göre süzme
    // veritabanında yapılır, ilişkili ürünü olmayan satırlar zaten elenir.
    return this.queryRecords({ stockCode, activeOnly: true })
  }

  async getByProductId(productId: string): Promise<AddressRecord[]> {
    return this.queryRecords({ productId })
  }

  async getActiveByProductId(productId: string): Promise<AddressRecord[]> {
    return this.queryRecords({ productId, activeOnly: true })
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
      .select(ADDRESS_RECORD_SELECT)
      .single()
    if (error) throw this.mapSupabaseError(error, next.stockCode, next.address)
    return this.mapRecord(data as unknown as AddressRecordRow)
  }

  async delete(id: string): Promise<boolean> {
    const { error, count } = await supabase.from('address_records').delete({ count: 'exact' }).eq('id', id)
    if (error) throw error
    return Boolean(count)
  }

  // NOT: Toplu silme/geri yükleme (replaceAll / clear) burada YOK ve
  // eklenmemeli. public.restore_address_records(jsonb, uuid) ve
  // public.clear_address_records(uuid) SECURITY DEFINER olup WHERE'siz
  // `delete from public.address_records` çalıştırıyor; EXECUTE yetkileri
  // Sprint 0.1'de public/anon/authenticated rollerinden geri alındı
  // (20260908000100_revoke_destructive_rpc_grants.sql). Uygulama publishable
  // anahtarı renderer bundle'ına gömdüğü için bu çağrıların istemcide
  // bulunması, dağıtılan exe'nin içinde "tüm tabloyu sil" tarifi taşımak
  // demekti. Toplu geri yükleme gerçekten gerekirse yetkili bir rol altında
  // (sunucu tarafı) yeniden tasarlanmalıdır.

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
        .select(ADDRESS_RECORD_SELECT)
        .order('created_at', { ascending: true })
        .order('id')
        .range(from, to),
    )
    return rows.map((record) => this.mapRecord(record))
  }

  /**
   * Adresler ekranının veri kaynağı: arama, filtre, sıralama ve sayfalama
   * sunucuda (`search_address_records`, 20260910193945).
   *
   * Bu ekran eskiden list() ile tüm tabloyu çekip hepsini istemcide yapıyordu.
   * 2.818 kayıtta çalışıyordu ama adresleme sürüyor (günde ~2.700 kayıt) ve
   * tablo ürün sayısına doğru büyüyor.
   *
   * Toplam sayı her satırda geldiği için ayrıca `count` isteği gerekmiyor.
   */
  async search(options: AddressQueryOptions = {}): Promise<AddressQueryResult> {
    const { query = '', filter = 'all', sort = 'updated-at', aisle = '', page = 0, pageSize = ADDRESS_PAGE_SIZE } = options
    const { data, error } = await supabase.rpc('search_address_records', {
      p_query: query.trim(),
      p_filter: filter,
      p_sort: sort,
      p_limit: pageSize,
      p_offset: page * pageSize,
      p_aisle: aisle,
    })
    if (error) throw new Error(error.message)

    const rows = (data ?? []) as unknown as AddressSearchRow[]
    return {
      items: rows.map((row) => ({
        id: row.id,
        productId: row.product_id,
        stockCode: row.stock_code,
        stockName: row.stock_name,
        address: row.address,
        cartonCount: row.carton_count,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      // total_count her satırda aynı; satır yoksa sonuç da yok.
      total: rows.length > 0 ? Number(rows[0].total_count) : 0,
    }
  }

  /** Bir adresteki AKTİF kayıtlar (büyük/küçük harf yok sayılır). */
  async getActiveByAddress(address: string): Promise<AddressRecord[]> {
    // ilike joker karakterleri (% _) adres değerinde anlam taşımamalı.
    const exact = address.trim().replace(/[\\%_]/g, (char) => `\\${char}`)
    const { data, error } = await supabase
      .from('address_records')
      .select(ADDRESS_RECORD_SELECT)
      .eq('is_active', true)
      .ilike('address', exact)
      .order('created_at')
      .order('id')
    if (error) throw error
    return (data ?? []).map((record) => this.mapRecord(record as unknown as AddressRecordRow))
  }

  /** Taşıma önizlemesi: hiçbir şey yazmaz. */
  async previewMove(from: string, to: string): Promise<MovePlan<AddressRecord>> {
    const [source, destination] = await Promise.all([this.getActiveByAddress(from), this.getActiveByAddress(to)])
    return planMove(source, new Set(destination.map((record) => record.productId)))
  }

  /** Kayıtları tek ifadeyle (atomik) yeni adrese taşır. Parça parça değil: yarım taşıma kalmasın. */
  async moveRecords(ids: string[], toAddress: string): Promise<number> {
    if (ids.length === 0) return 0
    const { data, error } = await supabase.from('address_records').update({ address: toAddress }).in('id', ids).select('id')
    if (error) throw this.mapSupabaseError(error, '', toAddress)
    return data?.length ?? 0
  }

  /** Toplu durum değişikliği. Aktif yapma benzersiz indeksi ihlal ederse hiçbiri yazılmaz. */
  async setActiveMany(ids: string[], isActive: boolean): Promise<number> {
    let changed = 0
    for (let start = 0; start < ids.length; start += UPDATE_CHUNK) {
      const { data, error } = await supabase.from('address_records').update({ is_active: isActive }).in('id', ids.slice(start, start + UPDATE_CHUNK)).select('id')
      if (error) throw this.mapSupabaseError(error, '', '')
      changed += data?.length ?? 0
    }
    return changed
  }

  async deleteMany(ids: string[]): Promise<number> {
    let deleted = 0
    for (let start = 0; start < ids.length; start += UPDATE_CHUNK) {
      const { error, count } = await supabase.from('address_records').delete({ count: 'exact' }).in('id', ids.slice(start, start + UPDATE_CHUNK))
      if (error) throw error
      deleted += count ?? 0
    }
    return deleted
  }

  /** Aynı süzgecin TÜM sonucu (Excel için); sayfa sayfa çeker. */
  async searchAll(options: Omit<AddressQueryOptions, 'page' | 'pageSize'>, onProgress?: (loaded: number) => void): Promise<AddressRecord[]> {
    const pageSize = 1000
    const all: AddressRecord[] = []
    for (let page = 0; ; page += 1) {
      const result = await this.search({ ...options, page, pageSize })
      all.push(...result.items)
      onProgress?.(all.length)
      if (result.items.length < pageSize) return all
    }
  }

  /**
   * Filtre çipleri ve özet şeridi. ARAMADAN BAĞIMSIZ: kullanıcı arama yaparken
   * de deponun geneli görünmeli.
   */
  async getCounts(): Promise<{ all: number; active: number; inactive: number; activeCartons: number }> {
    const { data, error } = await supabase.from('address_record_counts').select('*').single()
    if (error) throw new Error(error.message)
    const row = data as unknown as {
      all_records: number | null; active_records: number | null
      inactive_records: number | null; active_cartons: number | null
    }
    return {
      all: row.all_records ?? 0,
      active: row.active_records ?? 0,
      inactive: row.inactive_records ?? 0,
      activeCartons: row.active_cartons ?? 0,
    }
  }

  /**
   * Genel Bakış'taki "son eklenenler" listesi için yalnızca son N kaydı çeker.
   * Eskiden bu, list() ile tüm tabloyu çekip istemcide sıralayarak yapılıyordu;
   * 100k ölçeğinde beş satır göstermek için tüm tabloyu indirmek anlamsız.
   */
  async listRecent(limit: number): Promise<AddressRecord[]> {
    const { data, error } = await supabase
      .from('address_records')
      .select(ADDRESS_RECORD_SELECT)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data ?? []).map((record) => this.mapRecord(record as unknown as AddressRecordRow))
  }

  /**
   * `wasCreated`, çağıranın telafi yapabilmesi için gerekli: yalnızca bu çağrı
   * ürünü gerçekten oluşturduysa true döner. Var olan ürün bulunduğunda ya da
   * yarış sonucu başka bir çağrı oluşturduğunda false kalır — o ürünü silmek
   * başkasının verisini silmek olurdu.
   */
  private async findOrCreateProduct(input: CreateAddressRecordInput): Promise<{ id: string; wasCreated: boolean }> {
    const existing = await getProductByStockCode(input.stockCode)
    if (existing) {
      return { id: existing.id, wasCreated: false }
    }
    try {
      const created = await createProduct({ stockCode: input.stockCode, stockName: input.stockName })
      return { id: created.id, wasCreated: true }
    } catch (error) {
      if (isUniqueViolation(error)) {
        const product = await getProductByStockCode(input.stockCode)
        if (product) return { id: product.id, wasCreated: false }
      }
      throw error
    }
  }

  /**
   * Filtreli adres sorguları için ortak gövde. Sıralama her yerde aynı
   * (eklenme sırası) ve `id` ikincil anahtar olarak veriliyor ki eşit
   * `created_at` değerlerinde sonuç sırası deterministik kalsın.
   */
  private async queryRecords(filters: {
    productId?: string
    stockCode?: string
    activeOnly?: boolean
  }): Promise<AddressRecord[]> {
    let request = supabase.from('address_records').select(ADDRESS_RECORD_SELECT)
    if (filters.productId) request = request.eq('product_id', filters.productId)
    if (filters.stockCode) request = request.eq('products.stock_code', filters.stockCode)
    if (filters.activeOnly) request = request.eq('is_active', true)

    const { data, error } = await request.order('created_at').order('id')
    if (error) throw error
    return (data ?? []).map((record) => this.mapRecord(record as unknown as AddressRecordRow))
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
