import { HomePage } from './pages/HomePage'
import { DashboardPage } from './pages/DashboardPage'
import { AppLayout, type AppPage } from './layouts/AppLayout'
import { StocksPage } from './pages/StocksPage'
import { AddressesPage } from './pages/AddressesPage'
import { ProductDetailPage } from './pages/ProductDetailPage'
import { ConflictsPage } from './pages/ConflictsPage'
import { AuditLogsPage } from './pages/AuditLogsPage'
import { useState } from 'react'

export function App() {
  const [activePage, setActivePage] = useState<AppPage>('dashboard')
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)

  const navigate = (page: AppPage) => {
    setSelectedProductId(null)
    setActivePage(page)
  }

  return (
    <AppLayout activePage={activePage} onNavigate={navigate}>
      {activePage === 'dashboard' && <DashboardPage />}
      {activePage === 'stocks' && selectedProductId && <ProductDetailPage productId={selectedProductId} onBack={() => setSelectedProductId(null)} />}
      {activePage === 'stocks' && !selectedProductId && <StocksPage onBackToDashboard={() => navigate('dashboard')} onProductSelect={setSelectedProductId} />}
      {activePage === 'addresses' && <AddressesPage onBackToDashboard={() => setActivePage('dashboard')} />}
      {activePage === 'conflicts' && <ConflictsPage />}
      {activePage === 'audit' && <AuditLogsPage />}
      {activePage !== 'dashboard' && activePage !== 'stocks' && activePage !== 'addresses' && activePage !== 'conflicts' && activePage !== 'audit' && <HomePage />}
    </AppLayout>
  )
}
