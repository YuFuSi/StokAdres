import { useEffect, useState } from 'react'
import { addressRecordService, getProductsWithAddressRecords } from '../data/localData'
import { filterAndSortProducts, getProductMetrics, type ProductFilter, type ProductSort } from '../services/productListing'
import { listProducts } from '../services/productService'
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
        if (isMounted) setError('Stoklar yüklenirken bir sorun oluştu.')
      })
      .finally(() => { if (isMounted) setIsLoading(false) })
    return () => { isMounted = false }
  }, [])

  const productsWithRecords = getProductsWithAddressRecords(records, products)
  const normalizedQuery = query.trim().toLocaleLowerCase('tr-TR')
  const searchedProducts = normalizedQuery
    ? productsWithRecords.filter((product) => [product.stockCode, product.stockName, product.barcode ?? '']
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
        <button className="button button--secondary" type="button" onClick={onBackToDashboard}>Dashboard'a dön</button>
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
            {productsWithRecords.length === 0 ? <p className="stocks-state">Henüz stok bulunmuyor.</p> : visibleProducts.length === 0 ? <p className="stocks-state">Aramanızla eşleşen stok bulunamadı.</p> : (
              <div className="stocks-table-wrap">
                <table className="stocks-table">
                  <thead><tr><th>Stok kodu</th><th>Stok adı</th><th>Barkod</th><th>Adres</th><th>Koli</th><th>Durum</th></tr></thead>
                  <tbody>{visibleProducts.map((product) => {
                    const metrics = getProductMetrics(product, records)
                    return <tr className="stocks-row" key={product.id} onClick={() => onProductSelect(product.id)}>
                      <td><strong>{product.stockCode}</strong></td>
                      <td>{product.stockName}</td>
                      <td>{product.barcode || '-'}</td>
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
    </main>
  )
}

