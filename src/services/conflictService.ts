import { supabase } from '../lib/supabase'
import { fetchAllRows } from '../lib/pagination'
import type { AddressRecord } from '../types/addressRecord'
import type { AddressConflict, ConflictResolution, ConflictStatus, ConflictType, IncomingConflictRecord } from '../types/conflict'
import type { Database } from '../types/database'
import { createOperationId } from './auditLogService'

// Satir tipi artik elle yazilmiyor; src/types/database.ts'ten geliyor, boylece
// sema degistiginde derleme zamaninda yakalanir.
//
// Uretilen tip conflict_type / status / resolution alanlarini `string` olarak
// verir; CHECK constraint'lerini ifade edemez. Bu alanlar veritabaninda
// constraint ile sinirlanmis oldugundan daraltma mapConflict icinde yapilir.
type ConflictRow = Database['public']['Tables']['address_conflicts']['Row']

export type CreateConflictInput = {
  existingRecord: AddressRecord
  incomingRecord: IncomingConflictRecord
}

export async function listPending(): Promise<AddressConflict[]> {
  return listByStatus('pending')
}

// listAll/listByStatus da PostgREST'in 1000 satırlık sessiz sınırına tabidir.
// Conflict tablosu şu an boş olsa da her içe aktarma yeni kayıt üretebiliyor;
// ConflictsPage'in çözülmemiş bir çakışmayı hiç göstermemesi kabul edilemez.
// `created_at` benzersiz olmadığı için `id` ikincil sıralama anahtarı olarak
// ekleniyor.
export async function listAll(): Promise<AddressConflict[]> {
  const rows = await fetchAllRows<ConflictRow>((from, to) =>
    supabase
      .from('address_conflicts')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  )
  return rows.map(mapConflict)
}

export async function listByStatus(status: ConflictStatus): Promise<AddressConflict[]> {
  const rows = await fetchAllRows<ConflictRow>((from, to) =>
    supabase
      .from('address_conflicts')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  )
  return rows.map(mapConflict)
}

export async function getPendingCount(): Promise<number> {
  const { count, error } = await supabase
    .from('address_conflicts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  if (error) throw error
  return count ?? 0
}

export async function getById(id: string): Promise<AddressConflict | undefined> {
  const { data, error } = await supabase.from('address_conflicts').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? mapConflict(data as unknown as ConflictRow) : undefined
}

export async function create(input: CreateConflictInput): Promise<AddressConflict> {
  const existing = input.existingRecord
  const incoming = input.incomingRecord
  const { data: pendingRows, error: duplicateLookupError } = await supabase
    .from('address_conflicts')
    .select('*')
    .eq('status', 'pending')
    .eq('product_id', existing.productId)
  if (duplicateLookupError) throw duplicateLookupError
  const existingPending = (pendingRows ?? []).find((row) => normalizeAddress((row as ConflictRow).incoming_address) === normalizeAddress(incoming.address))
  if (existingPending) return mapConflict(existingPending as unknown as ConflictRow)

  const { data, error } = await supabase.rpc('create_address_conflict', {
    p_conflict_type: 'address-duplicate',
    p_product_id: existing.productId,
    p_stock_code: existing.stockCode,
    p_stock_name: existing.stockName,
    p_address: existing.address,
    p_existing_record_id: existing.id,
    p_existing_stock_code: existing.stockCode,
    p_existing_stock_name: existing.stockName,
    p_existing_address: existing.address,
    p_existing_carton_count: existing.cartonCount,
    p_existing_is_active: existing.isActive,
    p_incoming_stock_code: incoming.stockCode,
    p_incoming_stock_name: incoming.stockName,
    // Supabase tip ureteci, varsayilan degeri olmayan fonksiyon parametrelerini
    // NOT NULL olarak tipler. Bu iki parametre Postgres tarafinda text (nullable)
    // ve address_conflicts.incoming_barcode / incoming_source kolonlari da
    // nullable; null gondermek dogru davranis. Cast yalnizca ureticinin bu
    // eksigini kapatir, calisma zamani davranisi degismez.
    p_incoming_barcode: (incoming.barcode ?? null) as string,
    p_incoming_address: incoming.address.trim(),
    p_incoming_carton_count: incoming.cartonCount,
    p_source: (incoming.source ?? null) as string,
  })
  if (error) throw error
  return mapConflict(data as unknown as ConflictRow)
}

export async function resolveKeepExisting(id: string): Promise<AddressConflict> {
  return resolveWithRpc(id, 'keep-existing')
}

export async function resolveReplaceWithIncoming(id: string): Promise<AddressConflict> {
  return resolveWithRpc(id, 'replace-with-incoming')
}

export async function ignore(id: string): Promise<AddressConflict> {
  return resolveWithRpc(id, 'ignored')
}

async function resolveWithRpc(id: string, action: ConflictResolution): Promise<AddressConflict> {
  const { data, error } = await supabase.rpc('resolve_address_conflict', { conflict_id: id, action, p_operation_id: createOperationId() })
  if (error) throw error
  return mapConflict(data as unknown as ConflictRow)
}

function mapConflict(row: ConflictRow): AddressConflict {
  return {
    id: row.id,
    // address_conflicts_type_check / _status_check / _resolution_check
    // constraint'leri bu degerleri veritabani seviyesinde garanti eder.
    type: row.conflict_type as ConflictType,
    status: row.status as ConflictStatus,
    productId: row.product_id ?? '',
    stockCode: row.stock_code,
    stockName: row.stock_name,
    address: row.address,
    existingRecord: {
      id: row.existing_record_id ?? '',
      productId: row.product_id ?? '',
      stockCode: row.stock_code,
      stockName: row.stock_name,
      address: row.address,
      cartonCount: row.existing_carton_count ?? 0,
      isActive: row.existing_is_active ?? false,
      createdAt: row.existing_created_at ?? row.created_at,
      updatedAt: row.existing_updated_at ?? row.created_at,
    },
    incomingRecord: {
      stockCode: row.incoming_stock_code,
      stockName: row.incoming_stock_name,
      barcode: row.incoming_barcode ?? undefined,
      address: row.incoming_address,
      cartonCount: row.incoming_carton_count,
      source: row.incoming_source ?? undefined,
    },
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
    resolution: (row.resolution as ConflictResolution | null) ?? undefined,
  }
}

function normalizeAddress(value: string): string {
  return value.trim().toLocaleLowerCase('tr-TR')
}