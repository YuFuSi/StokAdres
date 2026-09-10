import { DashboardPage } from './pages/DashboardPage'
import { AppLayout, type AppPage } from './layouts/AppLayout'
import { StocksPage } from './pages/StocksPage'
import { AddressesPage } from './pages/AddressesPage'
import { ProductDetailPage } from './pages/ProductDetailPage'
import { ConflictsPage } from './pages/ConflictsPage'
import { AuditLogsPage } from './pages/AuditLogsPage'
import { OperationsPage } from './pages/OperationsPage'
import { CabaLookupPage } from './pages/CabaLookupPage'
import { useState } from 'react'

export function App() {
  const [activePage, setActivePage] = useState<AppPage>('dashboard')
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null)

  const navigate = (page: AppPage) => {
    setSelectedProductId(null)
    setSelectedAddressId(null)
    setActivePage(page)
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
      {activePage === 'dashboard' && <DashboardPage onNavigate={navigate} />}
      {activePage === 'stocks' && selectedProductId && <ProductDetailPage productId={selectedProductId} onBack={() => setSelectedProductId(null)} onAddressSelect={(recordId) => { setSelectedProductId(null); setSelectedAddressId(recordId); setActivePage('addresses') }} />}
      {activePage === 'stocks' && !selectedProductId && <StocksPage onBackToDashboard={() => navigate('dashboard')} onProductSelect={setSelectedProductId} />}
      {activePage === 'addresses' && <AddressesPage onBackToDashboard={() => setActivePage('dashboard')} initialSelectedRecordId={selectedAddressId} />}
      {activePage === 'find' && <OperationsPage page="find" />}
      {activePage === 'caba' && <CabaLookupPage />}
      {activePage === 'import' && <OperationsPage page="import" />}
      {activePage === 'export' && <OperationsPage page="export" />}
      {activePage === 'settings' && <OperationsPage page="settings" />}
      {activePage === 'conflicts' && <ConflictsPage />}
      {activePage === 'audit' && <AuditLogsPage />}
    </AppLayout>
  )
}
