import { useState } from 'react'
import { addressRecordService } from '../data/localData'
import { isSameAddress } from '../lib/addressMove'
import { normalizeAddressInput, toStoredAddress } from '../lib/addressFormat'
import { formatNumber } from '../lib/format'
import type { AddressRecord } from '../types/addressRecord'

type Preview = { from: string; to: string; movable: AddressRecord[]; conflicts: AddressRecord[] }

/**
 * "H21-01'deki her şey H22-01'e taşındı": bir adresin aktif kayıtlarını toplu
 * olarak başka adrese taşır. Önce önizleme (hiçbir şey yazılmaz), sonra onay.
 */
export function MoveAddressPanel({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [fromInput, setFromInput] = useState('')
  const [toInput, setToInput] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [message, setMessage] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  const toNote = toInput.trim() && !normalizeAddressInput(toInput).valid
    ? 'Hedef adres bilinen biçimde (örn. H22-01) değil; yine de yazılır.'
    : ''

  const runPreview = async () => {
    setMessage('')
    setPreview(null)
    const from = toStoredAddress(fromInput)
    const to = toStoredAddress(toInput)
    if (!from || !to) { setMessage('Kaynak ve hedef adresi yazın.'); return }
    if (isSameAddress(from, to)) { setMessage('Kaynak ve hedef aynı adres.'); return }
    setIsBusy(true)
    try {
      const plan = await addressRecordService.previewMove(from, to)
      setPreview({ from, to, ...plan })
      if (plan.movable.length === 0 && plan.conflicts.length === 0) setMessage(`${from} adresinde aktif kayıt yok.`)
    } catch (reason: unknown) {
      console.error(reason)
      setMessage('Önizleme alınamadı. Bağlantıyı kontrol edip tekrar deneyin.')
    } finally {
      setIsBusy(false)
    }
  }

  const apply = async () => {
    if (!preview || preview.movable.length === 0) return
    if (!window.confirm(`${formatNumber(preview.movable.length)} kayıt ${preview.from} adresinden ${preview.to} adresine taşınsın mı?`)) return
    setIsBusy(true)
    try {
      const moved = await addressRecordService.moveRecords(preview.movable.map((record) => record.id), preview.to)
      setMessage(`${formatNumber(moved)} kayıt ${preview.to} adresine taşındı.${preview.conflicts.length > 0 ? ` ${formatNumber(preview.conflicts.length)} çakışan kayıt yerinde bırakıldı.` : ''}`)
      setPreview(null)
      onDone()
    } catch (reason: unknown) {
      console.error(reason)
      setMessage('Taşıma yapılamadı; hiçbir kayıt değişmedi. Tekrar deneyin.')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <section className="address-move" aria-label="Adres taşı">
      <div className="address-move__head">
        <strong>Adres taşı</strong>
        <button className="address-move__close" type="button" onClick={onClose} aria-label="Kapat">×</button>
      </div>
      <div className="address-move__fields">
        <label>Kaynak adres<input value={fromInput} onChange={(event) => { setFromInput(event.target.value); setPreview(null) }} placeholder="H21-01" /></label>
        <label>Hedef adres<input value={toInput} onChange={(event) => { setToInput(event.target.value); setPreview(null) }} placeholder="H22-01" /></label>
        <button className="button button--secondary" type="button" onClick={() => void runPreview()} disabled={isBusy}>Önizle</button>
      </div>
      {toNote && <p className="address-move__note">{toNote}</p>}
      {message && <p className="address-move__message" role="status">{message}</p>}
      {preview && (preview.movable.length > 0 || preview.conflicts.length > 0) && (
        <div className="address-move__preview">
          <p><strong>{formatNumber(preview.movable.length)}</strong> kayıt {preview.from} → {preview.to} taşınacak{preview.conflicts.length > 0 && <>, <strong>{formatNumber(preview.conflicts.length)}</strong> kayıt çakışıyor (hedefte aynı ürünün aktif kaydı var, taşınmaz)</>}.</p>
          <ul>
            {preview.movable.slice(0, 6).map((record) => <li key={record.id}><strong>{record.stockCode}</strong> · {record.cartonCount} koli</li>)}
            {preview.movable.length > 6 && <li>… ve {formatNumber(preview.movable.length - 6)} kayıt daha</li>}
            {preview.conflicts.slice(0, 4).map((record) => <li className="address-move__conflict" key={record.id}><strong>{record.stockCode}</strong> · çakışma, taşınmaz</li>)}
          </ul>
          <button className="button button--primary" type="button" onClick={() => void apply()} disabled={isBusy || preview.movable.length === 0}>Taşı</button>
        </div>
      )}
    </section>
  )
}
