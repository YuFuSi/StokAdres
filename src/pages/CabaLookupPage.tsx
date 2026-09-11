import { useEffect, useRef, useState } from 'react'
import { ClipboardPaste, FileSpreadsheet, Printer, Upload, X } from 'lucide-react'
import { lookupCabaAddresses, type CabaLookupResult } from '../services/cabaLookup'
import { OperationImportFileError, parseOperationImportFile, parseOperationImportText } from '../services/operationImportService'
import { buildPickList } from '../lib/pickList'
import { formatNumber } from '../lib/format'
import './CabaLookupPage.css'

// Uygulamanın asıl günlük ekranı: CABA fişini yapıştır, adresleri al, yazdır.
// Kullanıcının tek sorusu "bu stoklar nerede?" — bu yüzden adres, her satırda
// görsel olarak en baskın bilgi.

type Stage = 'input' | 'results'

export function CabaLookupPage() {
  const [stage, setStage] = useState<Stage>('input')
  const [pastedText, setPastedText] = useState('')
  const [sourceLabel, setSourceLabel] = useState('')
  const [result, setResult] = useState<CabaLookupResult | null>(null)
  const [isLooking, setIsLooking] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const runLookup = async (parse: () => ReturnType<typeof parseOperationImportText> | Promise<ReturnType<typeof parseOperationImportText>>, label: string) => {
    setIsLooking(true)
    setError('')
    try {
      const rows = await parse()
      if (rows.length === 0) {
        setError('Veride hiç satır bulunamadı. Başlık satırının ve altında en az bir satırın olduğundan emin olun.')
        return
      }
      const lookup = await lookupCabaAddresses(rows)
      setResult(lookup)
      setSourceLabel(label)
      setStage('results')
    } catch (reason: unknown) {
      console.error(reason)
      setError(reason instanceof OperationImportFileError
        ? reason.message
        : reason instanceof Error
          ? reason.message
          : 'Adresler bulunurken bir sorun oluştu.')
    } finally {
      setIsLooking(false)
    }
  }

  const lookupPasted = () => {
    if (!pastedText.trim() || isLooking) return
    void runLookup(() => parseOperationImportText(pastedText), 'Yapıştırılan liste')
  }

  const reset = () => {
    setStage('input')
    setResult(null)
    setPastedText('')
    setSourceLabel('')
    setError('')
  }

  if (stage === 'results' && result) {
    return <CabaResults result={result} sourceLabel={sourceLabel} onReset={reset} />
  }

  return (
    <main className="operations-page caba-page">
      <header className="page-header">
        <div>
          <h1>CABA Listesi</h1>
          <p className="page-header__description">CABA'dan aldığınız fişi buraya yapıştırın; stokların depodaki konumları listelensin.</p>
        </div>
      </header>

      <section className="caba-input">
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
          <button
            className="button button--primary"
            type="button"
            disabled={!pastedText.trim() || isLooking}
            onClick={lookupPasted}
          >
            {isLooking ? 'Adresler bulunuyor…' : 'Adresleri Bul'}
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
              if (file) void runLookup(() => parseOperationImportFile(file), file.name)
              event.target.value = ''
            }}
          />
          <button className="button button--secondary" type="button" disabled={isLooking} onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> Dosya Seç
          </button>
        </div>

        {error && <p className="caba-error" role="alert">{error}</p>}

        <p className="caba-hint">
          <FileSpreadsheet size={14} /> Yalnızca <strong>Stok Kodu</strong> kolonu gerekli. Fazladan kolonlar yok sayılır, bu yüzden
          CABA çıktısını olduğu gibi yapıştırabilirsiniz. Liste depo rotasına (koridor → raf → kat) göre sıralanır. Bu ekran depo verisini değiştirmez.
        </p>
      </section>
    </main>
  )
}

function CabaResults({ result, sourceLabel, onReset }: { result: CabaLookupResult; sourceLabel: string; onReset: () => void }) {
  const { matches, misses, skippedRows, duplicateRows } = result
  const { rows, groups } = buildPickList(matches)
  const totalCartons = rows.reduce((sum, row) => sum + row.cartonCount, 0)
  const aisleCount = groups.filter((group) => group.aisle !== null).length
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

  return (
    <main className="operations-page caba-page caba-page--results">
      <header className="page-header caba-results__header">
        <div>
          <h1>Adres Listesi</h1>
          <p className="page-header__description caba-print-meta">{sourceLabel} · {printedAt}</p>
        </div>
        <div className="caba-results__actions">
          <button className="button button--secondary" type="button" onClick={onReset}><X size={14} /> Yeni Liste</button>
          <button className="button button--primary" type="button" onClick={() => window.print()} title="Ctrl+P"><Printer size={15} /> Yazdır</button>
        </div>
      </header>

      <section className="caba-summary" aria-label="Özet">
        <div><strong>{formatNumber(matches.length)}</strong><span>stoğun adresi bulundu</span></div>
        <div><strong>{formatNumber(rows.length)}</strong><span>{aisleCount > 0 ? `konum · ${aisleCount} koridor` : 'konum'}</span></div>
        <div className={misses.length ? 'caba-summary__warn' : undefined}><strong>{formatNumber(misses.length)}</strong><span>bulunamadı</span></div>
        <div><strong>{formatNumber(totalCartons)}</strong><span>toplam koli</span></div>
      </section>

      {(skippedRows > 0 || duplicateRows > 0) && (
        <p className="caba-note">
          {skippedRows > 0 && <>{skippedRows} satırda stok kodu boştu, atlandı. </>}
          {duplicateRows > 0 && <>{duplicateRows} satır tekrar eden stok koduydu, bir kez listelendi.</>}
        </p>
      )}

      {rows.length > 0 && (
        <section className="caba-results" aria-label="Bulunan adresler">
          {/* Satırlar fiş sırasında DEĞİL depo rotasında: toplayıcı listeyi
              baştan sona yürür. Çok konumlu ürün her konumda ayrı satırdır. */}
          <table className="caba-table caba-table--pick">
            <thead>
              <tr>
                <th className="caba-check" aria-hidden="true" />
                <th className="caba-table__address">Adres</th>
                <th>Stok kodu</th>
                <th>Stok adı</th>
                <th>Koli</th>
                <th>CABA</th>
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.aisle ?? 'other'}>
                <tr className="caba-aisle">
                  <th colSpan={6} scope="rowgroup">
                    {group.aisle ? `Koridor ${group.aisle}` : 'Diğer adresler'}
                    <span>{group.rows.length} konum</span>
                  </th>
                </tr>
                {group.rows.map((row) => (
                  <tr key={row.key} className="caba-row">
                    <td className="caba-check" aria-hidden="true"><span className="caba-checkbox" /></td>
                    <td className="caba-table__address"><span className="caba-address">{row.address}</span></td>
                    <td>
                      {/* Girilen değil, veritabanındaki kanonik stok kodu: raf
                          etiketinde ve uygulamanın geri kalanında yazan bu. */}
                      <strong>{row.stockCode}</strong>
                      {row.locationCount > 1 && <small className="caba-split">{row.locationCount} konumda</small>}
                    </td>
                    <td>{row.stockName}</td>
                    <td className="caba-carton">{formatNumber(row.cartonCount)}</td>
                    <td className="caba-quantity">{row.cabaQuantity || '—'}</td>
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
            <thead><tr><th>Stok kodu</th><th>Durum</th><th>CABA</th></tr></thead>
            <tbody>
              {misses.map((miss) => (
                <tr key={`${miss.rowNumber}-${miss.stockCode}`}>
                  <td><strong>{miss.stockCode}</strong></td>
                  <td>{miss.reason === 'no-product'
                    ? 'Bu stok kodu kayıtlı değil'
                    : <>Kayıtlı ama adresi yok{miss.productName ? <> · {miss.productName}</> : null}</>}</td>
                  <td className="caba-quantity">{miss.cabaQuantity || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {matches.length === 0 && misses.length === 0 && (
        <div className="operation-state"><p>Listede işlenecek stok kodu bulunamadı.</p></div>
      )}
    </main>
  )
}
