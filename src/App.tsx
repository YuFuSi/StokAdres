import { DashboardPage } from './pages/DashboardPage'
import { AppLayout, type AppPage } from './layouts/AppLayout'
import { StocksPage } from './pages/StocksPage'
import { AddressesPage } from './pages/AddressesPage'
import { ProductDetailPage } from './pages/ProductDetailPage'
import { AuditLogsPage } from './pages/AuditLogsPage'
import { OperationsPage } from './pages/OperationsPage'
import { CabaLookupPage } from './pages/CabaLookupPage'
import { ImportPage } from './pages/ImportPage'
import { useState } from 'react'
import type { ProductListFilter } from './services/productService'

export function App() {
  const [activePage, setActivePage] = useState<AppPage>('dashboard')
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null)
  const [stocksFilter, setStocksFilter] = useState<ProductListFilter>('all')

  const navigate = (page: AppPage) => {
    setSelectedProductId(null)
    setSelectedAddressId(null)
    setStocksFilter('all')
    setActivePage(page)
  }

  // Genel Bakış'taki metrikten Stoklar listesine, filtre önceden seçili olarak.
  // StocksPage her geçişte yeniden monte edildiği için filtre başlangıç
  // değeri olarak veriliyor; sonrasında kullanıcı serbestçe değiştirebilir.
  const openStocksWithFilter = (filter: ProductListFilter) => {
    setSelectedProductId(null)
    setSelectedAddressId(null)
    setStocksFilter(filter)
    setActivePage('stocks')
  }

  // Ctrl+K paletinden bir stok seçildiğinde doğrudan ürün detayına gidilir.
  // navigate() selectedProductId'yi sıfırladığı için ayrı bir giriş noktası
  // gerekiyor; aksi halde 'stocks' sayfası liste görünümünde açılırdı.
  const openProduct = (productId: string) => {
    setSelectedAddressId(null)
    setSelectedProductId(productId)
    setActivePage('stocks')
  }

  return (
    <AppLayout activePage={activePage} onNavigate={navigate} onProductSelect={openProduct}>
      {activePage === 'dashboard' && <DashboardPage onNavigate={navigate} onOpenStocks={openStocksWithFilter} />}
      {activePage === 'stocks' && selectedProductId && <ProductDetailPage productId={selectedProductId} onBack={() => setSelectedProductId(null)} onAddressSelect={(recordId) => { setSelectedProductId(null); setSelectedAddressId(recordId); setActivePage('addresses') }} />}
      {activePage === 'stocks' && !selectedProductId && <StocksPage onProductSelect={setSelectedProductId} initialFilter={stocksFilter} />}
      {activePage === 'addresses' && <AddressesPage initialSelectedRecordId={selectedAddressId} />}
      {activePage === 'find' && <OperationsPage page="find" />}
      {activePage === 'caba' && <CabaLookupPage />}
      {activePage === 'import' && <ImportPage />}
      {activePage === 'export' && <OperationsPage page="export" />}
      {activePage === 'settings' && <OperationsPage page="settings" />}
      {activePage === 'audit' && <AuditLogsPage />}
    </AppLayout>
  )
}
