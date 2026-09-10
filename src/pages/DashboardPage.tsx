import { useEffect, useState } from 'react'
import { getDashboardData, type DashboardData } from '../services/dashboardService'
import { ArrowRight, Download, MapPin, PackagePlus, Upload } from 'lucide-react'
import type { AppPage } from '../layouts/AppLayout'
import type { ProductListFilter } from '../services/productService'
import { formatNumber } from '../lib/format'

type DashboardPageProps = {
  onNavigate: (page: AppPage) => void
  /** Metrikten Stoklar ekranına, ilgili filtre önceden seçili olarak geçer. */
  onOpenStocks: (filter: ProductListFilter) => void
}

export function DashboardPage({ onNavigate, onOpenStocks }: DashboardPageProps) {
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
          <h1>Genel Bakış</h1>
          <p className="page-header__description">Depodaki mevcut durumu tek bakışta görün.</p>
        </div>
      </header>

      {isLoading && <p className="dashboard-state" role="status">Veriler yükleniyor...</p>}
      {error && <p className="dashboard-state dashboard-state--error" role="alert">{error}</p>}
      {data && !error && (
        <>
          <section className="dashboard-metrics" aria-label="Stok metrikleri">
            {/* Tıklanabilir olanlar Stoklar ekranındaki bir filtreye birebir
                karşılık gelenler. "Toplam koli" bir toplam, "Adresli stok" ise
                tek bir filtreye karşılık gelmiyor (tek + çoklu adres); ikisi
                de düz sayı olarak duruyor. */}
            <Metric label="Toplam stok" hint="Kayıtlı ürün kartı" value={data.totalStocks} onOpen={() => onOpenStocks('all')} />
            <Metric label="Toplam koli" hint="Aktif konumlardaki miktar" value={data.totalCartons} />
            <Metric label="Adresli stok" hint="Fiziksel konumu olan" value={data.productsWithAddress} />
            <Metric label="Adresi olmayan" hint="Konum bekleyen ürün" value={data.productsWithoutAddress} onOpen={() => onOpenStocks('no-address')} />
          </section>
          {/* "Son İşlemler" paneli kaldırıldı: iki cümleden ibaretti, yarım
              ekran boşluk kaplıyordu ve söylediği şeyi (son hareketler) hemen
              altındaki "Son Eklenen Adresler" tablosu zaten gösteriyordu.
              Taşıdığı tek gerçek sayı — aktif kayıt adedi — o tablonun
              başlığına taşındı. */}
          <section className="dashboard-operations">
            <div className="dashboard-quick"><div className="section-heading"><h2>Hızlı İşlemler</h2><span className="section-heading__line" /></div><div className="dashboard-quick__actions">{[[PackagePlus,'Stok Ekle','stocks'],[MapPin,'Adres Bul','find'],[Upload,'Excel İçe Aktar','import'],[Download,'Dışa Aktar','export']].map(([Icon,label,page]) => { const ActionIcon = Icon as typeof PackagePlus; return <button key={label as string} type="button" onClick={() => onNavigate(page as AppPage)}><ActionIcon size={16}/><span>{label as string}</span><ArrowRight size={14}/></button> })}</div></div>
          </section>
          <section className="dashboard-section" aria-labelledby="recent-records-title">
            <div className="section-heading"><h2 id="recent-records-title">Son Eklenen Adresler</h2><span className="section-heading__line" /><small>{formatNumber(data.activeAddressRecords)} aktif kayıt</small></div>
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
                      <td>{formatNumber(record.cartonCount)}</td>
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

/**
 * `onOpen` verildiğinde metrik gerçek bir butona dönüşür: klavyeyle
 * odaklanılabilir, Enter/Space ile açılır ve ok işaretiyle tıklanabilir olduğu
 * belli olur. Verilmediğinde düz bir kutu olarak kalır — tıklanacakmış gibi
 * görünüp hiçbir şey yapmaması en kötü seçenek olurdu.
 */
function Metric({ label, hint, value, onOpen }: { label: string; hint: string; value: number; onOpen?: () => void }) {
  const body = <>
    <div className="dashboard-metric__top"><span>{label}</span>{onOpen && <ArrowRight size={14} aria-hidden="true" />}</div>
    <strong>{formatNumber(value)}</strong>
    <small>{hint}</small>
  </>
  if (!onOpen) return <div className="dashboard-metric">{body}</div>
  return <button className="dashboard-metric dashboard-metric--link" type="button" onClick={onOpen} aria-label={`${label}: ${value}. Listeyi aç`}>{body}</button>
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}
