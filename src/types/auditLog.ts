export type AuditAction =
  | 'product-created' | 'product-updated'
  | 'address-created' | 'address-updated' | 'address-activated' | 'address-deactivated' | 'address-deleted'
  | 'import-completed' | 'export-completed' | 'backup-created' | 'backup-restored' | 'data-cleared'
  | 'conflict-created' | 'conflict-kept-existing' | 'conflict-replaced' | 'conflict-ignored'
export type AuditEntityType = 'product' | 'address_record' | 'import' | 'export' | 'backup' | 'conflict' | 'system'

export type AuditLog = {
  id: string
  action: AuditAction
  entityType: AuditEntityType
  entityId: string | null
  productId: string | null
  stockCode: string | null
  stockName: string | null
  description: string
  oldData: Record<string, unknown> | null
  newData: Record<string, unknown> | null
  metadata: Record<string, unknown>
  operationId: string | null
  createdAt: string
  userId: string | null
}