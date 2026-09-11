import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Pencil } from 'lucide-react'

// Tablo hücresini yerinde düzenler: değere tıkla → alan açılır → Enter veya
// alandan çıkınca kaydeder, Esc vazgeçer. Harun abinin isteği: "düzeltmek
// istediğimde doğrudan o ekrandan" — yan panel açmadan.
//
// Hücre satırın içinde duruyor; satırın kendi tıklama ve klavye olaylarına
// (ayrıntı paneli, ↑/↓) sızmaması için olaylar burada durduruluyor.

type InlineEditProps = {
  kind: 'text' | 'number' | 'select'
  /** Düzenlenen ham değer (select için seçeneğin anahtarı). */
  value: string
  /** Düzenleme dışındayken hücrede görünen içerik. */
  display: ReactNode
  /** Ekran okuyucu ve ipucu için alan adı, örn. "Adres". */
  label: string
  options?: Array<[value: string, label: string]>
  /** Hata mesajı döndürürse kaydetmez; alan açık kalır. */
  validate?: (value: string) => string | null
  /** Hata fırlatırsa mesajı hücrenin altında gösterilir, alan açık kalır. */
  onCommit: (value: string) => Promise<void>
  inputClassName?: string
}

export function InlineEdit({ kind, value, display, label, options = [], validate, onCommit, inputClassName = '' }: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    if (!isEditing) return
    if (kind === 'select') selectRef.current?.focus()
    else { inputRef.current?.focus(); inputRef.current?.select() }
  }, [isEditing, kind])

  const open = () => { setDraft(value); setError(''); setIsEditing(true) }
  const close = () => { setIsEditing(false); setError('') }

  const commit = async (next: string) => {
    if (isSaving) return
    if (next.trim() === value.trim()) { close(); return }
    const problem = validate?.(next) ?? null
    if (problem) { setError(problem); return }
    setIsSaving(true)
    setError('')
    try {
      await onCommit(next)
      setIsEditing(false)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Kaydedilemedi.')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isEditing) {
    return (
      <button
        type="button"
        className="inline-edit"
        // Satırın kendisi zaten klavye durağı; her hücreye ayrı durak eklemek
        // 50 satırlık listede Tab gezinmesini üç katına çıkarırdı.
        tabIndex={-1}
        title={`${label} düzenlemek için tıklayın`}
        aria-label={`${label} düzenle`}
        onClick={(event) => { event.stopPropagation(); open() }}
      >
        {display}
        <Pencil size={12} className="inline-edit__pencil" aria-hidden="true" />
      </button>
    )
  }

  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation()

  return (
    <span className="inline-edit-field" onClick={stop} onKeyDown={stop}>
      {kind === 'select' ? (
        <select
          ref={selectRef}
          className={`inline-edit-input ${inputClassName}`}
          aria-label={label}
          value={draft}
          disabled={isSaving}
          onChange={(event) => { setDraft(event.target.value); void commit(event.target.value) }}
          onBlur={() => { if (!isSaving && !error) close() }}
          onKeyDown={(event) => { if (event.key === 'Escape') close() }}
        >
          {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
        </select>
      ) : (
        <input
          ref={inputRef}
          className={`inline-edit-input ${inputClassName}`}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          type={kind === 'number' ? 'number' : 'text'}
          inputMode={kind === 'number' ? 'numeric' : undefined}
          min={kind === 'number' ? 1 : undefined}
          step={kind === 'number' ? 1 : undefined}
          value={draft}
          disabled={isSaving}
          onChange={(event) => { setDraft(event.target.value); setError('') }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); void commit(draft) }
            if (event.key === 'Escape') { event.preventDefault(); close() }
          }}
          // Hata gösterilirken alandan çıkmak tekrar tekrar aynı hatayı
          // üretmesin: kullanıcı yazdığını görmeye devam eder.
          onBlur={() => { if (!error) void commit(draft) }}
        />
      )}
      {isSaving && <small className="inline-edit-status" role="status">Kaydediliyor…</small>}
      {error && <small className="inline-edit-error" role="alert">{error}</small>}
    </span>
  )
}
