import { useEffect, useState } from 'react'
import { addressRecordService, getProductsWithAddressRecords } from '../data/localData'
import { filterAndSortProducts, getProductMetrics, type ProductFilter, type ProductSort } from '../services/productListing'
import { createProduct, DuplicateProductBarcodeError, DuplicateProductStockCodeError, listProducts } from '../services/productService'
import type { Product } from '../types/product'
import './StocksPage.css'

type StocksPageProps = {
  onBackToDashboard: () => void
  onProductSelect: (productId: string) => void
}

export function StocksPage({ onBackToDashboard, onProductSelect }: StocksPageProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [records, setRecords] = useState<Awaited<ReturnType<typeof addressRecordService.list>>>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ProductFilter>('all')
  const [sort, setSort] = useState<ProductSort>('relevance')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false)
  const [stockCode, setStockCode] = useState('')
  const [stockName, setStockName] = useState('')
  const [barcodes, setBarcodes] = useState<string[]>([])
  const [barcodeInput, setBarcodeInput] = useState('')
  const [formError, setFormError] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const loadStocks = async () => {
    const [nextProducts, nextRecords] = await Promise.all([listProducts(), addressRecordService.list()])
    setProducts(nextProducts)
    setRecords(nextRecords)
  }

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    loadStocks()
      .then(() => {
        if (!isMounted) return
      })
      .catch((reason: unknown) => {
        console.error(reason)
        if (isMounted) setError('Stoklar yüklenirken bir sorun oluştu.')
      })
      .finally(() => { if (isMounted) setIsLoading(false) })
    return () => { isMounted = false }
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
      await loadStocks()
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

  const productsWithRecords = getProductsWithAddressRecords(records, products)
  const normalizedQuery = query.trim().toLocaleLowerCase('tr-TR')
  const searchedProducts = normalizedQuery
    ? productsWithRecords.filter((product) => [product.stockCode, product.stockName, ...product.barcodes]
      .some((value) => value.toLocaleLowerCase('tr-TR').includes(normalizedQuery)))
    : productsWithRecords
  const visibleProducts = filterAndSortProducts(
    searchedProducts,
    records,
    filter,
    sort === 'relevance' ? 'stock-name' : sort,
    'asc',
  )
  const counts = {
    all: productsWithRecords.length,
    single: productsWithRecords.filter((product) => getProductMetrics(product, records).activeAddressCount === 1).length,
    multiple: productsWithRecords.filter((product) => getProductMetrics(product, records).hasMultipleAddresses).length,
  }

  return (
    <main className="stocks-page">
      <header className="stocks-page__header">
        <div>
          <p className="intro__eyebrow">ÜRÜN YÖNETİMİ</p>
          <h1>Stoklar</h1>
          <p className="stocks-page__description">Sistemdeki stokların genel görünümü</p>
        </div>
        <div className="stocks-page__header-actions">
          <button className="button button--primary" type="button" onClick={openCreateForm}>+ Stok Ekle</button>
          <button className="button button--secondary" type="button" onClick={onBackToDashboard}>Dashboard'a dön</button>
        </div>
      </header>

      <section className="stocks-toolbar" aria-label="Stok filtreleri">
        <label className="stocks-search">
          <span aria-hidden="true">⌕</span>
          <span className="visually-hidden">Stok kodu, stok adı veya barkod ara</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Stok kodu, stok adı veya barkod ara..." />
        </label>
        <div className="stocks-filter-group" aria-label="Adres filtreleri">
          <button className={filter === 'all' ? 'stocks-filter stocks-filter--active' : 'stocks-filter'} type="button" onClick={() => setFilter('all')}>Tümü <strong>{counts.all}</strong></button>
          <button className={filter === 'single-address' ? 'stocks-filter stocks-filter--active' : 'stocks-filter'} type="button" onClick={() => setFilter('single-address')}>Tek adres <strong>{counts.single}</strong></button>
          <button className={filter === 'multiple-addresses' ? 'stocks-filter stocks-filter--active' : 'stocks-filter'} type="button" onClick={() => setFilter('multiple-addresses')}>Çoklu adres <strong>{counts.multiple}</strong></button>
        </div>
        <label className="stocks-sort">Sırala
          <select value={sort} onChange={(event) => setSort(event.target.value as ProductSort)}>
            <option value="relevance">Stok adı</option>
            <option value="stock-code">Stok kodu</option>
            <option value="address-count">Adres sayısı</option>
            <option value="carton-count">Koli sayısı</option>
          </select>
        </label>
      </section>

      {isLoading && <p className="stocks-state" role="status">Stoklar yükleniyor...</p>}
      {!isLoading && error && <p className="stocks-state stocks-state--error" role="alert">{error}</p>}
      {!isLoading && !error && (
        <div className="stocks-layout stocks-layout--list-only">
          <section className="stocks-table-panel" aria-label="Stok listesi">
            <div className="stocks-table-caption"><span>{visibleProducts.length} stok</span><span>Ürün bazında görünüm</span></div>
            {productsWithRecords.length === 0 ? <div className="stocks-state"><p>Henüz stok bulunmuyor.</p><button className="button button--primary" type="button" onClick={openCreateForm}>+ Stok Ekle</button></div> : visibleProducts.length === 0 ? <p className="stocks-state">Aramanızla eşleşen stok bulunamadı.</p> : (
              <div className="stocks-table-wrap">
                <table className="stocks-table">
                  <thead><tr><th>Stok kodu</th><th>Stok adı</th><th>Barkod</th><th>Adres</th><th>Koli</th><th>Durum</th></tr></thead>
                  <tbody>{visibleProducts.map((product) => {
                    const metrics = getProductMetrics(product, records)
                    return <tr className="stocks-row" key={product.id} onClick={() => onProductSelect(product.id)}>
                      <td><strong>{product.stockCode}</strong></td>
                      <td>{product.stockName}</td>
                      <td>{product.barcodes.length > 0 ? product.barcodes.join(' • ') : '-'}</td>
                      <td>{metrics.activeAddressCount}</td>
                      <td>{metrics.totalCartons}</td>
                      <td><span className="stock-status">{product.isActive === false ? 'Pasif' : 'Aktif'}</span></td>
                    </tr>
                  })}</tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
      {isCreateFormOpen && <div className="stocks-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreateForm() }}>
        <section className="stocks-modal" role="dialog" aria-modal="true" aria-labelledby="create-stock-title">
          <div className="stocks-modal__header">
            <div><p className="intro__eyebrow">YENİ ÜRÜN</p><h2 id="create-stock-title">Stok Ekle</h2></div>
            <button className="modal-close" type="button" onClick={closeCreateForm} aria-label="Stok ekleme formunu kapat">×</button>
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
            <div className="record-actions"><button className="button button--primary" type="submit" disabled={isCreating}>{isCreating ? 'Oluşturuluyor...' : 'Stok Oluştur'}</button><button className="button button--secondary" type="button" onClick={closeCreateForm} disabled={isCreating}>Vazgeç</button></div>
          </form>
        </section>
      </div>}
    </main>
  )
}

