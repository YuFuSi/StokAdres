import { useEffect, useState } from 'react'
import {
  getPendingCount,
  listAll,
  resolveKeepExisting,
  resolveReplaceWithIncoming,
  ignore,
} from '../services/conflictService'
import type { AddressConflict, ConflictStatus } from '../types/conflict'
import './ConflictsPage.css'

type ConflictFilter = 'pending' | 'resolved' | 'ignored' | 'all'

export function ConflictsPage() {
  const [conflicts, setConflicts] = useState<AddressConflict[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<ConflictFilter>('pending')
  const [pendingCount, setPendingCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isResolving, setIsResolving] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  const loadConflicts = async () => {
    const [nextConflicts, nextPendingCount] = await Promise.all([listAll(), getPendingCount()])
    setConflicts(nextConflicts)
    setPendingCount(nextPendingCount)
    setSelectedId((current) => current && nextConflicts.some((conflict) => conflict.id === current) ? current : null)
  }

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    loadConflicts()
      .catch((reason: unknown) => {
        console.error(reason)
        if (isMounted) setError('Çakışmalar yüklenirken bir sorun oluştu.')
      })
      .finally(() => { if (isMounted) setIsLoading(false) })
    return () => { isMounted = false }
  }, [])

  const visibleConflicts = conflicts.filter((conflict) => filter === 'all' || conflict.status === filter)
  const selectedConflict = conflicts.find((conflict) => conflict.id === selectedId) ?? null
  const counts = {
    pending: conflicts.filter((conflict) => conflict.status === 'pending').length,
    resolved: conflicts.filter((conflict) => conflict.status === 'resolved').length,
    ignored: conflicts.filter((conflict) => conflict.status === 'ignored').length,
  }

  const resolve = async (action: 'keep' | 'replace' | 'ignore') => {
    if (!selectedConflict || selectedConflict.status !== 'pending') return
    setIsResolving(true)
    setError('')
    setFeedback('')
    try {
      if (action === 'keep') await resolveKeepExisting(selectedConflict.id)
      if (action === 'replace') await resolveReplaceWithIncoming(selectedConflict.id)
      if (action === 'ignore') await ignore(selectedConflict.id)
      await loadConflicts()
      setFeedback(action === 'keep' ? 'Mevcut kayıt korundu.' : action === 'replace' ? 'Yeni kayıtla değiştirildi.' : 'Çakışma yoksayıldı.')
    } catch (reason: unknown) {
      console.error(reason)
      setError('Çakışma çözülemedi. Lütfen tekrar deneyin.')
    } finally {
      setIsResolving(false)
    }
  }

  return (
    <main className="conflicts-page">
      <header className="conflicts-page__header">
        <div><p className="intro__eyebrow">VERİ KONTROLÜ</p><h1>Çakışmalar</h1><p className="conflicts-page__description">İçe aktarımlardan bekleyen ürün ve adres çakışmaları</p></div>
        <span className="conflicts-pending-badge">{pendingCount} bekleyen</span>
      </header>
      <div className="conflicts-filter-bar">
        <FilterButton active={filter === 'pending'} onClick={() => setFilter('pending')}>Bekleyen <strong>{counts.pending}</strong></FilterButton>
        <FilterButton active={filter === 'resolved'} onClick={() => setFilter('resolved')}>Çözülen <strong>{counts.resolved}</strong></FilterButton>
        <FilterButton active={filter === 'ignored'} onClick={() => setFilter('ignored')}>Yoksayılan <strong>{counts.ignored}</strong></FilterButton>
        <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>Tümü <strong>{conflicts.length}</strong></FilterButton>
      </div>
      {feedback && <p className="conflicts-feedback" role="status">{feedback}</p>}
      {isLoading && <p className="conflicts-state" role="status">Çakışmalar yükleniyor...</p>}
      {!isLoading && error && <p className="conflicts-state conflicts-state--error" role="alert">{error}</p>}
      {!isLoading && !error && (
        <div className="conflicts-layout">
          <section className="conflicts-table-panel" aria-label="Çakışma listesi">
            <div className="conflicts-table-caption"><span>{visibleConflicts.length} çakışma</span><span>Conflict merkezi</span></div>
            {visibleConflicts.length === 0 ? <p className="conflicts-state">Çakışma bulunmuyor.</p> : <div className="conflicts-table-wrap"><table className="conflicts-table"><thead><tr><th>Stok kodu</th><th>Stok adı</th><th>Adres</th><th>Mevcut koli</th><th>Yeni koli</th><th>Tarih</th><th>Durum</th></tr></thead><tbody>{visibleConflicts.map((conflict) => <tr className={selectedId === conflict.id ? 'conflicts-row conflicts-row--selected' : 'conflicts-row'} key={conflict.id} onClick={() => setSelectedId(conflict.id)}><td><strong>{conflict.stockCode}</strong></td><td>{conflict.stockName}</td><td>{conflict.address}</td><td>{conflict.existingRecord.cartonCount}</td><td>{conflict.incomingRecord.cartonCount}</td><td>{formatDate(conflict.createdAt)}</td><td><Status status={conflict.status} /></td></tr>)}</tbody></table></div>}
          </section>
          {selectedConflict && <aside className="conflict-detail" aria-label="Çakışma detayı"><div className="conflict-detail__header"><div><span className="selected-product__label">Çakışma detayı</span><h2>{selectedConflict.stockCode}</h2><p>{selectedConflict.address}</p></div><button className="modal-close" type="button" onClick={() => setSelectedId(null)} aria-label="Çakışma detayını kapat">×</button></div><div className="conflict-comparison"><Comparison title="Mevcut kayıt" record={selectedConflict.existingRecord} /><Comparison title="Yeni kayıt" record={{ ...selectedConflict.existingRecord, stockCode: selectedConflict.incomingRecord.stockCode, stockName: selectedConflict.incomingRecord.stockName, address: selectedConflict.incomingRecord.address, cartonCount: selectedConflict.incomingRecord.cartonCount }} incomingBarcode={selectedConflict.incomingRecord.barcode} source={selectedConflict.incomingRecord.source} /></div>{selectedConflict.status === 'pending' && <div className="conflict-actions"><button className="button button--secondary" type="button" onClick={() => resolve('keep')} disabled={isResolving}>Mevcut Kalsın</button><button className="button button--primary" type="button" onClick={() => resolve('replace')} disabled={isResolving}>Yeni Kayıtla Değiştir</button><button className="button button--danger" type="button" onClick={() => resolve('ignore')} disabled={isResolving}>Yoksay</button></div>}</aside>}
        </div>
      )}
    </main>
  )
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className={active ? 'conflict-filter conflict-filter--active' : 'conflict-filter'} type="button" onClick={onClick}>{children}</button>
}

function Status({ status }: { status: ConflictStatus }) {
  return <span className={`conflict-status conflict-status--${status}`}>{status === 'pending' ? 'Bekleyen' : status === 'resolved' ? 'Çözülen' : 'Yoksayılan'}</span>
}

function Comparison({ title, record, incomingBarcode, source }: { title: string; record: { stockCode: string; stockName: string; address: string; cartonCount: number; isActive: boolean; updatedAt: string }; incomingBarcode?: string; source?: string }) {
  return <div className="conflict-comparison__block"><h3>{title}</h3><span>Stok kodu<strong>{record.stockCode}</strong></span><span>Stok adı<strong>{record.stockName}</strong></span><span>Adres<strong>{record.address}</strong></span><span>Koli<strong>{record.cartonCount}</strong></span><span>Durum<strong>{record.isActive ? 'Aktif' : 'Pasif'}</strong></span><span>Güncelleme<strong>{formatDate(record.updatedAt)}</strong></span>{incomingBarcode && <span>Barkod<strong>{incomingBarcode}</strong></span>}{source && <span>Kaynak<strong>{source}</strong></span>}</div>
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}
