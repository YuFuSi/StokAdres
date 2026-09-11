import { useEffect, useRef, useState } from 'react'
import { ClipboardPaste, FileSpreadsheet, Upload, X } from 'lucide-react'
import {
  OperationImportFileError,
  parseOperationImportFile,
  parseOperationImportText,
  type ImportOperation,
  type OperationImportRow,
} from '../services/operationImportService'
import { applyRows, buildPreview, type ApplyOutcome, type PreviewRow, type PreviewStatus } from '../services/operationImportApply'
import { normalizeStockCode } from '../services/productLookup'
import { suggestStockCodes, type StockCodeSuggestion } from '../services/stockCodeSuggestions'
import './ImportPage.css'

// Kullanıcının gerçek akışı: depoda kâğıda yaz → Gemini ile Excel'e çevir →
// buraya YAPIŞTIR → hatalı satırları BURADA düzelt → uygula.
//
// Gemini çıktısı hatalı olabildiği ve kullanıcı bunları elle düzelttiği için
// önizleme + satır içi düzenleme bu ekranın çekirdeği.

type Stage = 'choose' | 'input' | 'preview' | 'done'

type OperationChoice = {
  id: ImportOperation
  title: string
  description: string
  columns: string
  /** Önizlemede düzenlenebilir alanlar. */
  editable: Array<'stockCode' | 'stockName' | 'barcode' | 'address' | 'cartonCount'>
}

const CHOICES: OperationChoice[] = [
  { id: 'addresses', title: 'Adres & Koli Aktar', description: 'Sayım sonrası adres ve koli kayıtlarını yükleyin.', columns: 'Stok Kodu · Adres · Koli Adedi', editable: ['stockCode', 'address', 'cartonCount'] },
  { id: 'stocks', title: 'Stok Aktar', description: 'Yeni stok kartlarını ekleyin.', columns: 'Stok Kodu · Stok Adı · Barkod', editable: ['stockCode', 'stockName', 'barcode'] },
  { id: 'names', title: 'Stok İsimlerini Güncelle', description: 'Mevcut stok kartlarındaki isimleri güncelleyin.', columns: 'Stok Kodu · Stok Adı', editable: ['stockCode', 'stockName'] },
  { id: 'barcodes', title: 'Barkod Ata', description: 'Mevcut ürünlere barkod atayın.', columns: 'Stok Kodu · Barkod', editable: ['stockCode', 'barcode'] },
]

const STATUS_LABEL: Record<PreviewStatus, string> = {
  ready: 'Yazılacak',
  update: 'Güncellenecek',
  unchanged: 'Değişmeyecek',
  missing: 'Stok yok',
  invalid: 'Hatalı',
}

const RECHECK_DELAY_MS = 600

export function ImportPage() {
  const [stage, setStage] = useState<Stage>('choose')
  const [operation, setOperation] = useState<OperationChoice | null>(null)
  const [pastedText, setPastedText] = useState('')
  const [sourceLabel, setSourceLabel] = useState('')
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [isBusy, setIsBusy] = useState(false)
  const [isRechecking, setIsRechecking] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [outcome, setOutcome] = useState<ApplyOutcome | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const recheckTimer = useRef<number | undefined>(undefined)
  const [suggestions, setSuggestions] = useState<Map<string, StockCodeSuggestion[]>>(new Map())
  // Öneri istekleri yavaş dönebilir; yalnızca en son istenen sonuç yazılır.
  const suggestionRequest = useRef(0)

  useEffect(() => () => { window.clearTimeout(recheckTimer.current); abortRef.current?.abort() }, [])

  const reset = () => {
    setStage('choose'); setOperation(null); setPastedText(''); setSourceLabel('')
    setRows([]); setExcluded(new Set()); setOutcome(null); setError(''); setProgress(null); setSuggestions(new Map())
  }

  const loadPreview = async (parse: () => OperationImportRow[] | Promise<OperationImportRow[]>, label: string) => {
    if (!operation) return
    setIsBusy(true); setError('')
    try {
      const parsed = await parse()
      if (parsed.length === 0) { setError('Veride hiç satır bulunamadı.'); return }
      const preview = await buildPreview(operation.id, parsed)
      setRows(preview); setExcluded(new Set()); setSourceLabel(label); setStage('preview')
      refreshSuggestions(preview)
    } catch (reason: unknown) {
      console.error(reason)
      setError(reason instanceof OperationImportFileError || reason instanceof Error ? reason.message : 'Veri okunamadı.')
    } finally { setIsBusy(false) }
  }

  // Satır içi düzenlemeden sonra durumları tazeler. Tüm satırlar için tek
  // toplu sorgu atar (productLookup parçalı), satır başına istek değil.
  const scheduleRecheck = (nextRows: PreviewRow[]) => {
    if (!operation) return
    window.clearTimeout(recheckTimer.current)
    recheckTimer.current = window.setTimeout(() => {
      setIsRechecking(true)
      buildPreview(operation.id, nextRows.map(toImportRow))
        .then((nextRows) => { setRows(nextRows); refreshSuggestions(nextRows) })
        .catch((reason: unknown) => { console.error(reason); setError('Satırlar yeniden kontrol edilemedi.') })
        .finally(() => setIsRechecking(false))
    }, RECHECK_DELAY_MS)
  }

  const editRow = (rowNumber: number, field: string, value: string) => {
    setRows((current) => {
      const next = current.map((row) => {
        if (row.rowNumber !== rowNumber) return row
        if (field === 'cartonCount') {
          // Ham metin korunur, sayı ondan türetilir: geçersiz girişte kullanıcı
          // yazdığını görmeye devam eder.
          const parsed = value.trim() === '' ? null : Number(value.replace(',', '.'))
          return { ...row, cartonText: value, cartonCount: Number.isFinite(parsed) ? parsed : null }
        }
        return { ...row, [field]: value }
      })
      scheduleRecheck(next)
      return next
    })
  }

  // "Stok yok" satırları için öneri arar. Önizlemeyi bekletmez: tablo hemen
  // görünür, öneriler geldikçe satırlara eklenir.
  function refreshSuggestions(preview: PreviewRow[]) {
    const request = ++suggestionRequest.current
    const missing = preview.filter((row) => row.status === 'missing').map((row) => row.stockCode)
    if (missing.length === 0) { setSuggestions(new Map()); return }
    suggestStockCodes(missing)
      .then((found) => { if (request === suggestionRequest.current) setSuggestions(found) })
      .catch((reason: unknown) => console.error(reason))
  }

  const suggestionsFor = (row: PreviewRow) =>
    row.status === 'missing' ? suggestions.get(normalizeStockCode(row.stockCode)) ?? [] : []

  const applyStockCodeFixes = (fixes: Array<{ rowNumber: number; stockCode: string }>) => {
    const byRow = new Map(fixes.map((fix) => [fix.rowNumber, fix.stockCode]))
    setRows((current) => {
      const next = current.map((row) => byRow.has(row.rowNumber) ? { ...row, stockCode: byRow.get(row.rowNumber)! } : row)
      scheduleRecheck(next)
      return next
    })
  }

  const applicable = rows.filter((row) => (row.status === 'ready' || row.status === 'update') && !excluded.has(row.rowNumber))
  const updateRows = rows.filter((row) => row.status === 'update')

  const runApply = async () => {
    if (!operation || applicable.length === 0) return
    const controller = new AbortController()
    abortRef.current = controller
    setIsBusy(true); setError(''); setProgress({ done: 0, total: applicable.length })
    try {
      const result = await applyRows(operation.id, applicable, {
        signal: controller.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      setOutcome(result); setStage('done')
    } catch (reason: unknown) {
      console.error(reason)
      setError(reason instanceof Error ? reason.message : 'Kayıt sırasında bir sorun oluştu.')
    } finally { setIsBusy(false); setProgress(null); abortRef.current = null }
  }

  // ---------------------------------------------------------------- ekranlar

  if (stage === 'choose') {
    return (
      <main className="operations-page">
        <Intro title="İçe Aktar" description="Ne aktarmak istediğinizi seçin. Sonraki adımda veriyi yapıştırıp önizleyeceksiniz." />
        <section className="operation-card-grid">
          {CHOICES.map((choice) => (
            <article className="operation-card" key={choice.id}>
              <h2>{choice.title}</h2>
              <p>{choice.description}<small>Beklenen kolonlar: {choice.columns}</small></p>
              <button className="text-action" type="button" onClick={() => { setOperation(choice); setStage('input') }}>Devam et →</button>
            </article>
          ))}
        </section>
      </main>
    )
  }

  if (stage === 'input' && operation) {
    return (
      <main className="operations-page import-page">
        <Intro title={operation.title} description="Veriyi yapıştırın; onaylamadan önce satır satır kontrol edeceksiniz." />
        <section className="caba-input">
          <label className="caba-paste">
            <span className="caba-paste__label"><ClipboardPaste size={15} /> Excel'den yapıştırın</span>
            <textarea
              value={pastedText}
              onChange={(event) => setPastedText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || !pastedText.trim() || isBusy) return
                event.preventDefault()
                void loadPreview(() => parseOperationImportText(pastedText), 'Yapıştırılan liste')
              }}
              placeholder={`İlk satır başlık olmalı, örneğin:\n${operation.columns.replace(/ · /g, '\t')}`}
              rows={9}
              autoFocus
            />
          </label>
          <div className="caba-actions">
            <button className="button button--primary" type="button" disabled={!pastedText.trim() || isBusy}
              onClick={() => void loadPreview(() => parseOperationImportText(pastedText), 'Yapıştırılan liste')}>
              {isBusy ? 'Okunuyor…' : 'Önizle'}
            </button>
            <span className="caba-actions__divider">veya</span>
            <input ref={fileRef} className="visually-hidden" type="file" accept=".csv,.xlsx,.xls"
              onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadPreview(() => parseOperationImportFile(file), file.name); event.target.value = '' }} />
            <button className="button button--secondary" type="button" disabled={isBusy} onClick={() => fileRef.current?.click()}><Upload size={14} /> Dosya Seç</button>
            <button className="text-action" type="button" onClick={reset}>Geri dön</button>
          </div>
          {error && <p className="caba-error" role="alert">{error}</p>}
          <p className="caba-hint"><FileSpreadsheet size={14} /> Bu adım hiçbir şey yazmaz. Önce satırları göreceksiniz.</p>
        </section>
      </main>
    )
  }

  if (stage === 'done' && outcome && operation) {
    return (
      <main className="operations-page import-page">
        <Intro title="Sonuç" description={operation.title} />
        <section className="caba-summary">
          <div><strong>{outcome.applied}</strong><span>kayıt yazıldı</span></div>
          <div className={outcome.failed.length ? 'caba-summary__warn' : undefined}><strong>{outcome.failed.length}</strong><span>başarısız</span></div>
        </section>
        {outcome.aborted && <p className="import-aborted" role="status">İşlem yarıda durduruldu. Yukarıda yazılan kayıtlar kalıcıdır.</p>}
        {outcome.failed.length > 0 && (
          <section className="import-failures">
            <h2>Başarısız satırlar</h2>
            <table className="caba-table">
              <thead><tr><th>Satır</th><th>Stok kodu</th><th>Sebep</th></tr></thead>
              <tbody>{outcome.failed.map((failure) => (
                <tr key={failure.rowNumber}><td>{failure.rowNumber}</td><td><strong>{failure.stockCode}</strong></td><td>{failure.message}</td></tr>
              ))}</tbody>
            </table>
          </section>
        )}
        <div className="import-done-actions">
          <button className="button button--primary" type="button" onClick={reset}>Yeni İçe Aktarma</button>
        </div>
      </main>
    )
  }

  // stage === 'preview'
  const counts = {
    ready: rows.filter((row) => row.status === 'ready').length,
    update: updateRows.length,
    unchanged: rows.filter((row) => row.status === 'unchanged').length,
    missing: rows.filter((row) => row.status === 'missing').length,
    invalid: rows.filter((row) => row.status === 'invalid').length,
  }
  const fixedAddressCount = rows.filter((row) => row.addressNote?.kind === 'fixed').length
  // Biçimi tanınmayan adres satırı engellenmez (bilinmeyen gerçek bir adres
  // olabilir), ama yazılacaklar arasındaysa öne çıkarılır.
  const unrecognizedRows = rows.filter((row) => row.addressNote?.kind === 'unrecognized' && (row.status === 'ready' || row.status === 'update'))
  // Toplu uygulanabilecek öneriler: yalnızca tek ve varyanttan gelen (harf/rakam
  // karışıklığı gibi) eşleşmeler. Benzerlik önerileri tek tek seçilir.
  const confidentFixes = rows.flatMap((row) => {
    const list = suggestionsFor(row)
    return list.length === 1 && list[0].source === 'variant' ? [{ rowNumber: row.rowNumber, stockCode: list[0].stockCode }] : []
  })

  return (
    <main className="operations-page import-page">
      <Intro title={operation?.title ?? ''} description={`${sourceLabel} · ${rows.length} satır. Hatalı satırları tabloda düzeltebilirsiniz.`} />

      <section className="import-counts" aria-label="Önizleme özeti">
        <span className="import-count import-count--ready">{counts.ready} yazılacak</span>
        {counts.update > 0 && <span className="import-count import-count--update">{counts.update} güncellenecek</span>}
        {counts.unchanged > 0 && <span className="import-count">{counts.unchanged} değişmeyecek</span>}
        {counts.missing > 0 && <span className="import-count import-count--missing">{counts.missing} stok yok</span>}
        {counts.invalid > 0 && <span className="import-count import-count--invalid">{counts.invalid} hatalı</span>}
        {fixedAddressCount > 0 && <span className="import-count">{fixedAddressCount} adres düzeltildi</span>}
        {unrecognizedRows.length > 0 && <span className="import-count import-count--update">{unrecognizedRows.length} adres biçimi tanınmadı</span>}
        {isRechecking && <span className="import-count import-count--busy">kontrol ediliyor…</span>}
      </section>

      {counts.update > 0 && (
        <div className="import-conflict-bar">
          <span><strong>{counts.update}</strong> satır mevcut bir kaydı değiştirecek. Eski ve yeni değer tabloda gösteriliyor.</span>
          <div>
            <button className="button button--secondary" type="button"
              onClick={() => setExcluded((current) => { const next = new Set(current); updateRows.forEach((row) => next.add(row.rowNumber)); return next })}>
              Hepsini atla
            </button>
            <button className="button button--secondary" type="button"
              onClick={() => setExcluded((current) => { const next = new Set(current); updateRows.forEach((row) => next.delete(row.rowNumber)); return next })}>
              Hepsini üzerine yaz
            </button>
          </div>
        </div>
      )}

      {confidentFixes.length > 0 && (
        <div className="import-conflict-bar">
          <span><strong>{confidentFixes.length}</strong> kayıtsız stok kodunun tek bir kesin karşılığı bulundu (harf/rakam karışıklığı gibi). Tablodaki önerilere tek tek tıklayabilir ya da hepsini uygulayabilirsiniz.</span>
          <div>
            <button className="button button--secondary" type="button" onClick={() => applyStockCodeFixes(confidentFixes)}>
              Önerileri uygula
            </button>
          </div>
        </div>
      )}

      {unrecognizedRows.length > 0 && (
        <div className="import-conflict-bar">
          <span><strong>{unrecognizedRows.length}</strong> satırın adresi beklenen biçimde değil (örnek: H21-01). Gerçek bir adresse olduğu gibi yazılır; değilse hücrede düzeltin.</span>
          <div>
            <button className="button button--secondary" type="button"
              onClick={() => setExcluded((current) => { const next = new Set(current); unrecognizedRows.forEach((row) => next.add(row.rowNumber)); return next })}>
              Bu satırları atla
            </button>
          </div>
        </div>
      )}

      <div className="import-preview-table">
        <table>
          <thead>
            <tr>
              <th className="import-col-check" />
              <th>Satır</th>
              <th>Stok kodu</th>
              {operation?.editable.includes('stockName') && <th>Stok adı</th>}
              {operation?.editable.includes('barcode') && <th>Barkod</th>}
              {operation?.editable.includes('address') && <th>Adres</th>}
              {operation?.editable.includes('cartonCount') && <th>Koli</th>}
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const selectable = row.status === 'ready' || row.status === 'update'
              const isExcluded = excluded.has(row.rowNumber)
              return (
                <tr key={row.rowNumber} className={`import-row import-row--${row.status}${isExcluded ? ' import-row--excluded' : ''}`}>
                  <td className="import-col-check">
                    {selectable && (
                      <input type="checkbox" checked={!isExcluded} aria-label={`${row.rowNumber}. satırı dahil et`}
                        onChange={() => setExcluded((current) => { const next = new Set(current); if (next.has(row.rowNumber)) next.delete(row.rowNumber); else next.add(row.rowNumber); return next })} />
                    )}
                  </td>
                  <td className="import-col-line">{row.rowNumber}</td>
                  <td><EditableCell value={row.stockCode} onChange={(value) => editRow(row.rowNumber, 'stockCode', value)} mono /></td>
                  {operation?.editable.includes('stockName') && <td><EditableCell value={row.stockName} onChange={(value) => editRow(row.rowNumber, 'stockName', value)} /></td>}
                  {operation?.editable.includes('barcode') && <td><EditableCell value={row.barcode} onChange={(value) => editRow(row.rowNumber, 'barcode', value)} mono /></td>}
                  {operation?.editable.includes('address') && <td><EditableCell value={row.address} onChange={(value) => editRow(row.rowNumber, 'address', value)} mono /></td>}
                  {operation?.editable.includes('cartonCount') && <td><EditableCell value={row.cartonText} onChange={(value) => editRow(row.rowNumber, 'cartonCount', value)} narrow /></td>}
                  <td>
                    <span className={`import-status import-status--${row.status}`}>{STATUS_LABEL[row.status]}</span>
                    {row.detail && <small className="import-detail">{row.detail}</small>}
                    {row.addressNote?.kind === 'fixed' && <small className="import-note import-note--fixed">{row.addressNote.value} olarak yazılacak</small>}
                    {row.addressNote?.kind === 'unrecognized' && <small className="import-note import-note--unrecognized">Adres biçimi tanınmadı</small>}
                    {suggestionsFor(row).length > 0 && (
                      <div className="import-suggestions">
                        <span>Bunu mu demek istediniz?</span>
                        {suggestionsFor(row).map((suggestion) => (
                          <button key={suggestion.stockCode} type="button" title={suggestion.stockName}
                            className={suggestion.source === 'variant' ? 'import-suggestion import-suggestion--strong' : 'import-suggestion'}
                            onClick={() => applyStockCodeFixes([{ rowNumber: row.rowNumber, stockCode: suggestion.stockCode }])}>
                            {suggestion.stockCode}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {error && <p className="caba-error" role="alert">{error}</p>}

      <div className="import-confirm">
        <span>
          {applicable.length > 0
            ? <><strong>{applicable.length}</strong> satır uygulanacak.</>
            : 'Uygulanacak satır yok.'}
        </span>
        <div>
          {progress
            ? <>
                <span className="import-progress">{progress.done} / {progress.total}</span>
                <button className="button button--secondary" type="button" onClick={() => abortRef.current?.abort()}>Durdur</button>
              </>
            : <>
                <button className="button button--secondary" type="button" onClick={reset} disabled={isBusy}><X size={14} /> İptal</button>
                <button className="button button--primary" type="button" disabled={applicable.length === 0 || isBusy || isRechecking} onClick={() => void runApply()}>
                  {isBusy ? 'Kaydediliyor…' : 'Uygula'}
                </button>
              </>}
        </div>
      </div>
    </main>
  )
}

function EditableCell({ value, onChange, mono, narrow }: { value: string; onChange: (value: string) => void; mono?: boolean; narrow?: boolean }) {
  return (
    <input
      className={`import-cell${mono ? ' import-cell--mono' : ''}${narrow ? ' import-cell--narrow' : ''}`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function Intro({ title, description }: { title: string; description: string }) {
  return <header className="page-header"><div><h1>{title}</h1><p className="page-header__description">{description}</p></div></header>
}

/** PreviewRow'u yeniden kontrol için ayrıştırıcı satır şekline çevirir. */
function toImportRow(row: PreviewRow): OperationImportRow {
  return {
    rowNumber: row.rowNumber,
    stockCode: row.stockCode,
    stockName: row.stockName,
    barcode: row.barcode,
    address: row.address,
    cartonCount: row.cartonCount,
    cabaQuantity: row.cartonText,
  }
}
