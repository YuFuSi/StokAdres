import { useEffect, useRef, useState } from 'react'
import { ActionCard } from '../components/ActionCard'
import { addressRecordService, getProductsWithAddressRecords } from '../data/localData'
import {
  DuplicateActiveAddressError,
} from '../services/addressRecordService'
import { exportAddressRecordsCsv } from '../services/csvExport'
import { copyToClipboard } from '../services/clipboard'
import { loadRecentSearches, loadRecentViewed, recordRecentSearch, recordRecentViewed } from '../services/recentProducts'
import { getBackupSummary, parseBackupJson, saveBackupJson, type StokAdresBackup } from '../services/dataBackup'
import { searchProducts } from '../services/productSearch'
import {
  filterAndSortProducts,
  getProductMetrics,
  type ProductFilter,
  type ProductSort,
  type SortDirection,
} from '../services/productListing'
import { createImportPreview, ImportFileError, importNewRecords, parseImportFile } from '../import'
import type { ImportPreview, ImportResult } from '../import'
import type { AddressRecord } from '../types/addressRecord'
import type { Product } from '../types/product'
import packageInfo from '../../package.json'

export function HomePage() {
  const [query, setQuery] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedRecords, setSelectedRecords] = useState<AddressRecord[]>([])
  const [allAddressRecords, setAllAddressRecords] = useState<AddressRecord[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null)
  const [address, setAddress] = useState('')
  const [cartonCount, setCartonCount] = useState('')
  const [formError, setFormError] = useState('')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [activeResultIndex, setActiveResultIndex] = useState(0)
  const [productFilter, setProductFilter] = useState<ProductFilter>('all')
  const [productSort, setProductSort] = useState<ProductSort>('relevance')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [exportMessage, setExportMessage] = useState('')
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [isApplyingImport, setIsApplyingImport] = useState(false)
  const [recentSearches, setRecentSearches] = useState<Product[]>(() => loadRecentSearches())
  const [recentViewed, setRecentViewed] = useState<Product[]>(() => loadRecentViewed())
  const [copyMessage, setCopyMessage] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [backupMessage, setBackupMessage] = useState('')
  const [restoreBackup, setRestoreBackup] = useState<StokAdresBackup | null>(null)
  const [restoreError, setRestoreError] = useState('')
  const [isRestoring, setIsRestoring] = useState(false)
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const backupInputRef = useRef<HTMLInputElement>(null)

  const availableProducts = getProductsWithAddressRecords(allAddressRecords, products)
  const searchedProducts = searchProducts(availableProducts, query, allAddressRecords)
  const results = filterAndSortProducts(
    searchedProducts,
    allAddressRecords,
    productFilter,
    productSort,
    sortDirection,
  )
  const activeAddressRecords = allAddressRecords.filter((record) => record.isActive)
  const totalStockCount = new Set(availableProducts.map((product) => product.stockCode)).size
  const totalCartonCount = activeAddressRecords.reduce((total, record) => total + record.cartonCount, 0)

  const refreshAddressRecords = async (stockCode?: string) => {
    const [records, nextProducts] = await Promise.all([addressRecordService.list(), addressRecordService.listProducts()])
    setAllAddressRecords(records)
    setProducts(nextProducts)
    if (stockCode) {
      setSelectedRecords(records.filter((record) => record.stockCode === stockCode && record.isActive))
    }
  }

  const selectProduct = async (product: Product) => {
    const records = allAddressRecords.filter(
      (record) => (record.productId === product.id || record.stockCode === product.stockCode) && record.isActive,
    )
    setSelectedProduct(product)
    setSelectedRecords(records)
    setEditingRecordId(null)
    setAddress('')
    setCartonCount('')
    setFormError('')
    setIsFormOpen(false)
    setExportMessage('')
    setRecentViewed(recordRecentViewed(product))
  }

  const clearSelection = () => {
    setQuery('')
    setSelectedProduct(null)
    setSelectedRecords([])
    setEditingRecordId(null)
    setAddress('')
    setCartonCount('')
    setFormError('')
    setIsFormOpen(false)
    setExportMessage('')
  }

  useEffect(() => {
    let isMounted = true
    void Promise.all([addressRecordService.list(), addressRecordService.listProducts()])
      .then(([records, loadedProducts]) => {
        if (!isMounted) return
        setAllAddressRecords(records)
        setProducts(loadedProducts)
      })
      .catch((error: unknown) => {
        console.error(error)
        if (isMounted) setLoadError(error instanceof Error ? error.message : 'Veriler yüklenemedi.')
      })
      .finally(() => { if (isMounted) setIsLoading(false) })
    return () => { isMounted = false }
  }, [])

  useEffect(() => {
    setActiveResultIndex(0)
  }, [query, productFilter, productSort, sortDirection])

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  useEffect(() => {
    if (query.trim()) {
      const firstResult = results[0]
      if (firstResult) setRecentSearches(recordRecentSearch(firstResult))
    }
  }, [query])

  useEffect(() => {
    const handleCopyShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isEditable = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT'
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && selectedProduct && !isEditable) {
        event.preventDefault()
        copySelectedProduct()
      }
    }

    window.addEventListener('keydown', handleCopyShortcut)
    return () => window.removeEventListener('keydown', handleCopyShortcut)
  }, [selectedProduct, selectedRecords])

  useEffect(() => {
    if (!importPreview) return

    const handlePreviewKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setImportPreview(null)
    }

    window.addEventListener('keydown', handlePreviewKeyDown)
    return () => window.removeEventListener('keydown', handlePreviewKeyDown)
  }, [importPreview])

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveResultIndex((index) => results.length ? (index + 1) % results.length : 0)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveResultIndex((index) => results.length ? (index - 1 + results.length) % results.length : 0)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const product = results[activeResultIndex] ?? results[0]
      if (product) selectProduct(product)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      clearSelection()
    }
  }

  const openNewAddressForm = () => {
    setEditingRecordId(null)
    setAddress('')
    setCartonCount('')
    setFormError('')
    setIsFormOpen(true)
  }

  const copyText = async (text: string) => {
    try {
      await copyToClipboard(text)
      setCopyMessage('Kopyalandı')
      window.setTimeout(() => setCopyMessage(''), 1800)
    } catch {
      setCopyMessage('Kopyalama başarısız oldu.')
      window.setTimeout(() => setCopyMessage(''), 2200)
    }
  }

  const copySelectedProduct = () => {
    if (!selectedProduct) return
    const addresses = selectedRecords.map((record) => `${record.address} — ${record.cartonCount} koli`).join('\n')
    copyText(`${selectedProduct.stockName}\nStok Kodu: ${selectedProduct.stockCode}\n\n${addresses}`)
  }

  const selectRecentProduct = (product: Product) => {
    setQuery(product.stockCode)
    selectProduct(product)
  }

  const clearProductFilters = () => {
    setProductFilter('all')
    setProductSort('relevance')
    setSortDirection('asc')
  }

  const openEditForm = (record: AddressRecord) => {
    setEditingRecordId(record.id)
    setAddress(record.address)
    setCartonCount(String(record.cartonCount))
    setFormError('')
    setIsFormOpen(true)
  }

  const submitAddress = async () => {
    if (!selectedProduct) return

    const parsedCartonCount = Number(cartonCount)
    if (!address.trim() || !Number.isInteger(parsedCartonCount) || parsedCartonCount < 1) {
      setFormError('Adres ve 1 veya daha fazla koli adedi girin.')
      return
    }

    try {
      if (editingRecordId) {
        await addressRecordService.update(editingRecordId, {
            address: address.trim(),
            cartonCount: parsedCartonCount,
          })
      } else {
        await addressRecordService.create({
          productId: selectedProduct.id,
            stockCode: selectedProduct.stockCode,
            stockName: selectedProduct.stockName,
            address: address.trim(),
            cartonCount: parsedCartonCount,
          })
      }

      await refreshAddressRecords(selectedProduct.stockCode)
      setAddress('')
      setCartonCount('')
      setFormError('')
      setEditingRecordId(null)
      setIsFormOpen(false)
    } catch (error) {
      if (error instanceof DuplicateActiveAddressError) {
        setFormError('Bu stok kodu ve adres için zaten aktif bir kayıt bulunuyor.')
      } else {
        setFormError('Adres kaydı kaydedilemedi. Lütfen tekrar deneyin.')
      }
    }
  }

  const deleteAddress = async (recordId: string) => {
    if (!selectedProduct) return
    try {
      await addressRecordService.delete(recordId)
      await refreshAddressRecords(selectedProduct.stockCode)
      setFormError('')
      if (editingRecordId === recordId) {
        setEditingRecordId(null)
        setIsFormOpen(false)
      }
    } catch (error) {
      console.error(error)
      setFormError('Adres kaydı silinemedi. Lütfen tekrar deneyin.')
    }
  }

  const exportData = async () => {
    setExportMessage('')
    try {
      const date = new Date().toISOString().slice(0, 10)
      const [records, loadedProducts] = await Promise.all([addressRecordService.list(), addressRecordService.listProducts()])
      const didExport = await exportAddressRecordsCsv(
        records,
        loadedProducts,
        `stokadres-export-${date}.csv`,
      )
      if (didExport) setExportMessage('Veriler başarıyla dışa aktarıldı.')
    } catch {
      setExportMessage('Veriler dışa aktarılamadı. Lütfen tekrar deneyin.')
    }
  }

  const backupData = async () => {
    setBackupMessage('')
    try {
      const date = new Date().toISOString().slice(0, 10)
      if (await saveBackupJson(await addressRecordService.list(), `stokadres-backup-${date}.json`)) {
        setBackupMessage('Veriler başarıyla yedeklendi.')
      }
    } catch {
      setBackupMessage('Veriler yedeklenemedi. Lütfen tekrar deneyin.')
    }
  }

  const handleBackupFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setRestoreError('')
    try {
      setRestoreBackup(parseBackupJson(await file.text()))
    } catch (error) {
      setRestoreError(error instanceof Error ? error.message : 'Yedek dosyası okunamadı.')
    }
  }

  const confirmRestore = async () => {
    if (!restoreBackup || isRestoring) return

    setIsRestoring(true)
    try {
      await addressRecordService.replaceAll(restoreBackup.records)
      await refreshAddressRecords()
      setSelectedProduct(null)
      setSelectedRecords([])
      setRestoreBackup(null)
      setBackupMessage('Yedek başarıyla geri yüklendi.')
    } catch (error) {
      console.error(error)
      setRestoreError('Yedek geri yüklenemedi. Mevcut veriler korunuyor.')
    } finally {
      setIsRestoring(false)
    }
  }

  const clearAllData = async () => {
    try {
      await addressRecordService.clear()
      await refreshAddressRecords()
      setSelectedProduct(null)
      setSelectedRecords([])
      setIsResetConfirmOpen(false)
      setBackupMessage('Tüm veriler silindi.')
    } catch (error) {
      console.error(error)
      setBackupMessage('Veriler silinemedi. Lütfen tekrar deneyin.')
    }
  }

  const openImportPicker = () => {
    if (isImporting) return
    setImportError('')
    setImportResult(null)
    importInputRef.current?.click()
  }

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setImportResult(null)

    const fileName = file.name.toLocaleLowerCase('tr-TR')
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.csv')) {
      setImportError('Desteklenmeyen dosya. Lütfen .xlsx veya .csv dosyası seçin.')
      return
    }

    setImportError('')
    setIsImporting(true)
    try {
      const rows = await parseImportFile(file)
      setImportPreview(createImportPreview(rows, await addressRecordService.list(), products))
    } catch (error) {
      setImportError(error instanceof ImportFileError
        ? error.message
        : 'Dosya okunamadı. Lütfen Stok Kodu, Stok İsmi, Adres ve Koli Adedi kolonlarını kontrol edin.')
    } finally {
      setIsImporting(false)
    }
  }

  const applyImport = async () => {
    if (!importPreview || isApplyingImport) return

    setIsApplyingImport(true)
    try {
      const result = await importNewRecords(importPreview, addressRecordService)
      await refreshAddressRecords()
      setImportPreview(null)
      setImportResult(result)
    } catch (error) {
      console.error(error)
      setImportError('İçe aktarma sırasında Supabase bağlantısı başarısız oldu.')
    } finally {
      setIsApplyingImport(false)
    }
  }

  return (
    <div className="workspace-page">
      <header className="topbar">
        <span className="workspace-context">Stok operasyonları</span>
        <div className="topbar__actions">
          <button className="settings-trigger" type="button" onClick={() => setIsSettingsOpen((open) => !open)} aria-expanded={isSettingsOpen}>Ayarlar</button>
          <span className="topbar__status"><span className="status-dot" /> Supabase çalışma alanı</span>
        </div>
      </header>

      <main className="home-content">
        <section className="intro" aria-labelledby="page-title">
          <p className="intro__eyebrow">STOK OPERASYONLARI</p>
          <h1 id="page-title">Stok ve adresleme<br />yönetimi</h1>
          <p className="intro__description">Günlük stok akışınızı daha düzenli, hızlı ve anlaşılır hale getirin.</p>
        </section>

        <section className="data-overview" aria-label="Veri özeti">
          <div className="overview-metric"><span>Toplam stok</span><strong>{totalStockCount}</strong></div>
          <div className="overview-metric"><span>Aktif adres</span><strong>{activeAddressRecords.length}</strong></div>
          <div className="overview-metric"><span>Toplam koli</span><strong>{totalCartonCount}</strong></div>
          <button className="button button--secondary export-button" type="button" onClick={exportData}>Verileri Dışa Aktar</button>
          <input ref={importInputRef} className="visually-hidden" type="file" accept=".xlsx,.csv" onChange={handleImportFile} />
          <button className="button button--secondary" type="button" onClick={openImportPicker} disabled={isImporting}>
            {isImporting ? 'Excel dosyası okunuyor...' : 'Excel\'den İçe Aktar'}
          </button>
          {exportMessage && <p className="export-message" role="status">{exportMessage}</p>}
          {importError && <p className="import-error" role="alert">{importError}</p>}
          {copyMessage && <p className={copyMessage === 'Kopyalandı' ? 'copy-message' : 'import-error'} role="status">{copyMessage}</p>}
          {backupMessage && <p className="export-message" role="status">{backupMessage}</p>}
          {loadError && <p className="import-error" role="alert">{loadError}</p>}
        </section>

        {isSettingsOpen && (
          <section className="settings-panel" aria-labelledby="settings-title">
            <div className="settings-panel__header">
              <div><p className="intro__eyebrow">UYGULAMA</p><h2 id="settings-title">Ayarlar</h2></div>
              <button className="modal-close" type="button" onClick={() => setIsSettingsOpen(false)} aria-label="Ayarları kapat">×</button>
            </div>
            <div className="settings-grid">
              <div className="settings-section">
                <span className="selected-product__label">Veri yönetimi</span>
                <div className="settings-actions">
                  <button className="button button--secondary" type="button" onClick={backupData}>Verileri Yedekle</button>
                  <input ref={backupInputRef} className="visually-hidden" type="file" accept=".json,application/json" onChange={handleBackupFile} />
                  <button className="button button--secondary" type="button" onClick={() => backupInputRef.current?.click()}>Yedekten Geri Yükle</button>
                  <button className="button button--danger" type="button" onClick={() => setIsResetConfirmOpen(true)}>Tüm Verileri Sil</button>
                </div>
              </div>
              <div className="settings-section settings-about">
                <span className="selected-product__label">Uygulama</span>
                <strong>StokAdres</strong>
                <span>Stok ve adres yönetim uygulaması</span>
                <span>Version: {packageInfo.version}</span>
              </div>
            </div>
            {restoreError && <p className="import-error" role="alert">{restoreError}</p>}
          </section>
        )}

        <section className="stock-workspace" aria-labelledby="stock-search-title">
          <div className="section-heading">
            <h2 id="stock-search-title">Stok ara ve adresini yönet</h2>
            <span className="section-heading__line" />
          </div>
          <label className="search-field">
            <span className="search-field__icon" aria-hidden="true">⌕</span>
            <span className="visually-hidden">Stok kodu, stok adı veya barkod ara</span>
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Stok kodu, stok adı veya barkod ara..."
            />
            {query && <button className="search-field__clear" type="button" onClick={() => setQuery('')} aria-label="Aramayı temizle">×</button>}
          </label>

          <div className="listing-controls" aria-label="Stok filtre ve sıralama seçenekleri">
            <label className="compact-control">
              <span>Filtre</span>
              <select value={productFilter} onChange={(event) => setProductFilter(event.target.value as ProductFilter)}>
                <option value="all">Tümü</option>
                <option value="has-address">Aktif adresi olanlar</option>
                <option value="multiple-addresses">Birden fazla adresi olanlar</option>
                <option value="single-address">Tek adresli stoklar</option>
              </select>
            </label>
            <label className="compact-control">
              <span>Sıralama</span>
              <select value={productSort} onChange={(event) => setProductSort(event.target.value as ProductSort)}>
                <option value="relevance">Mevcut sıralama</option>
                <option value="stock-name">Stok adına göre</option>
                <option value="stock-code">Stok koduna göre</option>
                <option value="address-count">Adres sayısına göre</option>
                <option value="carton-count">Toplam koliye göre</option>
              </select>
            </label>
            <button
              className="sort-direction"
              type="button"
              aria-label={`Sıralama yönü: ${sortDirection === 'asc' ? 'artan' : 'azalan'}`}
              onClick={() => setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc')}
              disabled={productSort === 'relevance'}
            >
              {sortDirection === 'asc' ? '↑ Artan' : '↓ Azalan'}
            </button>
            <button className="clear-filters" type="button" onClick={clearProductFilters}>Filtreleri temizle</button>
            <span className="result-count">{results.length} stok bulundu</span>
          </div>

          {!query.trim() && (recentSearches.length > 0 || recentViewed.length > 0) && (
            <div className="recent-panels">
              {recentSearches.length > 0 && (
                <div className="recent-panel">
                  <span className="recent-panel__title">Son aramalar</span>
                  <div className="recent-items">
                    {recentSearches.slice(0, 5).map((product) => (
                      <button className="recent-item" key={`search-${product.id}`} type="button" onClick={() => selectRecentProduct(product)}>
                        <strong>{product.stockName}</strong><span>{product.stockCode}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {recentViewed.length > 0 && (
                <div className="recent-panel">
                  <span className="recent-panel__title">Son görüntülenenler</span>
                  <div className="recent-items">
                    {recentViewed.slice(0, 5).map((product) => {
                      const metrics = getProductMetrics(product, allAddressRecords)
                      return (
                        <button className="recent-item" key={`viewed-${product.id}`} type="button" onClick={() => selectRecentProduct(product)}>
                          <strong>{product.stockName}</strong><span>{metrics.addressCount} adres · {metrics.cartonCount} koli</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {isLoading && <p className="empty-state" role="status">Veriler yükleniyor...</p>}
          <div className="workspace-grid" aria-busy={isLoading}>
            <div className="results-panel">
              <div className="panel-caption"><span>Ürünler</span><span>{results.length} sonuç</span></div>
              <div className="product-results">
                {results.length === 0 && <p className="empty-state">Aramanızla eşleşen ürün bulunamadı.</p>}
                {results.map((product) => (
                  (() => {
                    const productMetrics = getProductMetrics(product, allAddressRecords)
                    const resultIndex = results.indexOf(product)

                    return (
                      <button
                        className={`product-result ${selectedProduct?.id === product.id ? 'product-result--selected' : ''} ${activeResultIndex === resultIndex ? 'product-result--keyboard-active' : ''}`}
                        key={product.id}
                        type="button"
                        aria-current={activeResultIndex === resultIndex ? 'true' : undefined}
                        onClick={() => selectProduct(product)}
                      >
                        <span className="product-result__main">
                          <strong>{product.stockName}</strong>
                          <span>{product.stockCode}</span>
                          {productMetrics.addressCount > 0 && <small>{productMetrics.addressCount} adres · {productMetrics.cartonCount} koli</small>}
                        </span>
                        {product.barcode && <span className="product-result__barcode">{product.barcode}</span>}
                      </button>
                    )
                  })()
                ))}
              </div>
            </div>

            <div className="record-panel">
              {!selectedProduct && <p className="empty-state empty-state--large">Adres bilgisini görmek için bir ürün seçin.</p>}
              {selectedProduct && (
                <>
                  <div className="selected-product">
                    <span className="selected-product__label">Seçilen ürün</span>
                    <strong>{selectedProduct.stockName}</strong>
                    <span>{selectedProduct.stockCode}{selectedProduct.barcode ? ` · ${selectedProduct.barcode}` : ''}</span>
                    <div className="quick-copy-actions">
                      <button className="button button--secondary" type="button" onClick={() => copyText(selectedProduct.stockCode)}>Stok kodunu kopyala</button>
                      <button className="button button--secondary" type="button" onClick={copySelectedProduct}>Tüm adresleri kopyala</button>
                    </div>
                  </div>
                  {selectedRecords.length > 0 && (
                    <div className="address-summary">
                      <div className="address-summary__heading">
                        <span className="selected-product__label">Aktif adresler</span>
                        <strong>{selectedRecords.length} adres · {selectedRecords.reduce((total, record) => total + record.cartonCount, 0)} koli</strong>
                      </div>
                      <div className="address-list">
                        {selectedRecords.map((record) => (
                          <div className="address-record" key={record.id}>
                            <div className="record-value"><span>Adres</span><strong>{record.address}</strong></div>
                            <div className="record-value"><span>Koli adedi</span><strong>{record.cartonCount}</strong></div>
                            <div className="record-actions">
                              <button className="button button--secondary" type="button" onClick={() => copyText(record.address)}>Adresi kopyala</button>
                              <button className="button button--secondary" type="button" onClick={() => copyText(String(record.cartonCount))}>Koliyi kopyala</button>
                              <button className="button button--secondary" type="button" onClick={() => openEditForm(record)}>Düzenle</button>
                              <button className="button button--danger" type="button" onClick={() => deleteAddress(record.id)}>Sil</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedRecords.length === 0 && !isFormOpen && (
                    <div className="address-empty-state">
                      <p>Bu ürün için henüz adres kaydı bulunmuyor.</p>
                      <button className="button button--primary" type="button" onClick={openNewAddressForm}>+ Adres Ekle</button>
                    </div>
                  )}
                  {selectedRecords.length > 0 && !isFormOpen && (
                    <button className="button button--secondary add-address-button" type="button" onClick={openNewAddressForm}>+ Adres Ekle</button>
                  )}
                  {isFormOpen && (
                    <form className="address-form" onSubmit={(event) => { event.preventDefault(); submitAddress() }}>
                      <span className="selected-product__label">{editingRecordId ? 'Adres kaydını düzenle' : 'Yeni adres kaydı'}</span>
                      <label>Adres<input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Örn. I37-2" /></label>
                      <label>Koli adedi<input type="number" min="1" step="1" value={cartonCount} onChange={(event) => setCartonCount(event.target.value)} placeholder="Örn. 29" /></label>
                      {formError && <p className="form-error" role="alert">{formError}</p>}
                      <div className="record-actions">
                        <button className="button button--primary" type="submit">{editingRecordId ? 'Değişiklikleri kaydet' : 'Adres kaydet'}</button>
                        <button className="button button--secondary" type="button" onClick={() => { setIsFormOpen(false); setEditingRecordId(null); setFormError('') }}>Vazgeç</button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        <section className="action-section" aria-labelledby="action-title">
          <div className="section-heading">
            <h2 id="action-title">Nereden başlayalım?</h2>
            <span className="section-heading__line" />
          </div>
          <div className="action-grid">
            <ActionCard
              icon="⌖"
              title="Adres Kayıt"
              description="Ürünlerin adres ve koli bilgilerini hızlı şekilde kaydet."
            />
            <ActionCard
              icon="▤"
              title="Fişten Liste Oluştur"
              description="Muhasebe programından alınan Excel dosyasından yazdırılabilir stok listesi oluştur."
            />
          </div>
        </section>
      </main>

      <footer className="footer">
        <span>StokAdres</span>
        <span>v{packageInfo.version}</span>
      </footer>

      {(importPreview || importResult) && (
        <div className="import-modal-backdrop" role="presentation">
          <section className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-preview-title">
            <div className="import-modal__header">
              <div>
                <p className="intro__eyebrow">{importResult ? 'İÇE AKTARMA SONUCU' : 'İÇE AKTARMA ÖNİZLEMESİ'}</p>
                <h2 id="import-preview-title">{importResult ? 'İçe aktarma tamamlandı' : 'Dosya kontrolü'}</h2>
              </div>
              <button className="modal-close" type="button" onClick={() => { setImportPreview(null); setImportResult(null) }} aria-label="İçe aktarmayı kapat">×</button>
            </div>
            {importResult ? (
              <div className="import-result" aria-label="İçe aktarma sonucu">
                <p>{importResult.totalRows} satır işlendi</p>
                <p>{importResult.addedRecords} yeni kayıt eklendi</p>
                <p>{importResult.conflictRecords} çakışma Çakışmalar Merkezi'ne gönderildi</p>
                <p>{importResult.duplicateRecords} duplicate atlandı</p>
                <p>{importResult.invalidRecords} hatalı satır atlandı</p>
                {importResult.failedRecords > 0 && <p>{importResult.failedRecords} kayıt oluşturulamadı</p>}
              </div>
            ) : (
              <>
                <div className="import-summary" aria-label="İçe aktarma özeti">
                  <span>{importPreview!.totalRows} satır</span>
                  <span>{importPreview!.validRows} geçerli</span>
                  <span>{importPreview!.newRecords} yeni</span>
                  <span>{importPreview!.duplicateRecords} duplicate</span>
                  <span>{importPreview!.invalidRows} hatalı</span>
                </div>
                <div className="import-table-wrap">
              <table className="import-table">
                <thead>
                  <tr><th>Satır</th><th>Stok Kodu</th><th>Stok İsmi</th><th>Adres</th><th>Koli</th><th>Durum</th><th>Hata</th></tr>
                </thead>
                <tbody>
                  {importPreview!.rows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td>{row.stockCode}</td>
                      <td>{row.stockName}</td>
                      <td>{row.address}</td>
                      <td>{row.cartonCount ?? '-'}</td>
                      <td><span className={`import-status import-status--${row.status}`}>{row.status === 'new' ? 'Yeni' : row.status === 'duplicate' ? (row.existingRecord ? 'Çakışma' : 'Duplicate') : 'Hatalı'}</span></td>
                      <td>{row.errors.join(' ') || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
                </div>
              </>
            )}
            <div className="import-modal__footer">
              <span>{importResult ? 'Yeni kayıtlar AddressRecordService üzerinden kaydedildi.' : 'Önizleme sırasında mevcut veriler değiştirilmez.'}</span>
              {importResult ? (
                <button className="button button--secondary" type="button" onClick={() => setImportResult(null)}>Kapat</button>
              ) : (
                <div className="import-modal__actions">
                  <button className="button button--secondary" type="button" onClick={() => setImportPreview(null)} disabled={isApplyingImport}>İptal</button>
                  <button className="button button--primary" type="button" onClick={applyImport} disabled={isApplyingImport}>
                    {isApplyingImport ? 'İçe aktarılıyor...' : 'İçe Aktar'}
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {restoreBackup && (
        <div className="import-modal-backdrop" role="presentation">
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="restore-title">
            <p className="intro__eyebrow">YEDEK GERİ YÜKLEME</p>
            <h2 id="restore-title">Mevcut veriler değiştirilecek</h2>
            <p>Mevcut veriler seçtiğiniz yedekle değiştirilecek. Devam etmek istiyor musunuz?</p>
            {(() => { const summary = getBackupSummary(restoreBackup.records); return <div className="import-summary"><span>{summary.totalRecords} kayıt</span><span>{summary.activeAddresses} aktif adres</span><span>{summary.totalCartons} koli</span><span>{summary.uniqueStocks} stok</span></div> })()}
            <div className="import-modal__actions">
              <button className="button button--secondary" type="button" onClick={() => setRestoreBackup(null)} disabled={isRestoring}>İptal</button>
              <button className="button button--primary" type="button" onClick={confirmRestore} disabled={isRestoring}>{isRestoring ? 'Geri yükleniyor...' : 'Devam et'}</button>
            </div>
          </section>
        </div>
      )}

      {isResetConfirmOpen && (
        <div className="import-modal-backdrop" role="presentation">
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="reset-title">
            <p className="intro__eyebrow">DİKKAT</p>
            <h2 id="reset-title">Tüm verileri sil</h2>
            <p>Adres kayıtlarının tamamı kalıcı olarak silinecek. Bu işlemi onaylıyor musunuz?</p>
            <div className="import-modal__actions">
              <button className="button button--secondary" type="button" onClick={() => setIsResetConfirmOpen(false)}>İptal</button>
              <button className="button button--danger" type="button" onClick={clearAllData}>Tüm verileri sil</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
