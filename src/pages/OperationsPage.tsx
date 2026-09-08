import { useEffect, useMemo, useState } from 'react'
import { addressRecordService } from '../data/localData'
import { exportAddressRecordsCsv } from '../services/csvExport'
import { listProducts } from '../services/productService'
import type { AddressRecord } from '../types/addressRecord'
import type { Product } from '../types/product'
import { useTheme } from '../components/ThemeProvider'
import { ChevronRight, Download, FileSpreadsheet, Search } from 'lucide-react'
import './OperationsPage.css'

type OperationsPageProps = { page: 'find' | 'import' | 'export' | 'settings' }

const importOptions = [
  ['Stok İsimlerini Güncelle', 'Mevcut stok kartlarındaki adları dosyadan kontrol edin ve güncelleyin.', 'Stok Kodu · Stok İsmi'],
  ['Barkod Ata', 'Stok kodlarıyla eşleşen barkodları toplu olarak ilişkilendirin.', 'Stok Kodu · Barkod'],
  ['Adres & Koli Aktar', 'Adres ve koli kayıtlarını analiz, önizleme ve uygulama adımlarıyla içe alın.', 'Stok Kodu · Adres · Koli Adedi'],
  ['CABA ile Adres Bul', 'CABA çıktısındaki stokları adres kayıtlarıyla hızlıca eşleştirin.', 'Stok Kodu · CABA Miktarı'],
] as const

export function OperationsPage({ page }: OperationsPageProps) {
  if (page === 'find') return <AddressFinder />
  if (page === 'import') return <ImportHub />
  if (page === 'export') return <ExportHub />
  return <Settings />
}

function AddressFinder() {
  const [products, setProducts] = useState<Product[]>([])
  const [records, setRecords] = useState<AddressRecord[]>([])
  const [query, setQuery] = useState('')
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const load = async () => { setState('loading'); try { const [p, r] = await Promise.all([listProducts(), addressRecordService.list()]); setProducts(p); setRecords(r); setState('ready') } catch { setState('error') } }
  useEffect(() => { void load() }, [])
  const results = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR')
    if (!q) return []
    return products.filter((product) => [product.stockCode, product.stockName, ...product.barcodes].some((value) => value.toLocaleLowerCase('tr-TR').includes(q)))
  }, [products, query])
  return <main className="operations-page">
    <PageIntro eyebrow="OPERASYON" title="Adres Bul" description="Stok kodu, stok adı veya barkoda göre ürünün tüm konumlarını görüntüleyin." />
    <section className="finder-hero"><label className="finder-input"><Search size={20} aria-hidden="true"/><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Stok kodu veya barkod…" /></label><button className="button button--secondary" type="button" title="CABA dosyanızı İçe Aktar ekranından analiz edin"><FileSpreadsheet size={15}/> CABA Excel yükle</button></section>
    {state === 'loading' && <State text="Adres kayıtları yükleniyor..." />}
    {state === 'error' && <State text="Veriler yüklenemedi." retry={load} />}
    {state === 'ready' && query.trim() && (results.length ? <section className="finder-results">{results.map((product) => { const productRecords = records.filter((record) => record.productId === product.id && record.isActive); const total = productRecords.reduce((sum, record) => sum + record.cartonCount, 0); return <article className="finder-result" key={product.id}><div className="finder-result__header"><div><span className="eyebrow-label">{product.stockCode}</span><h2>{product.stockName}</h2><div className="chip-row">{product.barcodes.map((barcode) => <span className="data-chip" key={barcode}>{barcode}</span>)}</div></div><strong>{total}<small> toplam koli</small></strong></div><div className="finder-addresses">{productRecords.length ? productRecords.map((record) => <div key={record.id}><strong>{record.address}</strong><span>{record.cartonCount} koli</span></div>) : <p>Adres bulunamadı</p>}</div></article> })}</section> : <State text="Adres bulunamadı" />)}
    {state === 'ready' && !query.trim() && <State text="Aramaya başlayarak stokların adreslerini görüntüleyin." />}
  </main>
}

function ImportHub() { return <main className="operations-page"><PageIntro eyebrow="VERİ" title="İçe Aktar" description="Excel veya CSV verilerini StokAdres'e aktarın." /><div className="import-steps"><span>Analyze</span><i /><span>Preview</span><i /><span>Apply</span></div><section className="operation-card-grid">{importOptions.map(([title, description, columns]) => <article className="operation-card" key={title}><h2>{title}</h2><p>{description}<small>Desteklenen kolonlar: {columns}</small></p><button className="text-action" type="button">Devam et <ChevronRight size={15}/></button></article>)}</section></main> }

function ExportHub() {
  const [dataset, setDataset] = useState('all')
  const [format, setFormat] = useState('csv')
  const [message, setMessage] = useState('')
  const runExport = async () => { if (format !== 'csv') { setMessage('Bu format için dışa aktarma akışı yakında kullanılabilir olacak.'); return } try { const [products, records] = await Promise.all([listProducts(), addressRecordService.list()]); const done = await exportAddressRecordsCsv(records, products, `stokadres-${dataset}.csv`); setMessage(done ? 'Dosya kaydedildi.' : 'Kaydetme işlemi iptal edildi.') } catch { setMessage('Dışa aktarma sırasında bir sorun oluştu.') } }
  return <main className="operations-page"><PageIntro eyebrow="VERİ YÖNETİMİ" title="Dışa Aktar" description="Önce aktarılacak veri setini, ardından dosya biçimini seçin." /><section className="export-flow"><ChoiceGroup title="Veri seti" value={dataset} onChange={setDataset} options={[['codes','Stok kodları'],['codes-names','Stok kodu + isim'],['barcodes','Stok kodu + barkodlar'],['products','Tüm ürünler'],['addresses','Tüm adresler'],['all','Stok + adres + koli'],['full','Tüm veriler'],['custom','Özel seçim']]} /><ChoiceGroup title="Dosya biçimi" value={format} onChange={setFormat} options={[['xlsx','Excel'],['csv','CSV'],['pdf','PDF'],['docx','Word']]} /><div className="export-action"><p>{message || 'Seçiminiz hazır. Dosyayı oluşturmak için dışa aktarın.'}</p><button className="button button--primary" type="button" onClick={() => void runExport()}>Dışa Aktar</button></div></section></main>
}

function Settings() { const { theme, toggleTheme } = useTheme(); return <main className="operations-page"><PageIntro eyebrow="SİSTEM" title="Ayarlar" description="Uygulama ve veri bağlantısı hakkında temel bilgiler." /><section className="settings-cards"><article><span className="eyebrow-label">Uygulama</span><h2>StokAdres</h2><p>Profesyonel stok ve depo adres yönetimi.</p><small>Sürüm 1.0.0</small></article><article><span className="eyebrow-label">Görünüm</span><h2>{theme === 'light' ? 'Açık tema' : 'Koyu tema'}</h2><p>Çalışma ortamınıza uygun görünümü seçin.</p><button className="button button--secondary" type="button" onClick={toggleTheme}>{theme === 'light' ? 'Koyu temaya geç' : 'Açık temaya geç'}</button></article><article><span className="eyebrow-label">Veri bağlantısı</span><h2><span className="status-dot" /> Supabase</h2><p>Uygulama verileri güvenli bağlantı üzerinden yönetilir.</p><small>Bağlantı durumu uygulama açılışında doğrulanır.</small></article></section></main> }
function PageIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <header className="page-header"><div><p className="intro__eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-header__description">{description}</p></div></header> }
function State({ text, retry }: { text: string; retry?: () => void }) { return <div className="operation-state"><p>{text}</p>{retry && <button type="button" className="button button--secondary" onClick={() => void retry()}>Tekrar Dene</button>}</div> }
function ChoiceGroup({ title, value, onChange, options }: { title: string; value: string; onChange: (value: string) => void; options: string[][] }) { return <section className="choice-group"><h2>{title}</h2><div>{options.map(([id, label]) => <button key={id} className={value === id ? 'choice choice--active' : 'choice'} type="button" onClick={() => onChange(id)}><span>{label}</span><i /></button>)}</div></section> }
