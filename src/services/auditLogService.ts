import { supabase } from '../lib/supabase'
import type { AuditAction, AuditEntityType, AuditLog } from '../types/auditLog'

type AuditRow = {
  id: string
  action: AuditAction
  entity_type: AuditEntityType
  entity_id: string | null
  product_id: string | null
  stock_code: string | null
  stock_name: string | null
  description: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  metadata: Record<string, unknown>
  operation_id: string | null
  created_at: string
  user_id: string | null
}

export type AuditFilter = {
  action?: AuditAction
  entityType?: AuditEntityType
  productId?: string
  query?: string
  from?: string
  to?: string
}

export function createOperationId(): string {
  return crypto.randomUUID()
}

export async function listAuditLogs(filter: AuditFilter = {}): Promise<AuditLog[]> {
  let query = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(500)
  if (filter.action) query = query.eq('action', filter.action)
  if (filter.entityType) query = query.eq('entity_type', filter.entityType)
  if (filter.productId) query = query.eq('product_id', filter.productId)
  if (filter.from) query = query.gte('created_at', filter.from)
  if (filter.to) query = query.lt('created_at', filter.to)
  if (filter.query) query = query.or(`stock_code.ilike.%${filter.query}%,stock_name.ilike.%${filter.query}%,description.ilike.%${filter.query}%`)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row) => mapAudit(row as unknown as AuditRow))
}

function mapAudit(row: AuditRow): AuditLog {
  return {
    id: row.id, action: row.action, entityType: row.entity_type, entityId: row.entity_id,
    productId: row.product_id, stockCode: row.stock_code, stockName: row.stock_name,
    description: row.description, oldData: row.old_data, newData: row.new_data,
    metadata: row.metadata ?? {}, operationId: row.operation_id, createdAt: row.created_at, userId: row.user_id,
  }
}