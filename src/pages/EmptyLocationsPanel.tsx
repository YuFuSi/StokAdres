import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { findEmptyLocations, formatRack, type EmptyLocationReport } from '../lib/emptyLocations'
import { resolveAddressRange } from '../lib/addressRange'
import { formatNumber } from '../lib/format'
import { findAddressesInRange } from '../services/outputService'
import { exportWorkbook } from '../services/xlsxExport'

/**
 * Boş konum raporu. Fiziksel raf ızgarası veritabanında yok; ızgara koridorda
 * görülen en büyük rafa ve 01–04 katlarına göre çıkarılır (lib/emptyLocations.ts).
 */
export function EmptyLocationsPanel({ aisles, initialAisle }: { aisles: string[]; initialAisle: string }) {
  const [aisle, setAisle] = useState(initialAisle || aisles[0] || '')
  const [report, setReport] = useState<EmptyLocationReport | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!aisle) return
    let cancelled = false
    setIsLoading(true)
    setError('')
    void (async () => {
      try {
        const resolved = resolveAddressRange(aisle, '')
        if ('error' in resolved) throw new Error(resolved.error)
        const items = await findAddressesInRange(resolved.range)
        if (cancelled) return
        setReport(findEmptyLocations(aisle, items.flatMap((item) => item.addresses.map((address) => address.address))))
      } catch (reason: unknown) {
        console.error(reason)
        if (!cancelled) setError('Boş konumlar hesaplanamadı. Bağlantıyı kontrol edip tekrar deneyin.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [aisle])

  const exportReport = async () => {
    if (!report) return
    await exportWorkbook([{
      name: `${aisle} boş konumlar`,
      rows: report.racks.flatMap((rack) => rack.emptyLevels.map((level) => ({ Adres: `${aisle}${formatRack(rack.rack)}-${level}`, Koridor: aisle, Raf: formatRack(rack.rack), Kat: level }))),
    }], `bos_konumlar_${aisle}.xlsx`)
  }

  return (
    <section className="empty-locations" aria-label="Boş konumlar">
      <div className="empty-locations__bar">
        <label>Koridor
          <select value={aisle} onChange={(event) => setAisle(event.target.value)}>
            {aisles.map((letter) => <option key={letter} value={letter}>{letter}</option>)}
          </select>
        </label>
        {report && <span className="empty-locations__summary"><strong>{formatNumber(report.filledLocations)}</strong> dolu · <strong>{formatNumber(report.emptyLocations)}</strong> boş / {formatNumber(report.totalLocations)} konum</span>}
        <button className="button button--secondary" type="button" onClick={() => void exportReport()} disabled={!report || report.emptyLocations === 0}><Download size={15} /> Excel'e al</button>
      </div>
      <p className="empty-locations__hint">Izgara, koridorda görülen en büyük rafa ve 01–04 katlarına göre çıkarılır (DİBİ yalnızca koridorda kullanılıyorsa). Fiziksel raf sayısı sistemde tanımlı değil.</p>
      {isLoading && <p className="addresses-state" role="status">Hesaplanıyor...</p>}
      {error && <p className="addresses-state addresses-state--error" role="alert">{error}</p>}
      {!isLoading && !error && report && (
        report.racks.length === 0
          ? <p className="addresses-state">{report.totalLocations === 0 ? 'Bu koridorda aktif adres yok.' : 'Bu koridorda boş konum yok.'}</p>
          : <table className="empty-locations__table">
              <thead><tr><th>Raf</th><th>Boş katlar</th><th>Boş</th></tr></thead>
              <tbody>{report.racks.map((rack) => <tr key={rack.rack}><td><strong>{aisle}{formatRack(rack.rack)}</strong></td><td>{rack.emptyLevels.join(' · ')}</td><td>{rack.emptyLevels.length}</td></tr>)}</tbody>
            </table>
      )}
      {report && report.unparsed.length > 0 && <p className="empty-locations__hint">Biçim dışı {formatNumber(report.unparsed.length)} adres hesaba katılmadı: {report.unparsed.slice(0, 5).join(', ')}{report.unparsed.length > 5 ? '…' : ''}</p>}
    </section>
  )
}
