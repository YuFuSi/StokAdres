import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, MapPin, Plus, Search } from 'lucide-react'
import { addressRecordService } from '../data/localData'
import { ADDRESS_PAGE_SIZE, DuplicateActiveAddressError, type AddressRecordFilter, type AddressRecordSort } from '../services/addressRecordService'
import { queryProducts, type ProductListItem } from '../services/productService'
import type { AddressRecord } from '../types/addressRecord'
import type { Product } from '../types/product'
import { formatNumber } from '../lib/format'
import { rowNavigationProps } from '../lib/rowNavigation'
import { toStoredAddress } from '../lib/addressFormat'
import './AddressesPage.css'

type AddressesPageProps = {
  onBackToDashboard: () => void
  initialSelectedRecordId?: string | null
}

const SEARCH_DEBOUNCE_MS = 250

export function AddressesPage({ onBackToDashboard, initialSelectedRecordId = null }: AddressesPageProps) {
  const [records, setRecords] = useState<AddressRecord[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState({ all: 0, active: 0, inactive: 0, activeCartons: 0 })
  const [selectedRecord, setSelectedRecord] = useState<AddressRecord | null>(null)
  const [query, setQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [filter, setFilter] = useState<AddressRecordFilter>('all')
  const [sort, setSort] = useState<AddressRecordSort>('updated-at')
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
  // Yazma sonrası listeyi tazelemek için: değeri artınca sorgu effect'i yeniden
  // çalışır. Sayfa/filtre sıfırlamadan yerinde yenileme sağlar.
  const [reloadToken, setReloadToken] = useState(0)

  // Arama, filtre, sıralama ve sayfalama SUNUCUDA (search_address_records).
  // Bu ekran eskiden tüm tabloyu çekip hepsini istemcide yapıyordu.
  useEffect(() => {
    const timer = window.setTimeout(() => setActiveQuery(query.trim()), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query])

  // Arama/filtre/sıralama değişince ilk sayfaya dön; yoksa kullanıcı boş bir
  // sayfada kalabiliyor.
  useEffect(() => { setPage(0) }, [activeQuery, filter, sort])

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    void (async () => {
      try {
        const [result, nextCounts] = await Promise.all([
          addressRecordService.search({ query: activeQuery, filter, sort, page }),
          addressRecordService.getCounts(),
        ])
        if (cancelled) return
        setRecords(result.items)
        setTotal(result.total)
        setCounts(nextCounts)
        setError('')
      } catch (reason: unknown) {
        console.error(reason)
        if (!cancelled) setError('Adresler yüklenirken bir sorun oluştu.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [activeQuery, filter, sort, page, reloadToken])

  // Ürün detayından bir adrese tıklanarak gelindiğinde o kayıt listede
  // olmayabilir (başka sayfada); doğrudan kendisini çekiyoruz.
  useEffect(() => {
    if (!initialSelectedRecordId) return
    let cancelled = false
    void addressRecordService.getById(initialSelectedRecordId)
      .then((record) => { if (!cancelled && record) setSelectedRecord(record) })
      .catch((reason: unknown) => console.error(reason))
    return () => { cancelled = true }
  }, [initialSelectedRecordId])

  const reload = (keepSelected: AddressRecord | null = selectedRecord) => {
    setSelectedRecord(keepSelected)
    setReloadToken((value) => value + 1)
  }

  const pageCount = Math.max(1, Math.ceil(total / ADDRESS_PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageStart = safePage * ADDRESS_PAGE_SIZE
  const visibleRecords = records
  const totalCartons = counts.activeCartons

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
          address: toStoredAddress(address),
          cartonCount: parsedCartonCount,
          isActive,
        })
      } else {
        await addressRecordService.create({
          productId: product.id,
          stockCode: product.stockCode,
          stockName: product.stockName,
          address: toStoredAddress(address),
          cartonCount: parsedCartonCount,
          isActive,
        })
      }
      reload()
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
      reload(selectedRecord?.id === record.id ? null : selectedRecord)
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
          <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>Tümü <strong>{formatNumber(counts.all)}</strong></FilterButton>
          <FilterButton active={filter === 'active'} onClick={() => setFilter('active')}>Aktif <strong>{formatNumber(counts.active)}</strong></FilterButton>
          <FilterButton active={filter === 'inactive'} onClick={() => setFilter('inactive')}>Pasif <strong>{formatNumber(counts.inactive)}</strong></FilterButton>
        </div>
        <label className="addresses-sort">Sırala
          <select value={sort} onChange={(event) => setSort(event.target.value as AddressRecordSort)}>
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
            <div className="addresses-table-caption"><span>{total === 0 ? '0 kayıt' : `${formatNumber(pageStart + 1)}-${formatNumber(pageStart + visibleRecords.length)} / ${formatNumber(total)} kayıt`}</span><span>Satıra tıklayın ya da ↑↓ ile gezip Enter'a basın</span></div>
            {total === 0 ? <p className="addresses-state">{counts.all === 0 ? 'Henüz adres kaydı bulunmuyor.' : 'Aramanızla eşleşen adres bulunamadı.'}</p> : (
              <>
              <div className="addresses-table-wrap">
                <table className="addresses-table">
                  <thead><tr><th>Adres</th><th>Stok kodu</th><th>Stok adı</th><th>Koli</th><th>Durum</th><th>Güncellenme</th><th aria-label="Aksiyon" /></tr></thead>
                  <tbody>{visibleRecords.map((record) => <tr className={selectedRecord?.id === record.id ? 'addresses-row addresses-row--selected' : 'addresses-row'} key={record.id} onClick={() => { setSelectedRecord(record); closeForm() }} {...rowNavigationProps(() => { setSelectedRecord(record); closeForm() })}>
                    <td><span className="address-cell"><MapPin size={14}/>{record.address}</span></td><td><strong>{record.stockCode}</strong></td><td className="address-product-name">{record.stockName}</td><td><strong className="carton-cell">{formatNumber(record.cartonCount)}</strong></td><td><StatusBadge isActive={record.isActive} /></td><td>{formatDate(record.updatedAt)}</td><td><button className="row-open" type="button" tabIndex={-1} aria-label={`${record.address} ayrıntısını aç`} onClick={(event) => { event.stopPropagation(); setSelectedRecord(record); closeForm() }}><ChevronRight size={16}/></button></td>
                  </tr>)}</tbody>
                </table>
              </div>
              {pageCount > 1 && (
                <div className="addresses-pagination">
                  <button className="button button--secondary" type="button" disabled={safePage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}><ChevronLeft size={15} /> Önceki</button>
                  <span>Sayfa {formatNumber(safePage + 1)} / {formatNumber(pageCount)}</span>
                  <button className="button button--secondary" type="button" disabled={safePage + 1 >= pageCount} onClick={() => setPage((current) => current + 1)}>Sonraki <ChevronRight size={15} /></button>
                </div>
              )}
              </>
            )}
          </section>

          {selectedRecord && <aside className="address-detail" aria-label="Adres detayı">
            <div className="address-detail__header"><div><span className="selected-product__label">Adres detayı</span><h2>{selectedRecord.address}</h2><p>{selectedRecord.stockCode}</p></div><button className="modal-close" type="button" onClick={() => { setSelectedRecord(null); closeForm() }} aria-label="Adres detayını kapat">×</button></div>
            <div className="address-detail__product"><span>Stok kodu<strong>{selectedRecord.stockCode}</strong></span><span>Stok adı<strong>{selectedRecord.stockName}</strong></span></div>
            <div className="address-detail__meta"><span>Adres<strong>{selectedRecord.address}</strong></span><span>Koli<strong>{formatNumber(selectedRecord.cartonCount)}</strong></span><span>Durum<StatusBadge isActive={selectedRecord.isActive} /></span></div>
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
    <label>Adres<input value={props.address} onChange={(event) => props.setAddress(event.target.value)} placeholder="Örn. H21-01" /></label>
    <label>Koli adedi<input type="number" min="1" step="1" value={props.cartonCount} onChange={(event) => props.setCartonCount(event.target.value)} placeholder="Örn. 15" /></label>
    <label className="address-active-toggle"><input type="checkbox" checked={props.isActive} onChange={(event) => props.setIsActive(event.target.checked)} /> Aktif kayıt</label>
    {props.error && <p className="form-error" role="alert">{props.error}</p>}
    <div className="record-actions"><button className="button button--primary" type="submit" disabled={props.isSaving}>{props.isSaving ? 'Kaydediliyor...' : 'Kaydet'}</button><button className="button button--secondary" type="button" onClick={props.onCancel}>Vazgeç</button></div>
  </form>
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return <div><span>{label}</span><strong>{formatNumber(value)}</strong></div>
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

/**
 * Görünen adres kayıtlarının ürünlerine ait barkodlar. Yalnızca aramada
 * kullanılıyor. Tüm ürünleri çekmek yerine (94.894 üründe ~95 istek) sadece
 * listedeki ürünlerin barkodları alınıyor.
 */
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
