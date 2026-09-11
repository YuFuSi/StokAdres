import { useEffect, useRef, useState } from 'react'
import { ClipboardPaste, FileSpreadsheet, MapPin, PackageSearch, Printer, Search, Upload, X } from 'lucide-react'
import { lookupCabaAddresses, type CabaMiss } from '../services/cabaLookup'
import { OperationImportFileError, parseOperationImportFile, parseOperationImportText, type OperationImportRow } from '../services/operationImportService'
import { queryProducts, type ProductListItem } from '../services/productService'
import { findAddressesForProducts, findAddressesInRange, listAisles, type AisleOption } from '../services/outputService'
import { exportWorkbook, type ExportRow, type ExportSheet } from '../services/xlsxExport'
import { resolveAddressRange } from '../lib/addressRange'
import { buildPickList, buildProductList, countAisles, type OutputItem, type OutputLayout } from '../lib/pickList'
import { formatNumber } from '../lib/format'
import './CabaLookupPage.css'

// Çıktı Al — adres listesini üç kaynaktan hazırlar, yazdırır ve Excel'e alır.
//
//   CABA fişi      günlük iş: fiş yapıştır → adresler
//   Adres aralığı  "G01-01'den G'nin sonuna kadar"
//   Ürün seç       CABA olmadan, aranıp seçilen ürünler
//
// Harun abinin isteği (2026-09-11). Ekran salt okuma; depo verisini değiştirmez.
// Dahili sayfa kimliği geçmiş uyumu için hâlâ 'caba'.

type SourceTab = 'caba' | 'range' | 'products'

type OutputResult = {
  source: SourceTab
  sourceLabel: string
  items: OutputItem[]
  misses: CabaMiss[]
  notes: string[]
}

const TABS: Array<{ id: SourceTab; label: string; icon: typeof MapPin }> = [
  { id: 'caba', label: 'CABA fişi', icon: ClipboardPaste },
  { id: 'range', label: 'Adres aralığı', icon: MapPin },
  { id: 'products', label: 'Ürün seç', icon: PackageSearch },
]

export function CabaLookupPage() {
  const [tab, setTab] = useState<SourceTab>('caba')
  const [result, setResult] = useState<OutputResult | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  // Girişler sonuç ekranından dönünce korunur: aralığı biraz değiştirip yeniden
  // listelemek ya da seçili ürünlere bir tane daha eklemek için.
  const [pastedText, setPastedText] = useState('')
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [selected, setSelected] = useState<ProductListItem[]>([])

  const run = async (work: () => Promise<OutputResult | null>) => {
    setIsWorking(true)
    setError('')
    setProgress('')
    try {
      const next = await work()
      if (next) setResult(next)
    } catch (reason: unknown) {
      console.error(reason)
      setError(reason instanceof OperationImportFileError || reason instanceof Error ? reason.message : 'Liste hazırlanırken bir sorun oluştu.')
    } finally {
      setIsWorking(false)
      setProgress('')
    }
  }

  const runCaba = (parse: () => OperationImportRow[] | Promise<OperationImportRow[]>, label: string) => run(async () => {
    const rows = await parse()
    if (rows.length === 0) {
      setError('Veride hiç satır bulunamadı. Başlık satırının ve altında en az bir satırın olduğundan emin olun.')
      return null
    }
    const lookup = await lookupCabaAddresses(rows)
    const notes: string[] = []
    if (lookup.skippedRows > 0) notes.push(`${lookup.skippedRows} satırda stok kodu boştu, atlandı.`)
    if (lookup.duplicateRows > 0) notes.push(`${lookup.duplicateRows} satır tekrar eden stok koduydu, bir kez listelendi.`)
    return { source: 'caba', sourceLabel: `CABA fişi · ${label}`, items: lookup.matches, misses: lookup.misses, notes }
  })

  const runRange = () => {
    if (isWorking) return
    const resolved = resolveAddressRange(rangeFrom, rangeTo)
    if ('error' in resolved) { setError(resolved.error); return }
    void run(async () => {
      const items = await findAddressesInRange(resolved.range, (loaded) => setProgress(`${formatNumber(loaded)} konum alındı…`))
      return { source: 'range', sourceLabel: `Adres aralığı · ${resolved.range.label}`, items, misses: [], notes: [] }
    })
  }

  const runProducts = () => {
    if (selected.length === 0 || isWorking) return
    void run(async () => {
      const { items, misses } = await findAddressesForProducts(selected)
      return { source: 'products', sourceLabel: `Seçilen ürünler · ${formatNumber(selected.length)} stok`, items, misses, notes: [] }
    })
  }

  if (result) return <AddressOutput result={result} onReset={() => setResult(null)} />

  return (
    <main className="operations-page caba-page">
      <header className="page-header">
        <div>
          <h1>Çıktı Al</h1>
          <p className="page-header__description">Adresleri CABA fişinden, bir adres aralığından ya da seçtiğiniz ürünlerden listeleyin; yazdırın veya Excel'e alın.</p>
        </div>
      </header>

      <div className="output-tabs" role="tablist" aria-label="Liste kaynağı">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id}
            className={tab === id ? 'output-tab output-tab--active' : 'output-tab'}
            onClick={() => { setTab(id); setError('') }}>
            <Icon size={15} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      <section className="caba-input">
        {tab === 'caba' && <CabaSource pastedText={pastedText} setPastedText={setPastedText} isWorking={isWorking} onRun={runCaba} />}
        {tab === 'range' && <RangeSource from={rangeFrom} to={rangeTo} setFrom={setRangeFrom} setTo={setRangeTo} isWorking={isWorking} onRun={runRange} />}
        {tab === 'products' && <ProductSource selected={selected} setSelected={setSelected} isWorking={isWorking} onRun={runProducts} />}

        {progress && <p className="caba-progress" role="status">{progress}</p>}
        {error && <p className="caba-error" role="alert">{error}</p>}
      </section>
    </main>
  )
}

// ---------------------------------------------------------------- kaynaklar

function CabaSource({ pastedText, setPastedText, isWorking, onRun }: {
  pastedText: string
  setPastedText: (value: string) => void
  isWorking: boolean
  onRun: (parse: () => OperationImportRow[] | Promise<OperationImportRow[]>, label: string) => Promise<void>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const lookupPasted = () => {
    if (!pastedText.trim() || isWorking) return
    void onRun(() => parseOperationImportText(pastedText), 'yapıştırılan liste')
  }

  return <>
    <label className="caba-paste">
      <span className="caba-paste__label"><ClipboardPaste size={15} /> CABA çıktısını yapıştırın</span>
      <textarea
        value={pastedText}
        onChange={(event) => setPastedText(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); lookupPasted() } }}
        placeholder={'Excel\'den kopyalayıp buraya yapıştırın.\n\nİlk satır başlık olmalı, örneğin:\nStok Kodu\tCABA Miktarı'}
        rows={9}
        autoFocus
      />
    </label>

    <div className="caba-actions">
      <button className="button button--primary" type="button" disabled={!pastedText.trim() || isWorking} onClick={lookupPasted}>
        {isWorking ? 'Adresler bulunuyor…' : 'Adresleri Bul'}
      </button>
      <kbd className="caba-kbd">Ctrl Enter</kbd>
      <span className="caba-actions__divider">veya</span>
      <input
        ref={fileRef}
        className="visually-hidden"
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void onRun(() => parseOperationImportFile(file), file.name)
          event.target.value = ''
        }}
      />
      <button className="button button--secondary" type="button" disabled={isWorking} onClick={() => fileRef.current?.click()}>
        <Upload size={14} /> Dosya Seç
      </button>
    </div>

    <p className="caba-hint">
      <FileSpreadsheet size={14} /> Yalnızca <strong>Stok Kodu</strong> kolonu gerekli. Fazladan kolonlar yok sayılır, bu yüzden
      CABA çıktısını olduğu gibi yapıştırabilirsiniz. Bu ekran depo verisini değiştirmez.
    </p>
  </>
}

function RangeSource({ from, to, setFrom, setTo, isWorking, onRun }: {
  from: string
  to: string
  setFrom: (value: string) => void
  setTo: (value: string) => void
  isWorking: boolean
  onRun: () => void
}) {
  const [aisles, setAisles] = useState<AisleOption[]>([])

  useEffect(() => {
    let cancelled = false
    listAisles()
      .then((next) => { if (!cancelled) setAisles(next) })
      .catch((reason: unknown) => console.error(reason))
    return () => { cancelled = true }
  }, [])

  const onEnter = (event: React.KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter') { event.preventDefault(); onRun() } }

  return <>
    <div className="output-range__fields">
      <label className="output-field">Başlangıç
        <input value={from} onChange={(event) => setFrom(event.target.value)} onKeyDown={onEnter} placeholder="G01-01" autoFocus autoComplete="off" />
      </label>
      <span className="output-range__arrow" aria-hidden="true">→</span>
      <label className="output-field">Bitiş
        <input value={to} onChange={(event) => setTo(event.target.value)} onKeyDown={onEnter} placeholder="Boşsa koridor sonu" autoComplete="off" />
      </label>
      <button className="button button--primary output-range__run" type="button" disabled={!from.trim() || isWorking} onClick={onRun}>
        {isWorking ? 'Listeleniyor…' : 'Listele'}
      </button>
    </div>

    {aisles.length > 0 && (
      <div className="output-aisles" aria-label="Koridor seç">
        <span>Bütün koridor</span>
        {aisles.map((aisle) => (
          <button key={aisle.aisle} type="button" className="output-aisle" onClick={() => { setFrom(aisle.aisle); setTo(aisle.aisle) }}>
            {aisle.aisle}<small>{formatNumber(aisle.addressCount)}</small>
          </button>
        ))}
      </div>
    )}

    <p className="caba-hint">
      <MapPin size={14} /> <span>
        <code>G</code> bütün G koridoru · <code>G05</code> tek raf · <code>G01-01</code> → <code>G</code> G01-01'den G'nin sonuna.
        Bitişi boş bırakırsanız başlangıcın koridorunun sonuna kadar listelenir. Biçim dışı adresler (ör. H21-1) aralığa girmez.
      </span>
    </p>
  </>
}

function ProductSource({ selected, setSelected, isWorking, onRun }: {
  selected: ProductListItem[]
  setSelected: (products: ProductListItem[]) => void
  isWorking: boolean
  onRun: () => void
}) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<ProductListItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const query = term.trim()

  // Adres Bul ve Ctrl+K ile aynı desen: sunucu araması, 250 ms bekleme, eski
  // yanıtları at.
  useEffect(() => {
    if (!query) { setResults([]); setIsSearching(false); return }
    let cancelled = false
    setIsSearching(true)
    const timer = window.setTimeout(() => {
      queryProducts({ query, pageSize: 8 })
        .then(({ items }) => { if (!cancelled) setResults(items) })
        .catch((reason: unknown) => { console.error(reason); if (!cancelled) setResults([]) })
        .finally(() => { if (!cancelled) setIsSearching(false) })
    }, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [query])

  const selectedIds = new Set(selected.map((product) => product.id))
  const add = (product: ProductListItem) => {
    if (!selectedIds.has(product.id)) setSelected([...selected, product])
    setTerm('')
  }

  return (
    <div className="output-picker">
      <div>
        <label className="output-search">
          <Search size={17} aria-hidden="true" />
          <span className="visually-hidden">Stok kodu, stok adı veya barkod ara</span>
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              const first = results.find((product) => !selectedIds.has(product.id))
              if (first && !isSearching) add(first)
            }}
            placeholder="Stok kodu, ad veya barkod — Enter ilk sonucu ekler"
            autoFocus
            autoComplete="off"
          />
        </label>
        {query && (
          <div className="output-results">
            {isSearching && results.length === 0 && <p className="output-state" role="status">Aranıyor…</p>}
            {!isSearching && results.length === 0 && <p className="output-state">Eşleşen stok yok.</p>}
            {results.map((product) => {
              const isAdded = selectedIds.has(product.id)
              return (
                <button key={product.id} type="button" className="output-result" disabled={isAdded} onClick={() => add(product)}>
                  <span><strong>{product.stockCode}</strong><small>{product.stockName}</small></span>
                  <span className="output-result__meta">{isAdded ? 'Eklendi' : product.addressCount ? `${formatNumber(product.addressCount)} adres · Ekle` : 'Adres yok · Ekle'}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="output-selected">
        <div className="output-selected__header">
          <h2>Seçilen ürünler <span>{formatNumber(selected.length)}</span></h2>
          {selected.length > 0 && <button className="text-action" type="button" onClick={() => setSelected([])}>Temizle</button>}
        </div>
        {selected.length === 0
          ? <p className="output-selected__empty">Soldan arayıp ürün ekleyin. Liste sonuç ekranından dönünce korunur.</p>
          : (
            <ul>
              {selected.map((product) => (
                <li key={product.id}>
                  <span><strong>{product.stockCode}</strong><small>{product.stockName}</small></span>
                  <span className="output-selected__meta">{product.addressCount ? `${formatNumber(product.addressCount)} adres` : 'Adres yok'}</span>
                  <button className="output-remove" type="button" aria-label={`${product.stockCode} listeden çıkar`} onClick={() => setSelected(selected.filter((item) => item.id !== product.id))}><X size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        <div className="output-selected__actions">
          <button className="button button--primary" type="button" disabled={selected.length === 0 || isWorking} onClick={onRun}>
            {isWorking ? 'Adresler getiriliyor…' : 'Adresleri Getir'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- sonuç

function AddressOutput({ result, onReset }: { result: OutputResult; onReset: () => void }) {
  // Aralık zaten raf sırasında bir yürüyüş; fiş ve seçili ürünlerde ise
  // Harun abi her ürünün tüm adreslerini bir arada görmek istiyor.
  const [layout, setLayout] = useState<OutputLayout>(result.source === 'range' ? 'rack' : 'product')
  const [excelMessage, setExcelMessage] = useState('')
  const [isExporting, setIsExporting] = useState(false)

  const { items, misses, notes } = result
  const showCaba = result.source === 'caba'
  const products = buildProductList(items)
  const { rows, groups } = buildPickList(items)
  const totalCartons = rows.reduce((sum, row) => sum + row.cartonCount, 0)
  const aisleCount = countAisles(items)
  const printedAt = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())

  // Üretimde uygulama menüsü kaldırıldığı için Electron Ctrl+P'yi kendiliğinden
  // yakalamıyor; sonuç ekranında kısayolu biz bağlıyoruz.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        window.print()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const exportExcel = async () => {
    setIsExporting(true)
    setExcelMessage('')
    try {
      const withCaba = (row: ExportRow, quantity: string): ExportRow => showCaba ? { ...row, CABA: quantity } : row
      const listSheet: ExportSheet = layout === 'product'
        ? { name: 'Ürüne göre', rows: products.flatMap((group) => group.addresses.map((address) => withCaba({ 'Stok Kodu': group.stockCode, 'Stok Adı': group.stockName, Adres: address.address, Koli: address.cartonCount }, group.cabaQuantity))) }
        : { name: 'Rafa göre', rows: rows.map((row) => withCaba({ Adres: row.address, 'Stok Kodu': row.stockCode, 'Stok Adı': row.stockName, Koli: row.cartonCount }, row.cabaQuantity)) }
      const sheets: ExportSheet[] = [listSheet]
      if (misses.length > 0) {
        sheets.push({ name: 'Bulunamayanlar', rows: misses.map((miss) => withCaba({ 'Stok Kodu': miss.stockCode, Durum: missText(miss) }, miss.cabaQuantity)) })
      }
      const saved = await exportWorkbook(sheets, `StokAdres_adres_listesi_${fileStamp(new Date())}.xlsx`)
      setExcelMessage(saved ? 'Excel dosyası kaydedildi.' : 'Kaydetme iptal edildi.')
    } catch (reason: unknown) {
      console.error(reason)
      setExcelMessage('Excel dosyası oluşturulamadı.')
    } finally {
      setIsExporting(false)
    }
  }

  const columnCount = showCaba ? 6 : 5

  return (
    <main className="operations-page caba-page caba-page--results">
      <header className="page-header caba-results__header">
        <div>
          <h1>Adres Listesi</h1>
          <p className="page-header__description caba-print-meta">{result.sourceLabel} · {printedAt}</p>
        </div>
        <div className="caba-results__actions">
          <button className="button button--secondary" type="button" onClick={onReset}><X size={14} /> Yeni Liste</button>
          <div className="output-layout-toggle" role="group" aria-label="Liste düzeni">
            <button type="button" aria-pressed={layout === 'product'} onClick={() => setLayout('product')}>Ürüne göre</button>
            <button type="button" aria-pressed={layout === 'rack'} onClick={() => setLayout('rack')}>Rafa göre</button>
          </div>
          <button className="button button--secondary" type="button" disabled={rows.length === 0 || isExporting} onClick={() => void exportExcel()}><FileSpreadsheet size={14} /> {isExporting ? 'Hazırlanıyor…' : 'Excel'}</button>
          <button className="button button--primary" type="button" disabled={rows.length === 0} onClick={() => window.print()} title="Ctrl+P"><Printer size={15} /> Yazdır</button>
        </div>
      </header>
      {excelMessage && <p className="output-excel-status" role="status">{excelMessage}</p>}

      <section className="caba-summary" aria-label="Özet">
        <div><strong>{formatNumber(products.length)}</strong><span>stok</span></div>
        <div><strong>{formatNumber(rows.length)}</strong><span>{aisleCount > 0 ? `konum · ${aisleCount} koridor` : 'konum'}</span></div>
        {result.source !== 'range' && <div className={misses.length ? 'caba-summary__warn' : undefined}><strong>{formatNumber(misses.length)}</strong><span>adresi bulunamadı</span></div>}
        <div><strong>{formatNumber(totalCartons)}</strong><span>toplam koli</span></div>
      </section>

      {notes.length > 0 && <p className="caba-note">{notes.join(' ')}</p>}

      {rows.length > 0 && layout === 'product' && (
        <section className="caba-results" aria-label="Ürüne göre adresler">
          {/* Her ürün bir kez; adresleri alt alta, her birinin yanında koli.
              Ürünler ilk adreslerine göre rota sırasında. */}
          <table className="caba-table caba-table--products">
            <thead>
              <tr>
                <th>Stok kodu</th>
                <th>Stok adı</th>
                <th className="caba-check" aria-hidden="true" />
                <th className="caba-table__address">Adres</th>
                <th>Koli</th>
                {showCaba && <th>CABA</th>}
              </tr>
            </thead>
            {products.map((group) => {
              const span = group.addresses.length
              return (
                <tbody key={group.key} className="caba-product">
                  {group.addresses.map((address, index) => (
                    <tr key={address.id} className={index === 0 ? 'caba-row caba-row--first' : 'caba-row'}>
                      {index === 0 && <>
                        <td rowSpan={span} className="caba-product__code">
                          <strong>{group.stockCode}</strong>
                          {span > 1 && <small className="caba-split">{span} konum · {formatNumber(group.totalCartons)} koli</small>}
                        </td>
                        <td rowSpan={span} className="caba-product__name">{group.stockName}</td>
                      </>}
                      <td className="caba-check" aria-hidden="true"><span className="caba-checkbox" /></td>
                      <td className="caba-table__address"><span className="caba-address">{address.address}</span></td>
                      <td className="caba-carton">{formatNumber(address.cartonCount)}</td>
                      {showCaba && index === 0 && <td rowSpan={span} className="caba-quantity">{group.cabaQuantity || '—'}</td>}
                    </tr>
                  ))}
                </tbody>
              )
            })}
          </table>
        </section>
      )}

      {rows.length > 0 && layout === 'rack' && (
        <section className="caba-results" aria-label="Rafa göre adresler">
          {/* Satırlar depo rotasında: toplayıcı listeyi baştan sona yürür. */}
          <table className="caba-table caba-table--pick">
            <thead>
              <tr>
                <th className="caba-check" aria-hidden="true" />
                <th className="caba-table__address">Adres</th>
                <th>Stok kodu</th>
                <th>Stok adı</th>
                <th>Koli</th>
                {showCaba && <th>CABA</th>}
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.aisle ?? 'other'}>
                <tr className="caba-aisle">
                  <th colSpan={columnCount} scope="rowgroup">
                    {group.aisle ? `Koridor ${group.aisle}` : 'Diğer adresler'}
                    <span>{group.rows.length} konum</span>
                  </th>
                </tr>
                {group.rows.map((row) => (
                  <tr key={row.key} className="caba-row">
                    <td className="caba-check" aria-hidden="true"><span className="caba-checkbox" /></td>
                    <td className="caba-table__address"><span className="caba-address">{row.address}</span></td>
                    <td>
                      <strong>{row.stockCode}</strong>
                      {row.locationCount > 1 && <small className="caba-split">{row.locationCount} konumda</small>}
                    </td>
                    <td>{row.stockName}</td>
                    <td className="caba-carton">{formatNumber(row.cartonCount)}</td>
                    {showCaba && <td className="caba-quantity">{row.cabaQuantity || '—'}</td>}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </section>
      )}

      {misses.length > 0 && (
        <section className="caba-misses" aria-label="Bulunamayanlar">
          <h2>Adresi bulunamayanlar <span>{misses.length}</span></h2>
          <p className="caba-misses__hint">Bu stoklar listede vardı ama depoda konumu yok. Sayım sırasında adreslenmeleri gerekiyor.</p>
          <table className="caba-table caba-table--misses">
            <thead><tr><th>Stok kodu</th><th>Durum</th>{showCaba && <th>CABA</th>}</tr></thead>
            <tbody>
              {misses.map((miss) => (
                <tr key={`${miss.rowNumber}-${miss.stockCode}`}>
                  <td><strong>{miss.stockCode}</strong></td>
                  <td>{missText(miss)}</td>
                  {showCaba && <td className="caba-quantity">{miss.cabaQuantity || '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {rows.length === 0 && misses.length === 0 && (
        <div className="operation-state"><p>{result.source === 'range' ? 'Bu aralıkta aktif adres yok.' : 'Listede işlenecek stok kodu bulunamadı.'}</p></div>
      )}
    </main>
  )
}

function missText(miss: CabaMiss): string {
  return miss.reason === 'no-product'
    ? 'Bu stok kodu kayıtlı değil'
    : `Kayıtlı ama adresi yok${miss.productName ? ` · ${miss.productName}` : ''}`
}

function fileStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`
}
