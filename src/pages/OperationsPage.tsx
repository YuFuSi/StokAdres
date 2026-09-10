import { useEffect, useRef, useState } from 'react'
import { Download, FileSpreadsheet, Search, Upload } from 'lucide-react'
import { addressRecordService } from '../data/localData'
import { exportAddressRecordsCsv } from '../services/csvExport'
import { addressRows, exportWorkbook, stockAddressRows, stockRows, summaryRows, type ExportDataset } from '../services/xlsxExport'
import { addProductBarcodes, createProduct, listProducts, updateProduct } from '../services/productService'
import { parseOperationImportFile, validateOperationRow, type ImportOperation, type OperationImportRow } from '../services/operationImportService'
import { searchProducts } from '../services/productSearch'
import type { AddressRecord } from '../types/addressRecord'
import type { Product } from '../types/product'
import { useTheme } from '../components/ThemeProvider'
import './OperationsPage.css'

type Props = { page: 'find' | 'import' | 'export' | 'settings' }
type Status = 'ready' | 'unchanged' | 'missing' | 'invalid' | 'matched' | 'unmatched'
type Row = OperationImportRow & { status: Status; detail: string; product?: Product; addressRecord?: AddressRecord }
const choices: Array<{ id: ImportOperation; title: string; description: string; columns: string }> = [
  { id: 'stocks', title: 'Stok Aktar', description: 'Yeni stok kartlarını Supabase ürün kayıtlarına ekleyin.', columns: 'Stok Kodu · Stok Adı · Barkod' },
  { id: 'names', title: 'Stok İsimlerini Güncelle', description: 'Mevcut stok kartlarındaki isimleri güncelleyin.', columns: 'Stok Kodu · Stok Adı' },
  { id: 'barcodes', title: 'Barkod Ata', description: 'Mevcut ürünlere benzersiz barkodlar atayın.', columns: 'Stok Kodu · Barkod' },
  { id: 'addresses', title: 'Adres & Koli Aktar', description: 'Fiziksel adres ve koli kayıtlarını güncelleyin.', columns: 'Stok Kodu · Adres · Koli Adedi' },
]

export function OperationsPage({ page }: Props) { if (page === 'import') return <ImportHub/>; if (page === 'export') return <ExportHub/>; if (page === 'find') return <Finder/>; return <Settings/> }

function ImportHub() {
  const [operation, setOperation] = useState<ImportOperation | null>(null), [rows, setRows] = useState<Row[]>([]), [fileName, setFileName] = useState(''), [message, setMessage] = useState(''), [saving, setSaving] = useState(false); const fileRef = useRef<HTMLInputElement>(null)
  const loadFile = async (file?: File) => { if (!file || !operation) return; setFileName(file.name); setMessage(''); try { const [products, records, parsed] = await Promise.all([listProducts(), addressRecordService.list(), parseOperationImportFile(file)]); setRows(preview(operation, parsed, products, records)) } catch (error) { console.error(error); setRows([]); setMessage(error instanceof Error ? error.message : 'Dosya okunamadı. Lütfen desteklenen bir CSV veya Excel dosyası seçin.') } }
  const applicable = rows.filter(row => row.status === 'ready')
  const apply = async () => { if (!operation) return; setSaving(true); try { let done = 0; for (const row of applicable) { if (operation === 'stocks') await createProduct({ stockCode: row.stockCode, stockName: row.stockName, barcodes: row.barcode ? [row.barcode.trim()] : [] }); else { if (!row.product) continue; if (operation === 'names') await updateProduct(row.product.id, { stockName: row.stockName }); if (operation === 'barcodes') await addProductBarcodes(row.product.id, [row.barcode.trim()]); if (operation === 'addresses') { if (row.addressRecord) await addressRecordService.update(row.addressRecord.id, { cartonCount: row.cartonCount! }); else await addressRecordService.create({ productId: row.product.id, stockCode: row.product.stockCode, stockName: row.product.stockName, address: row.address, cartonCount: row.cartonCount! }) } }; done++ }; setRows(current => current.map(row => row.status === 'ready' ? { ...row, status: 'unchanged', detail: 'Uygulandı' } : row)); setMessage(`${done} kayıt Supabase'e kaydedildi.`) } catch (error) { console.error(error); setMessage('Veriler kaydedilemedi. Lütfen bağlantınızı kontrol edip tekrar deneyin.') } finally { setSaving(false) } }
  if (!operation) return <main className="operations-page"><Intro eyebrow="VERİ" title="İçe Aktar" description="Dosyayı analiz edin, eşleşmeleri önizleyin ve onayınızdan sonra uygulayın."/><div className="import-steps"><span>Dosya</span><i/><span>Önizleme</span><i/><span>Uygula</span></div><section className="operation-card-grid">{choices.map(choice => <article className="operation-card" key={choice.id}><h2>{choice.title}</h2><p>{choice.description}<small>Desteklenen kolonlar: {choice.columns}</small></p><button className="text-action" onClick={() => setOperation(choice.id)}>Devam et →</button></article>)}</section></main>
  const title = choices.find(choice => choice.id === operation)!.title
  return <main className="operations-page"><Intro eyebrow="İÇE AKTAR / ÖNİZLEME" title={title} description="Dosya seçimi veri yazmaz; önce satırları kontrol edin."/><input ref={fileRef} className="visually-hidden" type="file" accept=".csv,.xlsx,.xls" onChange={event => void loadFile(event.target.files?.[0])}/><section className="import-workspace"><div className="import-file-row"><span><FileSpreadsheet size={18}/>{fileName || 'CSV, XLSX veya XLS dosyası seçin'}</span><button className="button button--secondary" onClick={() => fileRef.current?.click()}><Upload size={14}/> Dosya Seç</button><button className="text-action" onClick={() => { setOperation(null); setRows([]) }}>Geri dön</button></div>{message && <p className="import-message">{message}</p>}{rows.length > 0 && <><Summary rows={rows}/><div className="import-preview-table"><table><thead><tr><th>Satır</th><th>Stok kodu</th><th>Stok adı</th>{(operation === 'barcodes' || operation === 'stocks') && <th>Barkod</th>}{operation === 'addresses' && <><th>Adres</th><th>Koli</th></>}{operation === 'caba' && <><th>Bulunan adres</th><th>CABA miktarı</th></>}<th>Durum</th></tr></thead><tbody>{rows.map(row => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td><code>{row.stockCode || '—'}</code></td><td>{row.stockName || row.product?.stockName || '—'}</td>{(operation === 'barcodes' || operation === 'stocks') && <td><code>{row.barcode || '—'}</code></td>}{operation === 'addresses' && <><td><code>{row.address || '—'}</code></td><td>{row.cartonCount ?? '—'}</td></>}{operation === 'caba' && <><td>{row.detail}</td><td>{row.cabaQuantity || '—'}</td></>}<td><Badge status={row.status} detail={operation === 'caba' ? '' : row.detail}/></td></tr>)}</tbody></table></div><div className="import-confirm"><span>{operation === 'caba' ? 'CABA eşleşmesi yalnızca sonuç gösterir; depo verisini değiştirmez.' : `${applicable.length} kayıt değiştirilecek.`}</span><div><button className="button button--secondary" onClick={() => { setRows([]); setFileName('') }}>İptal</button>{operation !== 'caba' && <button className="button button--primary" disabled={!applicable.length || saving} onClick={() => void apply()}>{saving ? 'Kaydediliyor…' : "Import'u Başlat"}</button>}</div></div></>}</section></main>
}

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
function preview(operation: ImportOperation, source: OperationImportRow[], products: Product[], records: AddressRecord[]): Row[] { const productMap = new Map(products.map(product => [product.stockCode.trim().toLocaleLowerCase('tr-TR'), product])); const fileCodes = new Set<string>(); const fileBarcodes = new Set<string>(); return source.map(row => { const errors = validateOperationRow(operation, row); const code = row.stockCode.trim().toLocaleLowerCase('tr-TR'); const barcode = row.barcode.trim(); if (operation === 'stocks' && code && fileCodes.has(code)) errors.push('Dosyada tekrarlanan stok kodu.'); fileCodes.add(code); if (operation === 'stocks' && barcode && fileBarcodes.has(barcode)) errors.push('Dosyada tekrarlanan barkod.'); if (barcode) fileBarcodes.add(barcode); if (errors.length) return { ...row, status: 'invalid', detail: errors.join(' ') }; const product = productMap.get(code); if (operation === 'stocks') return product ? { ...row, product, status: 'unchanged', detail: 'Mevcut stok' } : { ...row, status: 'ready', detail: 'Yeni stok' }; if (!product) return { ...row, status: operation === 'caba' ? 'unmatched' : 'missing', detail: 'Stok bulunamadı' }; if (operation === 'caba') { const addresses = records.filter(record => record.productId === product.id && record.isActive); return { ...row, product, status: addresses.length ? 'matched' : 'unmatched', detail: addresses.length ? addresses.map(record => `${record.address} · ${record.cartonCount} koli`).join(', ') : 'Adres bulunamadı' } }; if (operation === 'names' && product.stockName === row.stockName) return { ...row, product, status: 'unchanged', detail: 'Stok adı aynı' }; if (operation === 'barcodes' && product.barcodes.includes(barcode)) return { ...row, product, status: 'unchanged', detail: 'Barkod zaten kayıtlı' }; const addressRecord = operation === 'addresses' ? records.find(record => record.productId === product.id && record.isActive && record.address.trim().toLocaleLowerCase('tr-TR') === row.address.trim().toLocaleLowerCase('tr-TR')) : undefined; if (addressRecord?.cartonCount === row.cartonCount) return { ...row, product, addressRecord, status: 'unchanged', detail: 'Kayıt aynı' }; return { ...row, product, addressRecord, status: 'ready', detail: addressRecord ? 'Güncellenecek' : operation === 'addresses' ? 'Yeni adres' : 'Güncellenecek' } }) }
function toCsv(rows: Record<string, string | number>[]) { if (!rows.length) return ''; const headers = Object.keys(rows[0]); const field = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`; return [headers, ...rows.map(row => headers.map(header => field(row[header] ?? '')).join(','))].map(row => Array.isArray(row) ? row.join(',') : row).join('\r\n') }
function Summary({ rows }: { rows: Row[] }) { const count = (status: Status) => rows.filter(row => row.status === status).length; return <div className="import-summary"><span>Toplam <strong>{rows.length}</strong></span><span>Hazır <strong>{count('ready')}</strong></span><span>Aynı <strong>{count('unchanged')}</strong></span><span>Eşleşmeyen <strong>{count('missing') + count('unmatched')}</strong></span><span>Hatalı <strong>{count('invalid')}</strong></span></div> }
function Badge({ status, detail }: { status: Status; detail: string }) { const labels: Record<Status,string> = { ready:'Hazır', unchanged:'Aynı', missing:'Stok bulunamadı', invalid:'Hatalı', matched:'Eşleşti', unmatched:'Eşleşmedi' }; return <span className={`import-status import-status--${status}`}>{detail || labels[status]}</span> }
function Intro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <header className="page-header"><div><p className="intro__eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-header__description">{description}</p></div></header> }
function Choice({ title, value, onChange, options }: { title: string; value: string; onChange: (value: string) => void; options: string[][] }) { return <section className="choice-group"><h2>{title}</h2><div>{options.map(([id,label]) => <button key={id} className={value === id ? 'choice choice--active' : 'choice'} onClick={() => onChange(id)}><span>{label}</span><i/></button>)}</div></section> }
