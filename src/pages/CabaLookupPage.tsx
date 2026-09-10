import { useRef, useState } from 'react'
import { ClipboardPaste, FileSpreadsheet, Printer, Upload, X } from 'lucide-react'
import { lookupCabaAddresses, type CabaLookupResult } from '../services/cabaLookup'
import { OperationImportFileError, parseOperationImportFile, parseOperationImportText } from '../services/operationImportService'
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
          <p className="intro__eyebrow">OPERASYON</p>
          <h1>CABA ile Adres Bul</h1>
          <p className="page-header__description">CABA'dan aldığınız fişi buraya yapıştırın; stokların depodaki konumları listelensin.</p>
        </div>
      </header>

      <section className="caba-input">
        <label className="caba-paste">
          <span className="caba-paste__label"><ClipboardPaste size={15} /> CABA çıktısını yapıştırın</span>
          <textarea
            value={pastedText}
            onChange={(event) => setPastedText(event.target.value)}
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
            onClick={() => void runLookup(() => parseOperationImportText(pastedText), 'Yapıştırılan liste')}
          >
            {isLooking ? 'Adresler bulunuyor…' : 'Adresleri Bul'}
          </button>

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
          CABA çıktısını olduğu gibi yapıştırabilirsiniz. Bu ekran depo verisini değiştirmez.
        </p>
      </section>
    </main>
  )
}

function CabaResults({ result, sourceLabel, onReset }: { result: CabaLookupResult; sourceLabel: string; onReset: () => void }) {
  const { matches, misses, skippedRows, duplicateRows } = result
  const totalCartons = matches.reduce((sum, match) => sum + match.addresses.reduce((inner, address) => inner + address.cartonCount, 0), 0)
  const printedAt = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())

  return (
    <main className="operations-page caba-page caba-page--results">
      <header className="page-header caba-results__header">
        <div>
          <p className="intro__eyebrow">OPERASYON</p>
          <h1>Adres Listesi</h1>
          <p className="page-header__description caba-print-meta">{sourceLabel} · {printedAt}</p>
        </div>
        <div className="caba-results__actions">
          <button className="button button--secondary" type="button" onClick={onReset}><X size={14} /> Yeni Liste</button>
          <button className="button button--primary" type="button" onClick={() => window.print()}><Printer size={15} /> Yazdır</button>
        </div>
      </header>

      <section className="caba-summary" aria-label="Özet">
        <div><strong>{matches.length}</strong><span>adresi bulundu</span></div>
        <div className={misses.length ? 'caba-summary__warn' : undefined}><strong>{misses.length}</strong><span>bulunamadı</span></div>
        <div><strong>{totalCartons}</strong><span>toplam koli</span></div>
      </section>

      {(skippedRows > 0 || duplicateRows > 0) && (
        <p className="caba-note">
          {skippedRows > 0 && <>{skippedRows} satırda stok kodu boştu, atlandı. </>}
          {duplicateRows > 0 && <>{duplicateRows} satır tekrar eden stok koduydu, bir kez listelendi.</>}
        </p>
      )}

      {matches.length > 0 && (
        <section className="caba-results" aria-label="Bulunan adresler">
          <table className="caba-table">
            <thead>
              <tr><th>Stok kodu</th><th>Stok adı</th><th className="caba-table__address">Adres</th><th>Koli</th><th>CABA</th></tr>
            </thead>
            <tbody>
              {matches.map((match) => (
                match.addresses.map((address, index) => (
                  <tr key={address.id} className={index === 0 ? 'caba-row caba-row--first' : 'caba-row'}>
                    {/* Girilen değil, veritabanındaki kanonik stok kodu gösteriliyor:
                        raf etiketinde ve uygulamanın geri kalanında yazan bu. */}
                    <td>{index === 0 ? <strong>{match.product.stockCode}</strong> : null}</td>
                    <td>{index === 0 ? match.product.stockName : null}</td>
                    <td className="caba-table__address"><span className="caba-address">{address.address}</span></td>
                    <td className="caba-carton">{address.cartonCount}</td>
                    <td className="caba-quantity">{index === 0 ? (match.cabaQuantity || '—') : null}</td>
                  </tr>
                ))
              ))}
            </tbody>
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
