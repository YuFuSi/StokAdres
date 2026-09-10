import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, MapPin, MoreHorizontal, Plus, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { addressRecordService } from '../data/localData'
import { DuplicateActiveAddressError } from '../services/addressRecordService'
import { queryProducts, type ProductListItem } from '../services/productService'
import type { AddressRecord } from '../types/addressRecord'
import type { Product } from '../types/product'
import './AddressesPage.css'

type AddressesPageProps = {
  onBackToDashboard: () => void
  initialSelectedRecordId?: string | null
}

type AddressFilter = 'all' | 'active' | 'inactive'
type AddressSort = 'address' | 'stock-code' | 'stock-name' | 'carton' | 'updated-at'

// Stoklar ekranıyla aynı sayfa boyutu (PRODUCT_PAGE_SIZE), böylece iki liste
// aynı ritimde geziliyor.
const ADDRESS_PAGE_SIZE = 50

export function AddressesPage({ onBackToDashboard, initialSelectedRecordId = null }: AddressesPageProps) {
  const [barcodesByProductId, setBarcodesByProductId] = useState<Map<string, string[]>>(new Map())
  const [records, setRecords] = useState<AddressRecord[]>([])
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(initialSelectedRecordId)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<AddressFilter>('all')
  const [sort, setSort] = useState<AddressSort>('updated-at')
  const [page, setPage] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null)
  const [selectedProductId, setSelectedProductId] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<ProductListItem | null>(null)
  const [address, setAddress] = useState('')
  const [cartonCount, setCartonCount] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Bu ekran eskiden listProducts() ile TÜM ürünleri çekiyordu. 94.894 üründe
  // bu 1.000'erlik 95 istek (~95 saniye) demek. Adres kayıtları stok kodu ve
  // adını zaten gömülü getirdiği için ürün listesine gerek yok; yalnızca
  // aramada kullanılan barkodlar, görünen kayıtların ürünleri için çekiliyor.
  const loadData = async (keepRecordId?: string | null) => {
    const nextRecords = await addressRecordService.list()
    setRecords(nextRecords)
    setBarcodesByProductId(await findBarcodesFor(nextRecords))
    if (keepRecordId !== undefined) setSelectedRecordId(keepRecordId)
  }

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    addressRecordService.list()
      .then(async (nextRecords) => {
        if (!isMounted) return
        setRecords(nextRecords)
        setSelectedRecordId(initialSelectedRecordId)
        const barcodes = await findBarcodesFor(nextRecords)
        if (isMounted) setBarcodesByProductId(barcodes)
      })
      .catch((reason: unknown) => {
        console.error(reason)
        if (isMounted) setError('Adresler yüklenirken bir sorun oluştu.')
      })
      .finally(() => { if (isMounted) setIsLoading(false) })
    return () => { isMounted = false }
  }, [])
  const normalizedQuery = query.trim().toLocaleLowerCase('tr-TR')
  const filteredRecords = records
    .filter((record) => filter === 'all' || (filter === 'active' ? record.isActive : !record.isActive))
    .filter((record) => {
      if (!normalizedQuery) return true
      return [record.address, record.stockCode, record.stockName, ...(barcodesByProductId.get(record.productId) ?? [])]
        .some((value) => value.toLocaleLowerCase('tr-TR').includes(normalizedQuery))
    })
    .sort((left, right) => compareRecords(left, right, sort))

  // Kayıtların tamamı bellekte tutuluyor (filtre, sıralama ve arama istemcide
  // ve anında); DOM'a ise yalnızca bir sayfa basılıyor. Eskiden tüm liste alt
  // alta çiziliyordu — 2.800 kayıtta ekran ağırlaşıyordu.
  //
  // NOT: Adres kaydı sayısı ~20.000'i geçerse bu ekran da Stoklar gibi sunucu
  // tarafı sayfalamaya taşınmalı (filtre/sıralama/arama da sunucuya gider).
  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / ADDRESS_PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageStart = safePage * ADDRESS_PAGE_SIZE
  const visibleRecords = filteredRecords.slice(pageStart, pageStart + ADDRESS_PAGE_SIZE)

  // Filtre/arama/sıralama değişince ilk sayfaya dön; yoksa kullanıcı boş bir
  // sayfada kalabiliyor.
  useEffect(() => { setPage(0) }, [query, filter, sort])

  const selectedRecord = records.find((record) => record.id === selectedRecordId) ?? null
  const counts = {
    all: records.length,
    active: records.filter((record) => record.isActive).length,
    inactive: records.filter((record) => !record.isActive).length,
  }
  const totalCartons = records.filter((record) => record.isActive).reduce((sum, record) => sum + record.cartonCount, 0)

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
    const product = selectedProduct
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
          <p className="intro__eyebrow">OPERASYON / FİZİKSEL KONUM</p>
          <h1>Adresler</h1>
          <p className="addresses-page__description">Depodaki fiziksel konumları yönetin.</p>
        </div>
        <div className="addresses-page__header-actions">
          <button className="button button--primary" type="button" onClick={openCreateForm}><Plus size={15}/> Adres Ekle</button>
        </div>
      </header>

      <section className="addresses-toolbar" aria-label="Adres filtreleri">
        <label className="addresses-search">
          <Search size={17} aria-hidden="true" />
          <span className="visually-hidden">Adres, stok kodu, stok adı veya barkod ara</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Adres veya stok kodu ara..." />
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

      <section className="address-summary-strip" aria-label="Adres operasyon özeti">
        <SummaryMetric label="Toplam adres" value={counts.all} />
        <SummaryMetric label="Aktif" value={counts.active} />
        <SummaryMetric label="Pasif" value={counts.inactive} />
        <SummaryMetric label="Toplam koli" value={totalCartons} />
      </section>

      {isLoading && <p className="addresses-state" role="status">Adresler yükleniyor...</p>}
      {!isLoading && error && <p className="addresses-state addresses-state--error" role="alert">{error}</p>}
      {!isLoading && !error && (
        <div className={`addresses-layout ${selectedRecord ? 'addresses-layout--detail-open' : ''}`}>
          <section className="addresses-table-panel" aria-label="Adres kayıtları">
            <div className="addresses-table-caption"><span>{filteredRecords.length === 0 ? '0 kayıt' : `${pageStart + 1}-${pageStart + visibleRecords.length} / ${filteredRecords.length} kayıt`}</span><span>Adres bazında görünüm · satıra tıklayarak ayrıntıyı açın</span></div>
            {records.length === 0 ? <p className="addresses-state">Henüz adres kaydı bulunmuyor.</p> : filteredRecords.length === 0 ? <p className="addresses-state">Aramanızla eşleşen adres bulunamadı.</p> : (
              <>
              <div className="addresses-table-wrap">
                <table className="addresses-table">
                  <thead><tr><th>Adres</th><th>Stok kodu</th><th>Stok adı</th><th>Koli</th><th>Durum</th><th>Güncellenme</th><th aria-label="Aksiyon" /></tr></thead>
                  <tbody>{visibleRecords.map((record) => <tr className={selectedRecordId === record.id ? 'addresses-row addresses-row--selected' : 'addresses-row'} key={record.id} onClick={() => { setSelectedRecordId(record.id); closeForm() }}>
                    <td><span className="address-cell"><MapPin size={14}/>{record.address}</span></td><td><strong>{record.stockCode}</strong></td><td className="address-product-name">{record.stockName}</td><td><strong className="carton-cell">{record.cartonCount}</strong></td><td><StatusBadge isActive={record.isActive} /></td><td>{formatDate(record.updatedAt)}</td><td><button className="address-row-action" type="button" aria-label={`${record.address} ayrıntısını aç`} onClick={(event) => { event.stopPropagation(); setSelectedRecordId(record.id); closeForm() }}><MoreHorizontal size={17}/></button></td>
                  </tr>)}</tbody>
                </table>
              </div>
              {pageCount > 1 && (
                <div className="addresses-pagination">
                  <button className="button button--secondary" type="button" disabled={safePage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}><ChevronLeft size={15} /> Önceki</button>
                  <span>Sayfa {safePage + 1} / {pageCount}</span>
                  <button className="button button--secondary" type="button" disabled={safePage + 1 >= pageCount} onClick={() => setPage((current) => current + 1)}>Sonraki <ChevronRight size={15} /></button>
                </div>
              )}
              </>
            )}
          </section>

          {selectedRecord && <aside className="address-detail" aria-label="Adres detayı">
            <div className="address-detail__header"><div><span className="selected-product__label">Adres detayı</span><h2>{selectedRecord.address}</h2><p>{selectedRecord.stockCode}</p></div><button className="modal-close" type="button" onClick={() => { setSelectedRecordId(null); closeForm() }} aria-label="Adres detayını kapat">×</button></div>
            <div className="address-detail__product"><span>Stok kodu<strong>{selectedRecord.stockCode}</strong></span><span>Stok adı<strong>{selectedRecord.stockName}</strong></span></div>
            <div className="address-detail__meta"><span>Adres<strong>{selectedRecord.address}</strong></span><span>Koli<strong>{selectedRecord.cartonCount}</strong></span><span>Durum<StatusBadge isActive={selectedRecord.isActive} /></span></div>
            <div className="address-detail__dates"><span>Oluşturulma<strong>{formatDate(selectedRecord.createdAt)}</strong></span><span>Güncellenme<strong>{formatDate(selectedRecord.updatedAt)}</strong></span></div>
            <div className="address-detail__actions"><button className="button button--secondary" type="button" onClick={() => openEditForm(selectedRecord)}>Düzenle</button><button className="button button--danger" type="button" onClick={() => deleteRecord(selectedRecord)}>Sil</button></div>
            {isFormOpen && <AddressForm selectedProduct={selectedProduct} setSelectedProduct={setSelectedProduct} setSelectedProductId={setSelectedProductId} address={address} setAddress={setAddress} cartonCount={cartonCount} setCartonCount={setCartonCount} isActive={isActive} setIsActive={setIsActive} isEditing={Boolean(editingRecordId)} isSaving={isSaving} error={formError} onSubmit={saveRecord} onCancel={closeForm} />}
          </aside>}
        </div>
      )}
      {isFormOpen && !selectedRecord && <AddressForm selectedProduct={selectedProduct} setSelectedProduct={setSelectedProduct} setSelectedProductId={setSelectedProductId} address={address} setAddress={setAddress} cartonCount={cartonCount} setCartonCount={setCartonCount} isActive={isActive} setIsActive={setIsActive} isEditing={Boolean(editingRecordId)} isSaving={isSaving} error={formError} onSubmit={saveRecord} onCancel={closeForm} />}
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
  selectedProduct: ProductListItem | null
  setSelectedProduct: (product: ProductListItem | null) => void
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
    <ProductPicker
      selected={props.selectedProduct}
      onSelect={(product) => { props.setSelectedProduct(product); props.setSelectedProductId(product?.id ?? '') }}
      disabled={props.isEditing}
    />
    <label>Adres<input value={props.address} onChange={(event) => props.setAddress(event.target.value)} placeholder="Örn. A1-1" /></label>
    <label>Koli adedi<input type="number" min="1" step="1" value={props.cartonCount} onChange={(event) => props.setCartonCount(event.target.value)} placeholder="Örn. 15" /></label>
    <label className="address-active-toggle"><input type="checkbox" checked={props.isActive} onChange={(event) => props.setIsActive(event.target.checked)} /> Aktif kayıt</label>
    {props.error && <p className="form-error" role="alert">{props.error}</p>}
    <div className="record-actions"><button className="button button--primary" type="submit" disabled={props.isSaving}>{props.isSaving ? 'Kaydediliyor...' : 'Kaydet'}</button><button className="button button--secondary" type="button" onClick={props.onCancel}>Vazgeç</button></div>
  </form>
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return <div><span>{label}</span><strong>{value}</strong></div>
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

/**
 * Görünen adres kayıtlarının ürünlerine ait barkodlar. Yalnızca aramada
 * kullanılıyor. Tüm ürünleri çekmek yerine (94.894 üründe ~95 istek) sadece
 * listedeki ürünlerin barkodları alınıyor.
 */
async function findBarcodesFor(records: AddressRecord[]): Promise<Map<string, string[]>> {
  const byProductId = new Map<string, string[]>()
  const productIds = [...new Set(records.map((record) => record.productId))]
  if (productIds.length === 0) return byProductId

  const { data, error } = await supabase
    .from('product_barcodes')
    .select('product_id, barcode')
    .in('product_id', productIds)
  if (error) return byProductId

  for (const row of (data ?? []) as unknown as Array<{ product_id: string; barcode: string }>) {
    const list = byProductId.get(row.product_id)
    if (list) list.push(row.barcode)
    else byProductId.set(row.product_id, [row.barcode])
  }
  return byProductId
}

/**
 * Ürün seçici. Eskiden buradaki `<select>` tüm ürünleri `<option>` olarak
 * basıyordu; 94.894 üründe bu hem imkânsız hem de kullanılamaz (kimse o listeyi
 * kaydırmaz). Yerine yazdıkça arayan bir seçici: sunucu tarafı arama, ilk 8
 * sonuç.
 */
function ProductPicker({ selected, onSelect, disabled }: {
  selected: ProductListItem | null
  onSelect: (product: ProductListItem | null) => void
  disabled?: boolean
}) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<ProductListItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const search = (value: string) => {
    setTerm(value)
    window.clearTimeout(timer.current)
    if (!value.trim()) { setResults([]); return }
    timer.current = window.setTimeout(() => {
      setIsSearching(true)
      queryProducts({ query: value, pageSize: 8 })
        .then((page) => setResults(page.items))
        .catch((reason: unknown) => { console.error(reason); setResults([]) })
        .finally(() => setIsSearching(false))
    }, 250)
  }

  if (selected) {
    return (
      <label>Stok kodu / stok
        <div className="product-picker__selected">
          <span><strong>{selected.stockCode}</strong> · {selected.stockName}</span>
          {!disabled && <button type="button" onClick={() => { onSelect(null); setTerm(''); setResults([]) }}>Değiştir</button>}
        </div>
      </label>
    )
  }

  return (
    <label>Stok kodu / stok
      <input
        value={term}
        onChange={(event) => search(event.target.value)}
        placeholder="Stok kodu veya isim yazın…"
        disabled={disabled}
        autoComplete="off"
      />
      {term.trim() && (
        <div className="product-picker__results">
          {isSearching && <span className="product-picker__state">Aranıyor…</span>}
          {!isSearching && results.length === 0 && <span className="product-picker__state">Eşleşen stok yok.</span>}
          {results.map((product) => (
            <button type="button" key={product.id} onClick={() => onSelect(product)}>
              <strong>{product.stockCode}</strong><small>{product.stockName}</small>
            </button>
          ))}
        </div>
      )}
    </label>
  )
}
