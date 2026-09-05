import { useEffect, useState } from 'react'
import { listAuditLogs, type AuditFilter } from '../services/auditLogService'
import type { AuditAction, AuditEntityType, AuditLog } from '../types/auditLog'
import './AuditLogsPage.css'

const actionLabels: Record<AuditAction, string> = {
  'product-created': 'Ürün oluşturuldu', 'product-updated': 'Ürün güncellendi',
  'address-created': 'Adres eklendi', 'address-updated': 'Adres güncellendi',
  'address-activated': 'Adres aktif edildi', 'address-deactivated': 'Adres pasif edildi', 'address-deleted': 'Adres silindi',
  'import-completed': 'Import tamamlandı', 'export-completed': 'Export tamamlandı',
  'backup-created': 'Backup oluşturuldu', 'backup-restored': 'Backup geri yüklendi', 'data-cleared': 'Veriler temizlendi',
  'conflict-created': 'Çakışma oluşturuldu', 'conflict-kept-existing': 'Çakışmada mevcut korundu',
  'conflict-replaced': 'Çakışma incoming ile değiştirildi', 'conflict-ignored': 'Çakışma yoksayıldı',
}

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)
  const [action, setAction] = useState<AuditAction | ''>('')
  const [entityType, setEntityType] = useState<AuditEntityType | ''>('')
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    setIsLoading(true)
    const filter: AuditFilter = { action: action || undefined, entityType: entityType || undefined, query: query || undefined, from: from ? `${from}T00:00:00.000Z` : undefined, to: to ? `${to}T23:59:59.999Z` : undefined }
    listAuditLogs(filter)
      .then((nextLogs) => { if (mounted) setLogs(nextLogs) })
      .catch((reason: unknown) => { console.error(reason); if (mounted) setError('İşlem geçmişi yüklenirken bir sorun oluştu.') })
      .finally(() => { if (mounted) setIsLoading(false) })
    return () => { mounted = false }
  }, [action, entityType, query, from, to])

  return <main className="audit-page">
    <header className="audit-page__header"><div><p className="intro__eyebrow">SİSTEM</p><h1>İşlem Geçmişi</h1><p className="audit-page__description">Uygulamada gerçekleşen değişikliklerin değiştirilemez kaydı</p></div></header>
    <section className="audit-filters" aria-label="İşlem geçmişi filtreleri">
      <input placeholder="Stok kodu, stok adı veya açıklama ara..." value={query} onChange={(event) => setQuery(event.target.value)} />
      <select value={action} onChange={(event) => setAction(event.target.value as AuditAction | '')}><option value="">Tüm işlemler</option>{Object.entries(actionLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
      <select value={entityType} onChange={(event) => setEntityType(event.target.value as AuditEntityType | '')}><option value="">Tüm varlıklar</option><option value="product">Ürün</option><option value="address_record">Adres</option><option value="conflict">Çakışma</option><option value="import">Import</option><option value="export">Export</option><option value="backup">Backup</option></select>
      <label>Başlangıç<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>Bitiş<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
    </section>
    {isLoading && <p className="audit-state" role="status">İşlem geçmişi yükleniyor...</p>}
    {!isLoading && error && <p className="audit-state audit-state--error" role="alert">{error}</p>}
    {!isLoading && !error && <div className="audit-layout"><section className="audit-table-panel" aria-label="İşlem kayıtları"><div className="audit-table-caption">{logs.length} işlem</div>{logs.length === 0 ? <p className="audit-state">Henüz işlem kaydı bulunmuyor.</p> : <div className="audit-table-wrap"><table className="audit-table"><thead><tr><th>Tarih</th><th>İşlem</th><th>Ürün</th><th>Açıklama</th></tr></thead><tbody>{logs.map((log) => <tr className={selectedLog?.id === log.id ? 'audit-row audit-row--selected' : 'audit-row'} key={log.id} onClick={() => setSelectedLog(log)}><td>{formatDate(log.createdAt)}</td><td>{actionLabels[log.action]}</td><td>{log.stockCode ?? '-'}</td><td>{log.description}</td></tr>)}</tbody></table></div>}</section>{selectedLog && <aside className="audit-detail" aria-label="İşlem detayı"><div className="audit-detail__header"><div><span className="selected-product__label">İşlem detayı</span><h2>{actionLabels[selectedLog.action]}</h2></div><button className="modal-close" type="button" onClick={() => setSelectedLog(null)} aria-label="İşlem detayını kapat">×</button></div><p>{selectedLog.description}</p><span className="audit-detail__date">{formatDate(selectedLog.createdAt)}</span><Compare title="Önceki değer" value={selectedLog.oldData} /><Compare title="Yeni değer" value={selectedLog.newData} /><Compare title="Metadata" value={selectedLog.metadata} /></aside>}</div>}
  </main>
}

function Compare({ title, value }: { title: string; value: Record<string, unknown> | null }) { return <section className="audit-json"><h3>{title}</h3><pre>{value ? JSON.stringify(value, null, 2) : 'Veri yok'}</pre></section> }
function formatDate(value: string): string { return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
