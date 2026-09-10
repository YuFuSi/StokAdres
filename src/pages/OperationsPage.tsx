import { useEffect, useState } from 'react'
import { Download, Search } from 'lucide-react'
import { addressRecordService } from '../data/localData'
import { createCsvFromRows, saveCsvFile } from '../services/csvExport'
import { addressRows, exportWorkbook, stockAddressRows, stockRows, summaryRows, type ExportDataset } from '../services/xlsxExport'
import { getProductFilterCounts, listProducts, queryProducts, type ProductListItem } from '../services/productService'
import { findActiveAddresses, findBarcodesByProductId, type AddressLite } from '../services/productLookup'
import type { Product } from '../types/product'
import { useTheme, type ThemePreference } from '../components/ThemeProvider'
import { checkConnection, type ConnectionState } from '../services/connectionStatus'
import { formatNumber } from '../lib/format'
import './OperationsPage.css'

// 'import' artık burada değil: içe aktarma kendi ekranına taşındı
// (src/pages/ImportPage.tsx), CABA da öyle (src/pages/CabaLookupPage.tsx).
type Props = { page: 'find' | 'export' | 'settings' }

export function OperationsPage({ page }: Props) { if (page === 'export') return <ExportHub/>; if (page === 'find') return <Finder/>; return <Settings/> }


const SHEET_NAME: Record<ExportDataset, string> = {
  stocks: 'Stoklar', addresses: 'Adresler', 'stock-address': 'Stok_Adres', summary: 'Özet',
}

/**
 * Dışa Aktar.
 *
 * Eskiden hangi veri kümesi seçilirse seçilsin listProducts() + tüm adres
 * kayıtları çekiliyordu — yalnızca "Özet" için bile 94.900 ürün (~95 istek).
 * Artık her küme yalnızca ihtiyacı olanı istiyor:
 *
 *   Stoklar      -> tüm ürünler (kaçınılmaz; dışa aktarmanın kendisi bu)
 *   Adresler     -> yalnızca adres kayıtları
 *   Stok + Adres -> adres kayıtları + O KAYITLARIN ürünlerinin barkodları
 *   Özet         -> adres kayıtları + tek satırlık ürün sayısı
 *
 * "Stoklar" hâlâ 95 istek sürüyor; bu yüzden ilerleme gösteriliyor.
 */
function ExportHub() {
  const [format, setFormat] = useState<'csv' | 'xlsx'>('csv')
  const [datasets, setDatasets] = useState<ExportDataset[]>(['stocks'])
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState('')
  const [isExporting, setIsExporting] = useState(false)

  const toggle = (dataset: ExportDataset) =>
    setDatasets(current => current.includes(dataset) ? current.filter(item => item !== dataset) : [...current, dataset])

  const buildSheets = async (selected: ExportDataset[]) => {
    const needsProducts = selected.includes('stocks')
    const needsRecords = selected.some(d => d !== 'stocks')
    const needsBarcodes = selected.includes('stock-address')
    const needsProductCount = selected.includes('summary')

    setProgress('Veriler hazırlanıyor…')
    const records = needsRecords ? await addressRecordService.list() : []

    let products: Product[] = []
    if (needsProducts) {
      products = await listProducts((loaded) => setProgress(`${loaded.toLocaleString('tr-TR')} stok alındı…`))
    }

    const barcodes = needsBarcodes
      ? await findBarcodesByProductId(records.map(record => record.productId))
      : new Map<string, string[]>()

    const totalProducts = needsProductCount
      ? (needsProducts ? products.length : (await getProductFilterCounts()).all)
      : 0

    setProgress('Dosya oluşturuluyor…')
    const rowsFor = (dataset: ExportDataset) =>
      dataset === 'stocks' ? stockRows(products)
      : dataset === 'addresses' ? addressRows(records)
      : dataset === 'stock-address' ? stockAddressRows(records, barcodes)
      : summaryRows(records, { totalProducts })

    return selected.map(dataset => ({ name: SHEET_NAME[dataset], rows: rowsFor(dataset) }))
  }

  const run = async () => {
    if (!datasets.length || isExporting) return
    setIsExporting(true)
    setMessage('')
    try {
      const sheets = await buildSheets(datasets)
      const stamp = new Date().toISOString().slice(0, 10)
      const name = `StokAdres_${datasets[0]}_${stamp}.${format}`
      // CSV tek veri kümesi taşır; Excel her kümeyi ayrı worksheet yapar.
      const ok = format === 'xlsx'
        ? await exportWorkbook(sheets, name)
        : await saveCsvFile(createCsvFromRows(sheets[0].rows), name)
      const total = sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0)
      setMessage(ok ? `Dosya oluşturuldu · ${total.toLocaleString('tr-TR')} satır.` : 'Kaydetme işlemi iptal edildi.')
    } catch (error) {
      console.error(error)
      setMessage('Dışa aktarma sırasında dosya oluşturulamadı.')
    } finally {
      setIsExporting(false)
      setProgress('')
    }
  }

  return <main className="operations-page">
    <Intro title="Dışa Aktar" description="Önce veri kümesini, ardından dosya formatını seçin." />
    <section className="export-flow">
      <Choice step="01" title="Veri" value={datasets[0] ?? ''} onChange={value => format === 'csv' ? setDatasets([value as ExportDataset]) : toggle(value as ExportDataset)} options={[['stocks', 'Stoklar'], ['addresses', 'Adresler'], ['stock-address', 'Stok + Adres'], ['summary', 'Özet']]} />
      {format === 'xlsx' && <p className="export-hint">Excel için birden çok veri kümesini seçebilirsiniz.</p>}
      {datasets.includes('stocks') && <p className="export-hint">Stoklar kümesi ~95.000 satır; hazırlanması biraz sürer.</p>}
      <Choice step="02" title="Format" value={format} onChange={value => { setFormat(value as 'csv' | 'xlsx'); if (value === 'csv' && datasets.length > 1) setDatasets([datasets[0]]) }} options={[['csv', 'CSV'], ['xlsx', 'Excel (.xlsx)']]} />
      <div className="export-action">
        <p role={isExporting ? 'status' : undefined}>{progress || message || 'CSV tek veri kümesi, Excel seçili veri kümeleri için ayrı worksheet oluşturur.'}</p>
        <button className="button button--primary" disabled={!datasets.length || isExporting} onClick={() => void run()}><Download size={15} /> {isExporting ? 'Hazırlanıyor…' : 'Dışa Aktar'}</button>
      </div>
    </section>
  </main>
}

const FINDER_RESULT_LIMIT = 20
const FINDER_DEBOUNCE_MS = 250

/**
 * Adres Bul — kullanıcının tek sorusu "bu stok nerede?".
 *
 * Bu ekran ESKİDEN açılışta listProducts() + addressRecordService.list()
 * çağırıyordu. 94.900 üründe bu ~95 sayfalık istek ve ~33 MB demek: ekran
 * "Stoklar yükleniyor..." yazısında takılı kalıyordu ve pratikte kullanılamaz
 * durumdaydı.
 *
 * Artık açılışta HİÇBİR veri çekilmiyor. Arama sunucuda `search_products`
 * fonksiyonuyla yapılıyor ve yalnızca ekranda görünen en fazla 20 sonucun
 * adresleri ayrıca sorgulanıyor. Ölçüm (94.900 ürün, Tokyo bölgesi):
 * arama 0,6–1,6 sn, adresler ~0,3 sn — sürenin büyük kısmı ağ gecikmesi.
 *
 * `search_products` stok kodu, stok adı, barkod VE aktif adres arıyor
 * (20260910223000). Adres yazıldığında o raftaki ürünler dönüyor — ters arama
 * ayrı bir ekran değil, aynı kutunun içinde.
 */
function Finder() {
  const [query, setQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [results, setResults] = useState<ProductListItem[]>([])
  const [addressesByProduct, setAddressesByProduct] = useState<Map<string, AddressLite[]>>(new Map())
  const [total, setTotal] = useState(0)
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState('')

  // Her tuş vuruşunda sorgu atmamak için gecikme. Barkod okuyucu gibi hızlı
  // girişlerde de tek sorguya iniyor.
  useEffect(() => {
    const timer = window.setTimeout(() => setActiveQuery(query.trim()), FINDER_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (!activeQuery) {
      setResults([])
      setAddressesByProduct(new Map())
      setTotal(0)
      setError('')
      setIsSearching(false)
      return
    }

    let cancelled = false
    setIsSearching(true)
    setError('')

    void (async () => {
      try {
        const { items, total: matchCount } = await queryProducts({ query: activeQuery, pageSize: FINDER_RESULT_LIMIT })
        if (cancelled) return
        // Adresler yalnızca gösterilecek satırlar için çekiliyor; tüm adres
        // tablosunu indirmeye gerek yok.
        const addresses = await findActiveAddresses(items.map((item) => item.id))
        if (cancelled) return
        setResults(items)
        setTotal(matchCount)
        setAddressesByProduct(addresses)
      } catch (reason: unknown) {
        console.error(reason)
        if (!cancelled) {
          setError('Arama yapılamadı. Bağlantınızı kontrol edip tekrar deneyin.')
          setResults([])
          setAddressesByProduct(new Map())
          setTotal(0)
        }
      } finally {
        if (!cancelled) setIsSearching(false)
      }
    })()

    return () => { cancelled = true }
  }, [activeQuery])

  const trimmedQuery = query.trim()
  const visible = results

  return <main className="operations-page">
    <Intro title="Adres Bul" description="Stoktan adrese, adresten stoğa arama." />
    <section className="finder-hero">
      <label className="finder-input">
        <Search size={19} />
        <span className="visually-hidden">Stok kodu, stok adı, barkod veya adres ara</span>
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Stok kodu, stok adı, barkod veya adres…" />
      </label>
    </section>

    {error && <div className="operation-state operation-state--error" role="alert"><p>{error}</p></div>}
    {!error && !trimmedQuery && <div className="operation-state"><p>Stok kodu, stok adı veya barkod yazın. Adres yazarsanız (örn. G27-04) o raftaki ürünler listelenir.</p></div>}
    {!error && trimmedQuery && isSearching && <div className="operation-state" role="status"><p>Aranıyor…</p></div>}
    {!error && trimmedQuery && !isSearching && visible.length === 0 && <div className="operation-state" role="status"><p>“{trimmedQuery}” ile eşleşen stok bulunamadı.</p></div>}

    {!error && visible.length > 0 && <>
      <section className="finder-results">
        {visible.map((product) => {
          const addresses = addressesByProduct.get(product.id) ?? []
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
                <small>{primary ? `${formatNumber(primary.cartonCount)} koli${addresses.length > 1 ? ` · +${addresses.length - 1} konum` : ''}` : 'Kayıtlı konum yok'}</small>
              </strong>
            </div>
            {addresses.length > 1 && <div className="finder-addresses">
              {addresses.map((record) => <div key={record.id}><strong>{record.address}</strong><span>{formatNumber(record.cartonCount)} koli</span></div>)}
            </div>}
          </article>
        })}
      </section>
      {total > visible.length && <p className="finder-more">{formatNumber(total)} sonuçtan ilk {visible.length} tanesi gösteriliyor. Aramanızı daraltın.</p>}
    </>}
  </main>
}
/**
 * Ayarlar ekranı.
 *
 * Eskiden başlık + tek bir "Koyu tema" butonundan ibaretti; ekranın geri kalanı
 * boştu ve buton açıklamaya yapışıktı. Artık üç satır: tema seçimi (üç durumlu,
 * çünkü ThemeProvider 'system' tercihini zaten destekliyordu ama arayüzde
 * erişilebilir değildi), veritabanı durumu ve sürüm bilgisi.
 */
const THEME_OPTIONS: Array<[ThemePreference, string]> = [['light', 'Açık'], ['dark', 'Koyu'], ['system', 'Sistem']]
const SETTINGS_CONNECTION_TEXT: Record<ConnectionState, string> = { checking: 'Denetleniyor…', online: 'Bağlantı kurulu', offline: 'Ulaşılamıyor' }

function Settings() {
  const { theme, setTheme } = useTheme()
  const [connection, setConnection] = useState<ConnectionState>('checking')

  useEffect(() => {
    let cancelled = false
    void checkConnection().then((ok) => { if (!cancelled) setConnection(ok ? 'online' : 'offline') })
    return () => { cancelled = true }
  }, [])

  return <main className="operations-page">
    <Intro title="Ayarlar" description="Uygulama tercihleri ve sistem bilgileri." />
    <section className="settings-cards" aria-label="Ayarlar">
      <article>
        <h2>Görünüm</h2>
        <p>Arayüz teması. “Sistem” seçilirse Windows’un açık/koyu tercihi izlenir.</p>
        <div className="theme-segment" role="group" aria-label="Tema seçimi">
          {THEME_OPTIONS.map(([value, label]) => <button key={value} type="button" aria-pressed={theme === value} className={theme === value ? 'theme-choice theme-choice--active' : 'theme-choice'} onClick={() => setTheme(value)}>{label}</button>)}
        </div>
      </article>
      <article>
        <h2>Veritabanı</h2>
        <p>Kayıtlar Supabase üzerinde tutulur. Uygulama açıldığında canlı veriyi okur.</p>
        <span className="settings-value"><span className={`status-dot status-dot--${connection}`} />{SETTINGS_CONNECTION_TEXT[connection]}</span>
      </article>
      <article>
        <h2>Uygulama</h2>
        <p>StokAdres masaüstü sürümü.</p>
        <span className="settings-value">Sürüm {__APP_VERSION__}</span>
      </article>
    </section>
  </main>
}
function Intro({ title, description }: { title: string; description: string }) { return <header className="page-header"><div><h1>{title}</h1><p className="page-header__description">{description}</p></div></header> }
// Adim numarasi CSS'teki :nth-child sayacindan geliyordu; araya kosullu bir
// ipucu paragrafi girdiginde "Format" ucuncu cocuk oluyor ve numarasiz
// kaliyordu (ekranda 01 -> (yok) -> 03 goruluyordu). Numara artik veriden.
function Choice({ step, title, value, onChange, options }: { step: string; title: string; value: string; onChange: (value: string) => void; options: string[][] }) { return <section className="choice-group" data-step={step}><h2>{title}</h2><div>{options.map(([id,label]) => <button key={id} className={value === id ? 'choice choice--active' : 'choice'} onClick={() => onChange(id)}><span>{label}</span><i/></button>)}</div></section> }
