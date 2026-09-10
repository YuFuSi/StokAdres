import { useEffect, useState } from 'react'
import { getDashboardData, type DashboardData } from '../services/dashboardService'
import { ArrowRight, Download, MapPin, PackagePlus, Upload } from 'lucide-react'
import type { AppPage } from '../layouts/AppLayout'

export function DashboardPage({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    getDashboardData()
      .then((nextData) => { if (isMounted) setData(nextData) })
      .catch((reason: unknown) => {
        console.error(reason)
        if (isMounted) setError(reason instanceof Error ? reason.message : 'Dashboard verileri yüklenemedi.')
      })
      .finally(() => { if (isMounted) setIsLoading(false) })
    return () => { isMounted = false }
  }, [])

  return (
    <main className="dashboard-page">
      <header className="page-header">
        <div>
          <p className="intro__eyebrow">GENEL BAKIŞ</p>
          <h1>Genel Bakış</h1>
          <p className="page-header__description">Depodaki mevcut durumu tek bakışta görün.</p>
        </div>
        <span className="topbar__status"><span className="status-dot" /> Canlı veri</span>
      </header>

      {isLoading && <p className="dashboard-state" role="status">Veriler yükleniyor...</p>}
      {error && <p className="dashboard-state dashboard-state--error" role="alert">{error}</p>}
      {data && !error && (
        <>
          <section className="dashboard-metrics" aria-label="Stok metrikleri">
            <Metric label="Toplam stok" hint="Kayıtlı ürün kartı" value={data.totalStocks} />
            <Metric label="Toplam koli" hint="Aktif konumlardaki miktar" value={data.totalCartons} />
            <Metric label="Adresli stok" hint="Fiziksel konumu olan" value={data.productsWithAddress} />
            <Metric label="Adresi olmayan" hint="Konum bekleyen ürün" value={data.productsWithoutAddress} />
          </section>
          <section className="dashboard-operations">
            <div className="dashboard-activity"><div className="section-heading"><h2>Son İşlemler</h2><span className="section-heading__line" /></div><p><span className="status-dot" /> {data.activeAddressRecords} aktif adres kaydı depoda takip ediliyor.</p><p className="dashboard-activity__hint">Kayıt ayrıntıları ve geçmiş hareketler sistem ekranından izlenebilir.</p></div>
            <div className="dashboard-quick"><div className="section-heading"><h2>Hızlı İşlemler</h2></div><div>{[[PackagePlus,'Stok Ekle','stocks'],[MapPin,'Adres Bul','find'],[Upload,'Excel İçe Aktar','import'],[Download,'Dışa Aktar','export']].map(([Icon,label,page]) => { const ActionIcon = Icon as typeof PackagePlus; return <button key={label as string} type="button" onClick={() => onNavigate(page as AppPage)}><ActionIcon size={16}/><span>{label as string}</span><ArrowRight size={14}/></button> })}</div></div>
          </section>
          <section className="dashboard-section" aria-labelledby="recent-records-title">
            <div className="section-heading"><h2 id="recent-records-title">Son Eklenen Adresler</h2><span className="section-heading__line" /></div>
            {data.recentRecords.length === 0 ? (
              <p className="dashboard-empty">Henüz kayıt bulunmuyor.</p>
            ) : (
              <div className="recent-records-table-wrap">
                <table className="recent-records-table">
                  <thead><tr><th>Stok kodu</th><th>Stok adı</th><th>Adres</th><th>Koli</th><th>Tarih</th></tr></thead>
                  <tbody>{data.recentRecords.map((record) => (
                    <tr key={record.id}>
                      <td><strong>{record.stockCode}</strong></td>
                      <td>{record.stockName}</td>
                      <td>{record.address}</td>
                      <td>{record.cartonCount}</td>
                      <td>{formatDate(record.createdAt)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  )
}

function Metric({ label, hint, value }: { label: string; hint: string; value: number }) {
  return <div className="dashboard-metric"><div className="dashboard-metric__top"><span>{label}</span></div><strong>{value}</strong><small>{hint}</small></div>
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}
