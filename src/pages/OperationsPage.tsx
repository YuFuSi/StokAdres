import { useEffect, useState } from 'react'
import { Download, Search } from 'lucide-react'
import { addressRecordService } from '../data/localData'
import { exportAddressRecordsCsv } from '../services/csvExport'
import { addressRows, exportWorkbook, stockAddressRows, stockRows, summaryRows, type ExportDataset } from '../services/xlsxExport'
import { listProducts } from '../services/productService'
import { searchProducts } from '../services/productSearch'
import type { AddressRecord } from '../types/addressRecord'
import type { Product } from '../types/product'
import { useTheme } from '../components/ThemeProvider'
import './OperationsPage.css'

// 'import' artık burada değil: içe aktarma kendi ekranına taşındı
// (src/pages/ImportPage.tsx), CABA da öyle (src/pages/CabaLookupPage.tsx).
type Props = { page: 'find' | 'export' | 'settings' }

export function OperationsPage({ page }: Props) { if (page === 'export') return <ExportHub/>; if (page === 'find') return <Finder/>; return <Settings/> }


function ExportHub() { const [format, setFormat] = useState<'csv' | 'xlsx'>('csv'), [datasets, setDatasets] = useState<ExportDataset[]>(['stocks']), [message, setMessage] = useState(''); const toggle = (dataset: ExportDataset) => setDatasets(current => current.includes(dataset) ? current.filter(item => item !== dataset) : [...current, dataset]); const run = async () => { if (!datasets.length) return; try { const [products, records] = await Promise.all([listProducts(), addressRecordService.list()]); const primary = datasets[0]; const stamp = new Date().toISOString().slice(0,10); const name = `StokAdres_${primary}_${stamp}.${format}`; let ok: boolean; if (format === 'xlsx') ok = await exportWorkbook(records, products, name, datasets); else { const rows = primary === 'stocks' ? stockRows(products) : primary === 'addresses' ? addressRows(records) : primary === 'stock-address' ? stockAddressRows(records, products) : summaryRows(records, products); const csv = `\uFEFF${toCsv(rows)}`; const electron = window as Window & { electronAPI?: { saveCsv: (name: string, data: string) => Promise<{ canceled: boolean }> } }; ok = electron.electronAPI ? !(await electron.electronAPI.saveCsv(name, csv)).canceled : await exportAddressRecordsCsv(records, products, name) }; setMessage(ok ? 'Dosya oluşturuldu.' : 'Kaydetme işlemi iptal edildi.') } catch (error) { console.error(error); setMessage('Dışa aktarma sırasında dosya oluşturulamadı.') } }; return <main className="operations-page"><Intro eyebrow="VERİ" title="Dışa Aktar" description="Önce veri kümesini, ardından dosya formatını seçin."/><section className="export-flow"><Choice title="Veri" value={datasets[0] ?? ''} onChange={value => format === 'csv' ? setDatasets([value as ExportDataset]) : toggle(value as ExportDataset)} options={[["stocks",'Stoklar'],['addresses','Adresler'],['stock-address','Stok + Adres'],['summary','Özet']]}/>{format === 'xlsx' && <p className="export-hint">Excel için birden çok veri kümesini seçebilirsiniz.</p>}<Choice title="Format" value={format} onChange={value => { setFormat(value as 'csv' | 'xlsx'); if (value === 'csv' && datasets.length > 1) setDatasets([datasets[0]]) }} options={[["csv",'CSV'],['xlsx','Excel (.xlsx)']]}/><div className="export-action"><p>{message || 'CSV tek veri kümesi, Excel seçili veri kümeleri için ayrı worksheet oluşturur.'}</p><button className="button button--primary" disabled={!datasets.length} onClick={() => void run()}><Download size={15}/> Dışa Aktar</button></div></section></main> }

// Adres Bul: kullanıcının tek sorusu "bu stok nerede?" — bu yüzden adres,
// karttaki görsel olarak en baskın bilgi. Arama mantığı productSearch içindeki
// mevcut motordan geliyor (stok kodu / stok adı / barkod / adres, tr-TR duyarlı);
// burada ikinci bir arama uygulaması yok.
const FINDER_RESULT_LIMIT = 20
function Finder() {
  const [products, setProducts] = useState<Product[]>([])
  const [records, setRecords] = useState<AddressRecord[]>([])
  const [query, setQuery] = useState('')
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
        if (isMounted) setError('Stok verileri yüklenirken bir sorun oluştu.')
      })
      .finally(() => { if (isMounted) setIsLoading(false) })
    return () => { isMounted = false }
  }, [])

  const trimmedQuery = query.trim()
  // searchProducts sorgu boşken tüm ürünleri döndürür; kısa devre yapılmazsa
  // arama yapılmadan 1655 kart basılırdı.
  const matches = trimmedQuery ? searchProducts(products, trimmedQuery, records) : []
  const visible = matches.slice(0, FINDER_RESULT_LIMIT)
  const addressesFor = (product: Product) => records.filter((record) => record.productId === product.id && record.isActive)

  return <main className="operations-page">
    <Intro eyebrow="OPERASYON" title="Adres Bul" description="Stok kodu, stok adı, barkod veya adrese göre fiziksel konumları görüntüleyin." />
    <section className="finder-hero">
      <label className="finder-input">
        <Search size={19} />
        <span className="visually-hidden">Stok kodu, stok adı, barkod veya adres ara</span>
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Stok kodu, stok adı, barkod veya adres…" />
      </label>
    </section>

    {isLoading && <div className="operation-state" role="status"><p>Stoklar yükleniyor...</p></div>}
    {!isLoading && error && <div className="operation-state operation-state--error" role="alert"><p>{error}</p></div>}
    {!isLoading && !error && !trimmedQuery && <div className="operation-state"><p>Aramak için stok kodu, stok adı, barkod veya adres yazın.</p></div>}
    {!isLoading && !error && trimmedQuery && visible.length === 0 && <div className="operation-state" role="status"><p>“{trimmedQuery}” ile eşleşen stok bulunamadı.</p></div>}

    {!isLoading && !error && visible.length > 0 && <>
      <section className="finder-results">
        {visible.map((product) => {
          const addresses = addressesFor(product)
          const primary = addresses[0]
          return <article className="finder-result" key={product.id}>
            <div className="finder-result__header">
              <div>
                <h2>{product.stockName}</h2>
                <div className="chip-row">
                  <span className="data-chip">{product.stockCode}</span>
                  {product.barcodes.map((code) => <span className="data-chip" key={code}>{code}</span>)}
                </div>
              </div>
              <strong className="finder-result__address">
                {primary ? primary.address : 'Adres yok'}
                <small>{primary ? `${primary.cartonCount} koli${addresses.length > 1 ? ` · +${addresses.length - 1} konum` : ''}` : 'Kayıtlı konum yok'}</small>
              </strong>
            </div>
            {addresses.length > 1 && <div className="finder-addresses">
              {addresses.map((record) => <div key={record.id}><strong>{record.address}</strong><span>{record.cartonCount} koli</span></div>)}
            </div>}
          </article>
        })}
      </section>
      {matches.length > visible.length && <p className="finder-more">{matches.length} sonuçtan ilk {visible.length} tanesi gösteriliyor. Aramanızı daraltın.</p>}
    </>}
  </main>
}
function Settings() { const { theme, toggleTheme } = useTheme(); return <main className="operations-page"><Intro eyebrow="SİSTEM" title="Ayarlar" description="Uygulama tercihleri."/><button className="button button--secondary" onClick={toggleTheme}>{theme === 'light' ? 'Koyu tema' : 'Açık tema'}</button></main> }
function toCsv(rows: Record<string, string | number>[]) { if (!rows.length) return ''; const headers = Object.keys(rows[0]); const field = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`; return [headers, ...rows.map(row => headers.map(header => field(row[header] ?? '')).join(','))].map(row => Array.isArray(row) ? row.join(',') : row).join('\r\n') }
function Intro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <header className="page-header"><div><p className="intro__eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-header__description">{description}</p></div></header> }
function Choice({ title, value, onChange, options }: { title: string; value: string; onChange: (value: string) => void; options: string[][] }) { return <section className="choice-group"><h2>{title}</h2><div>{options.map(([id,label]) => <button key={id} className={value === id ? 'choice choice--active' : 'choice'} onClick={() => onChange(id)}><span>{label}</span><i/></button>)}</div></section> }
