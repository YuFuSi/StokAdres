import { useEffect, useMemo, useState } from 'react'
import { addressRecordService } from '../data/localData'
import { DuplicateActiveAddressError } from '../services/addressRecordService'
import { listProducts } from '../services/productService'
import type { AddressRecord } from '../types/addressRecord'
import type { Product } from '../types/product'
import './AddressesPage.css'

type AddressesPageProps = {
  onBackToDashboard: () => void
}

type AddressFilter = 'all' | 'active' | 'inactive'
type AddressSort = 'address' | 'stock-code' | 'stock-name' | 'carton' | 'updated-at'

export function AddressesPage({ onBackToDashboard }: AddressesPageProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [records, setRecords] = useState<AddressRecord[]>([])
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<AddressFilter>('all')
  const [sort, setSort] = useState<AddressSort>('updated-at')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null)
  const [selectedProductId, setSelectedProductId] = useState('')
  const [address, setAddress] = useState('')
  const [cartonCount, setCartonCount] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const loadData = async (keepRecordId?: string | null) => {
    const [nextProducts, nextRecords] = await Promise.all([listProducts(), addressRecordService.list()])
    setProducts(nextProducts)
    setRecords(nextRecords)
    if (keepRecordId !== undefined) setSelectedRecordId(keepRecordId)
  }

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    Promise.all([listProducts(), addressRecordService.list()])
      .then(([nextProducts, nextRecords]) => {
        if (!isMounted) return
        setProducts(nextProducts)
        setRecords(nextRecords)
      })
      .catch((reason: unknown) => {
        console.error(reason)
        if (isMounted) setError('Adresler yüklenirken bir sorun oluştu.')
      })
      .finally(() => { if (isMounted) setIsLoading(false) })
    return () => { isMounted = false }
  }, [])

  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products])
  const normalizedQuery = query.trim().toLocaleLowerCase('tr-TR')
  const filteredRecords = records
    .filter((record) => filter === 'all' || (filter === 'active' ? record.isActive : !record.isActive))
    .filter((record) => {
      if (!normalizedQuery) return true
      const product = productsById.get(record.productId)
      return [record.address, record.stockCode, record.stockName, product?.barcode ?? '']
        .some((value) => value.toLocaleLowerCase('tr-TR').includes(normalizedQuery))
    })
    .sort((left, right) => compareRecords(left, right, sort))
  const selectedRecord = records.find((record) => record.id === selectedRecordId) ?? null
  const counts = {
    all: records.length,
    active: records.filter((record) => record.isActive).length,
    inactive: records.filter((record) => !record.isActive).length,
  }

  const closeForm = () => {
    setIsFormOpen(false)
    setEditingRecordId(null)
    setFormError('')
  }

  const openCreateForm = () => {
    setEditingRecordId(null)
    setSelectedProductId(selectedRecord?.productId ?? '')
    setAddress('')
    setCartonCount('')
    setIsActive(true)
    setFormError('')
    setIsFormOpen(true)
  }

  const openEditForm = (record: AddressRecord) => {
    setEditingRecordId(record.id)
    setSelectedProductId(record.productId)
    setAddress(record.address)
    setCartonCount(String(record.cartonCount))
    setIsActive(record.isActive)
    setFormError('')
    setIsFormOpen(true)
  }

  const saveRecord = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const product = productsById.get(selectedProductId)
    const parsedCartonCount = Number(cartonCount)
    if (!product || !address.trim() || !Number.isInteger(parsedCartonCount) || parsedCartonCount < 1) {
      setFormError('Ürün, adres ve 1 veya daha fazla koli adedi girin.')
      return
    }

    setIsSaving(true)
    try {
      if (editingRecordId) {
        await addressRecordService.update(editingRecordId, {
          productId: product.id,
          stockCode: product.stockCode,
          stockName: product.stockName,
          address: address.trim(),
          cartonCount: parsedCartonCount,
          isActive,
        })
      } else {
        await addressRecordService.create({
          productId: product.id,
          stockCode: product.stockCode,
          stockName: product.stockName,
          barcode: product.barcode,
          address: address.trim(),
          cartonCount: parsedCartonCount,
          isActive,
        })
      }
      await loadData(editingRecordId ?? selectedRecordId)
      closeForm()
    } catch (reason: unknown) {
      console.error(reason)
      setFormError(reason instanceof DuplicateActiveAddressError
        ? 'Bu ürün ve adres için zaten aktif bir kayıt bulunuyor.'
        : 'Adres kaydı kaydedilemedi. Lütfen tekrar deneyin.')
    } finally {
      setIsSaving(false)
    }
  }

  const deleteRecord = async (record: AddressRecord) => {
    if (!window.confirm('Bu adres kaydı silinsin mi?')) return
    try {
      await addressRecordService.delete(record.id)
      await loadData(selectedRecordId === record.id ? null : selectedRecordId)
      if (selectedRecordId === record.id) setSelectedRecordId(null)
      if (editingRecordId === record.id) closeForm()
    } catch (reason: unknown) {
      console.error(reason)
      setError('Adres kaydı silinemedi. Lütfen tekrar deneyin.')
    }
  }

  return (
    <main className="addresses-page">
      <header className="addresses-page__header">
        <div>
          <p className="intro__eyebrow">ADRES YÖNETİMİ</p>
          <h1>Adresler</h1>
          <p className="addresses-page__description">Ürünlere bağlı adres ve konum kayıtlarının görünümü</p>
        </div>
        <div className="addresses-page__header-actions">
          <button className="button button--primary" type="button" onClick={openCreateForm}>+ Adres Ekle</button>
          <button className="button button--secondary" type="button" onClick={onBackToDashboard}>Dashboard'a dön</button>
        </div>
      </header>

      <section className="addresses-toolbar" aria-label="Adres filtreleri">
        <label className="addresses-search">
          <span aria-hidden="true">⌕</span>
          <span className="visually-hidden">Adres, stok kodu, stok adı veya barkod ara</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Adres, stok kodu, stok adı veya barkod ara..." />
        </label>
        <div className="addresses-filter-group" aria-label="Durum filtreleri">
          <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>Tümü <strong>{counts.all}</strong></FilterButton>
          <FilterButton active={filter === 'active'} onClick={() => setFilter('active')}>Aktif <strong>{counts.active}</strong></FilterButton>
          <FilterButton active={filter === 'inactive'} onClick={() => setFilter('inactive')}>Pasif <strong>{counts.inactive}</strong></FilterButton>
        </div>
        <label className="addresses-sort">Sırala
          <select value={sort} onChange={(event) => setSort(event.target.value as AddressSort)}>
            <option value="updated-at">Güncellenme tarihi</option>
            <option value="address">Adres</option>
            <option value="stock-code">Stok kodu</option>
            <option value="stock-name">Stok adı</option>
            <option value="carton">Koli</option>
          </select>
        </label>
      </section>

      {isLoading && <p className="addresses-state" role="status">Adresler yükleniyor...</p>}
      {!isLoading && error && <p className="addresses-state addresses-state--error" role="alert">{error}</p>}
      {!isLoading && !error && (
        <div className="addresses-layout">
          <section className="addresses-table-panel" aria-label="Adres kayıtları">
            <div className="addresses-table-caption"><span>{filteredRecords.length} kayıt</span><span>Adres bazında görünüm</span></div>
            {records.length === 0 ? <p className="addresses-state">Henüz adres kaydı bulunmuyor.</p> : filteredRecords.length === 0 ? <p className="addresses-state">Aramanızla eşleşen adres bulunamadı.</p> : (
              <div className="addresses-table-wrap">
                <table className="addresses-table">
                  <thead><tr><th>Stok kodu</th><th>Stok adı</th><th>Adres</th><th>Koli</th><th>Durum</th><th>Güncellenme</th></tr></thead>
                  <tbody>{filteredRecords.map((record) => <tr className={selectedRecordId === record.id ? 'addresses-row addresses-row--selected' : 'addresses-row'} key={record.id} onClick={() => { setSelectedRecordId(record.id); closeForm() }}>
                    <td><strong>{record.stockCode}</strong></td><td>{record.stockName}</td><td>{record.address}</td><td>{record.cartonCount}</td><td><StatusBadge isActive={record.isActive} /></td><td>{formatDate(record.updatedAt)}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            )}
          </section>

          {selectedRecord && <aside className="address-detail" aria-label="Adres detayı">
            <div className="address-detail__header"><div><span className="selected-product__label">Adres detayı</span><h2>{selectedRecord.address}</h2><p>{selectedRecord.stockCode}</p></div><button className="modal-close" type="button" onClick={() => { setSelectedRecordId(null); closeForm() }} aria-label="Adres detayını kapat">×</button></div>
            <div className="address-detail__product"><span>Stok kodu<strong>{selectedRecord.stockCode}</strong></span><span>Stok adı<strong>{selectedRecord.stockName}</strong></span></div>
            <div className="address-detail__meta"><span>Adres<strong>{selectedRecord.address}</strong></span><span>Koli<strong>{selectedRecord.cartonCount}</strong></span><span>Durum<StatusBadge isActive={selectedRecord.isActive} /></span></div>
            <div className="address-detail__dates"><span>Oluşturulma<strong>{formatDate(selectedRecord.createdAt)}</strong></span><span>Güncellenme<strong>{formatDate(selectedRecord.updatedAt)}</strong></span></div>
            <div className="address-detail__actions"><button className="button button--secondary" type="button" onClick={() => openEditForm(selectedRecord)}>Düzenle</button><button className="button button--danger" type="button" onClick={() => deleteRecord(selectedRecord)}>Sil</button></div>
            {isFormOpen && <AddressForm products={products} selectedProductId={selectedProductId} setSelectedProductId={setSelectedProductId} address={address} setAddress={setAddress} cartonCount={cartonCount} setCartonCount={setCartonCount} isActive={isActive} setIsActive={setIsActive} isEditing={Boolean(editingRecordId)} isSaving={isSaving} error={formError} onSubmit={saveRecord} onCancel={closeForm} />}
          </aside>}
        </div>
      )}
      {isFormOpen && !selectedRecord && <AddressForm products={products} selectedProductId={selectedProductId} setSelectedProductId={setSelectedProductId} address={address} setAddress={setAddress} cartonCount={cartonCount} setCartonCount={setCartonCount} isActive={isActive} setIsActive={setIsActive} isEditing={Boolean(editingRecordId)} isSaving={isSaving} error={formError} onSubmit={saveRecord} onCancel={closeForm} />}
    </main>
  )
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className={active ? 'addresses-filter addresses-filter--active' : 'addresses-filter'} type="button" onClick={onClick}>{children}</button>
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return <span className={isActive ? 'address-status address-status--active' : 'address-status address-status--inactive'}>{isActive ? 'Aktif' : 'Pasif'}</span>
}

type AddressFormProps = {
  products: Product[]
  selectedProductId: string
  setSelectedProductId: (value: string) => void
  address: string
  setAddress: (value: string) => void
  cartonCount: string
  setCartonCount: (value: string) => void
  isActive: boolean
  setIsActive: (value: boolean) => void
  isEditing: boolean
  isSaving: boolean
  error: string
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onCancel: () => void
}

function AddressForm(props: AddressFormProps) {
  return <form className="address-form-panel" onSubmit={props.onSubmit}>
    <span className="selected-product__label">{props.isEditing ? 'Adres kaydını düzenle' : 'Yeni adres kaydı'}</span>
    <label>Ürün<select value={props.selectedProductId} onChange={(event) => props.setSelectedProductId(event.target.value)} disabled={props.isEditing}><option value="">Ürün seçin</option>{props.products.map((product) => <option value={product.id} key={product.id}>{product.stockCode} · {product.stockName}</option>)}</select></label>
    <label>Adres<input value={props.address} onChange={(event) => props.setAddress(event.target.value)} placeholder="Örn. A1-1" /></label>
    <label>Koli adedi<input type="number" min="1" step="1" value={props.cartonCount} onChange={(event) => props.setCartonCount(event.target.value)} placeholder="Örn. 15" /></label>
    <label className="address-active-toggle"><input type="checkbox" checked={props.isActive} onChange={(event) => props.setIsActive(event.target.checked)} /> Aktif kayıt</label>
    {props.error && <p className="form-error" role="alert">{props.error}</p>}
    <div className="record-actions"><button className="button button--primary" type="submit" disabled={props.isSaving}>{props.isSaving ? 'Kaydediliyor...' : 'Kaydet'}</button><button className="button button--secondary" type="button" onClick={props.onCancel}>Vazgeç</button></div>
  </form>
}

function compareRecords(left: AddressRecord, right: AddressRecord, sort: AddressSort): number {
  if (sort === 'address') return left.address.localeCompare(right.address, 'tr-TR')
  if (sort === 'stock-code') return left.stockCode.localeCompare(right.stockCode, 'tr-TR', { numeric: true })
  if (sort === 'stock-name') return left.stockName.localeCompare(right.stockName, 'tr-TR')
  if (sort === 'carton') return right.cartonCount - left.cartonCount
  return right.updatedAt.localeCompare(left.updatedAt)
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}
