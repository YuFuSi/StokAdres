import { useEffect, useState } from 'react'
import { getDashboardData, type DashboardData } from '../services/dashboardService'

export function DashboardPage() {
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
          <h1>Dashboard</h1>
          <p className="page-header__description">Stok ve adres operasyonlarınızın güncel görünümü.</p>
        </div>
        <span className="topbar__status"><span className="status-dot" /> Canlı veri</span>
      </header>

      {isLoading && <p className="dashboard-state" role="status">Veriler yükleniyor...</p>}
      {error && <p className="dashboard-state dashboard-state--error" role="alert">{error}</p>}
      {data && !error && (
        <>
          <section className="dashboard-metrics" aria-label="Stok metrikleri">
            <Metric label="Toplam stok" value={data.totalStocks} />
            <Metric label="Aktif adres" value={data.totalActiveAddresses} />
            <Metric label="Çok adresli stok" value={data.stocksWithMultipleAddresses} />
            <Metric label="Aktif kayıt" value={data.totalActiveRecords} />
          </section>
          <section className="dashboard-section" aria-labelledby="recent-records-title">
            <div className="section-heading"><h2 id="recent-records-title">Son Eklenen Stoklar</h2><span className="section-heading__line" /></div>
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

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="dashboard-metric"><span>{label}</span><strong>{value}</strong></div>
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}