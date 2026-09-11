import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Search, X } from 'lucide-react'
import {
  createProduct,
  DuplicateProductBarcodeError,
  DuplicateProductStockCodeError,
  getProductFilterCounts,
  PRODUCT_PAGE_SIZE,
  queryProducts,
  type ProductListFilter,
  type ProductListItem,
  type ProductListSort,
} from '../services/productService'
import { formatNumber } from '../lib/format'
import { rowNavigationProps } from '../lib/rowNavigation'
import './StocksPage.css'

type StocksPageProps = {
  onProductSelect: (productId: string) => void
  /** Genel Bakış'tan gelindiginde onceden secili filtre. */
  initialFilter?: ProductListFilter
}

const SEARCH_DEBOUNCE_MS = 250

export function StocksPage({ onProductSelect, initialFilter = 'all' }: StocksPageProps) {
  const [products, setProducts] = useState<ProductListItem[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState({ all: 0, none: 0, single: 0, multiple: 0 })
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [filter, setFilter] = useState<ProductListFilter>(initialFilter)
  const [sort, setSort] = useState<ProductListSort>('stock-name')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false)
  const [stockCode, setStockCode] = useState('')
  const [stockName, setStockName] = useState('')
  const [barcodes, setBarcodes] = useState<string[]>([])
  const [barcodeInput, setBarcodeInput] = useState('')
  const [formError, setFormError] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  // Arama her tuş vuruşunda sunucuya gitmemeli. 100k satırda sorgunun kendisi
  // ucuz (trigram index), ama gereksiz istek yağmuru anlamsız.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query])

  // Arama/filtre/sıralama değişince ilk sayfaya dön; yoksa 3. sayfada dururken
  // yeni sonuç kümesi 1 sayfaysa boş ekran görünürdü.
  useEffect(() => { setPage(0) }, [debouncedQuery, filter, sort])

  // Sayfayı çeken tek etki. Bir önceki isteğin geç dönüp yeni sonucun üstüne
  // yazmasını engellemek için istek sırası takip ediliyor.
  const requestRef = useRef(0)
  useEffect(() => {
    const requestId = ++requestRef.current
    setIsLoading(true)
    queryProducts({ query: debouncedQuery, filter, sort, page })
      .then((result) => {
        if (requestRef.current !== requestId) return
        setProducts(result.items)
        setTotal(result.total)
        setError('')
      })
      .catch((reason: unknown) => {
        console.error(reason)
        if (requestRef.current === requestId) setError('Stoklar yüklenirken bir sorun oluştu.')
      })
      .finally(() => { if (requestRef.current === requestId) setIsLoading(false) })
  }, [debouncedQuery, filter, sort, page])

  // Filtre çiplerindeki sayılar aramadan bağımsız; sayfa değiştikçe yeniden
  // çekmeye gerek yok. Stok eklendiğinde reloadCounts ile tazeleniyor.
  const reloadCounts = () => {
    getProductFilterCounts()
      .then(setCounts)
      .catch((reason: unknown) => console.error(reason))
  }
  useEffect(reloadCounts, [])

  useEffect(() => {
    if (!isCreateFormOpen) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeCreateForm() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isCreateFormOpen, isCreating])

  useEffect(() => {
    const open = () => openCreateForm()
    window.addEventListener('stokadres:create-product', open)
    return () => window.removeEventListener('stokadres:create-product', open)
  }, [])

  const openCreateForm = () => {
    setStockCode('')
    setStockName('')
    setBarcodes([])
    setBarcodeInput('')
    setFormError('')
    setIsCreateFormOpen(true)
  }

  const closeCreateForm = () => {
    if (isCreating) return
    setIsCreateFormOpen(false)
    setFormError('')
  }

  const addBarcodeInput = () => {
    const nextBarcode = barcodeInput.trim()
    if (!nextBarcode) return
    if (barcodes.includes(nextBarcode)) {
      setFormError('Aynı barkod birden fazla kez eklenemez.')
      return
    }
    setBarcodes((current) => [...current, nextBarcode])
    setBarcodeInput('')
    setFormError('')
  }

  const removeBarcodeInput = (barcode: string) => {
    setBarcodes((current) => current.filter((item) => item !== barcode))
  }

  const saveProduct = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedStockCode = stockCode.trim()
    const trimmedStockName = stockName.trim()
    if (!trimmedStockCode || !trimmedStockName) {
      setFormError('Stok kodu ve stok adı zorunludur.')
      return
    }
    const pendingBarcode = barcodeInput.trim()
    if (pendingBarcode && barcodes.includes(pendingBarcode)) {
      setFormError('Aynı barkod birden fazla kez eklenemez.')
      return
    }
    const nextBarcodes = pendingBarcode ? [...barcodes, pendingBarcode] : barcodes
    setIsCreating(true)
    setFormError('')
    try {
      const product = await createProduct({ stockCode: trimmedStockCode, stockName: trimmedStockName, barcodes: nextBarcodes })
      reloadCounts()
      setIsCreateFormOpen(false)
      onProductSelect(product.id)
    } catch (reason: unknown) {
      console.error(reason)
      setFormError(reason instanceof DuplicateProductStockCodeError
        ? 'Bu stok kodu zaten kayıtlı. Farklı bir stok kodu girin.'
        : reason instanceof DuplicateProductBarcodeError
          ? 'Bu barkod zaten kayıtlı. Farklı bir barkod girin.'
          : 'Stok oluşturulamadı. Lütfen bilgileri kontrol edip tekrar deneyin.')
    } finally {
      setIsCreating(false)
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / PRODUCT_PAGE_SIZE))
  const rangeStart = total === 0 ? 0 : page * PRODUCT_PAGE_SIZE + 1
  const rangeEnd = Math.min(total, (page + 1) * PRODUCT_PAGE_SIZE)

  return (
    <main className="stocks-page">
      <header className="stocks-page__header">
        <div>
          <h1>Stoklar</h1>
          <p className="stocks-page__description">Stok kayıtlarını görüntüleyin ve yönetin.</p>
        </div>
        <div className="stocks-page__header-actions">
          <button className="button button--primary" type="button" onClick={openCreateForm}><Plus size={15} /> Stok Ekle</button>
        </div>
      </header>

      <section className="stocks-toolbar" aria-label="Stok filtreleri">
        <label className="stocks-search">
          <Search size={17} aria-hidden="true" />
          <span className="visually-hidden">Stok kodu, stok adı veya barkod ara</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Stok kodu, isim veya barkod ara..." />
        </label>
        <div className="stocks-filter-group" aria-label="Adres filtreleri">
          <button className={filter === 'all' ? 'stocks-filter stocks-filter--active' : 'stocks-filter'} type="button" onClick={() => setFilter('all')}>Tümü <strong>{formatNumber(counts.all)}</strong></button>
          <button className={filter === 'no-address' ? 'stocks-filter stocks-filter--active' : 'stocks-filter'} type="button" onClick={() => setFilter('no-address')}>Adresi yok <strong>{formatNumber(counts.none)}</strong></button>
          <button className={filter === 'single-address' ? 'stocks-filter stocks-filter--active' : 'stocks-filter'} type="button" onClick={() => setFilter('single-address')}>Tek adres <strong>{formatNumber(counts.single)}</strong></button>
          <button className={filter === 'multiple-addresses' ? 'stocks-filter stocks-filter--active' : 'stocks-filter'} type="button" onClick={() => setFilter('multiple-addresses')}>Çoklu adres <strong>{formatNumber(counts.multiple)}</strong></button>
        </div>
        <label className="stocks-sort">Sırala
          <select value={sort} onChange={(event) => setSort(event.target.value as ProductListSort)}>
            <option value="stock-name">Stok adı</option>
            <option value="stock-code">Stok kodu</option>
            <option value="address-count">Adres sayısı</option>
            <option value="carton-count">Koli sayısı</option>
          </select>
        </label>
      </section>

      {error && <div className="stocks-state stocks-state--error" role="alert"><p>{error}</p><button className="button button--secondary" type="button" onClick={() => setPage((current) => current)}>Tekrar Dene</button></div>}
      {!error && (
        <div className="stocks-layout stocks-layout--list-only">
          <section className="stocks-table-panel" aria-label="Stok listesi">
            <div className="stocks-table-caption">
              <span>{formatNumber(total)} stok{total > 0 && <> · {formatNumber(rangeStart)}-{formatNumber(rangeEnd)} arası</>}</span>
              <span>Satıra tıklayın ya da ↑↓ ile gezip Enter'a basın</span>
            </div>
            {isLoading && products.length === 0 ? <p className="stocks-state" role="status">Stoklar yükleniyor...</p>
              : total === 0 && debouncedQuery ? <p className="stocks-state">Aramanızla eşleşen stok bulunamadı.</p>
              : total === 0 ? <div className="stocks-state"><p>Henüz stok bulunmuyor.</p><button className="button button--primary" type="button" onClick={openCreateForm}>+ Stok Ekle</button></div> : (
              <>
                <div className={isLoading ? 'stocks-table-wrap stocks-table-wrap--loading' : 'stocks-table-wrap'}>
                  <table className="stocks-table">
                    <thead><tr><th>Stok kodu</th><th>Stok</th><th>Barkod</th><th>Adres</th><th>Koli</th><th aria-label="İşlemler" /></tr></thead>
                    <tbody>{products.map((product) => (
                      <tr className="stocks-row" key={product.id} onClick={() => onProductSelect(product.id)} {...rowNavigationProps(() => onProductSelect(product.id))}>
                        <td><strong>{product.stockCode}</strong></td>
                        <td>{product.stockName}</td>
                        <td className="barcode-summary">{product.barcodes.length ? <><span>{product.barcodes[0]}</span>{product.barcodes.length > 1 && <small>+{product.barcodes.length - 1} barkod</small>}</> : <span>—</span>}</td>
                        <td>{product.addressCount ? `${formatNumber(product.addressCount)} adres` : <span className="cell-empty">—</span>}</td>
                        <td>{product.totalCartons ? formatNumber(product.totalCartons) : <span className="cell-empty">—</span>}</td>
                        <td><button className="row-open" type="button" tabIndex={-1} aria-label={`${product.stockCode} stok kartını aç`} onClick={(event) => { event.stopPropagation(); onProductSelect(product.id) }}><ChevronRight size={16} /></button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                {pageCount > 1 && (
                  <div className="stocks-pagination">
                    <button className="button button--secondary" type="button" disabled={page === 0 || isLoading} onClick={() => setPage((current) => Math.max(0, current - 1))}><ChevronLeft size={15} /> Önceki</button>
                    <span>Sayfa {formatNumber(page + 1)} / {formatNumber(pageCount)}</span>
                    <button className="button button--secondary" type="button" disabled={page + 1 >= pageCount || isLoading} onClick={() => setPage((current) => current + 1)}>Sonraki <ChevronRight size={15} /></button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
      {isCreateFormOpen && <div className="stocks-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreateForm() }}>
        <section className="stocks-modal" role="dialog" aria-modal="true" aria-labelledby="create-stock-title">
          <div className="stocks-modal__header">
            <div><h2 id="create-stock-title">Yeni Stok</h2><p className="stocks-modal__description">Stok kodu ve isim bilgilerini girin. Barkodları daha sonra da ekleyebilirsiniz.</p></div>
            <button className="modal-close" type="button" onClick={closeCreateForm} aria-label="Stok ekleme formunu kapat"><X size={18}/></button>
          </div>
          <form className="stocks-create-form" onSubmit={saveProduct}>
            <label>Stok Kodu *<input value={stockCode} onChange={(event) => setStockCode(event.target.value)} placeholder="Örn. STK-001" autoFocus /></label>
            <label>Stok Adı *<input value={stockName} onChange={(event) => setStockName(event.target.value)} placeholder="Örn. Plastik Kutu" /></label>
            <div className="stocks-barcode-field">
              <span>Barkodlar</span>
              <div className="stocks-barcode-input"><input value={barcodeInput} onChange={(event) => setBarcodeInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addBarcodeInput() } }} placeholder="İlk barkodu girin" /><button className="button button--secondary" type="button" onClick={addBarcodeInput}>Ekle</button></div>
              {barcodes.length > 0 && <ul className="stocks-barcode-list">{barcodes.map((barcode) => <li key={barcode}><span>{barcode}</span><button type="button" onClick={() => removeBarcodeInput(barcode)} aria-label={`${barcode} barkodunu kaldır`}>Kaldır</button></li>)}</ul>}
            </div>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <div className="record-actions"><button className="button button--secondary" type="button" onClick={closeCreateForm} disabled={isCreating}>İptal</button><button className="button button--primary" type="submit" disabled={isCreating}>{isCreating ? 'Oluşturuluyor...' : 'Stok Oluştur'}</button></div>
          </form>
        </section>
      </div>}
    </main>
  )
}
