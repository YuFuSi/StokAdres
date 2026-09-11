// Çıktı Al > Adres aralığı: "G01-01'den G'nin sonuna kadar".
//
// Kullanıcının yazdığı başlangıç/bitiş, veritabanındaki rota anahtarına
// çevrilir (public.address_route_key, 20260911… address_range_listing):
//   <koridor harfi><2 haneli raf><2 haneli kat>, DİBİ = 00
// Kısmi giriş serbest: "G" tüm koridor, "G05" tek raf, "G05-02" tek kat.
// Başlangıçta eksik kısım en küçük (00), bitişte en büyük (99) ile doldurulur.
//
// Saf modül: Supabase import etmez (CLAUDE.md Tuzak #11).

export type AddressRange = {
  fromKey: string
  toKey: string
  /** Başlıkta ve dosya adında: "G01-01 → G sonu". */
  label: string
}

const PARTIAL = /^([A-Z])(?:(\d{1,2})(?:-(\d{1,2}|D[İI]B[İI]))?)?$/

function normalizeBoundText(raw: string): string {
  const text = raw
    .trim()
    .toUpperCase()
    .replace(/[\s_./\\]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    // Koridor harfi: İ (Türkçe klavye) → I, rakam sıfır → O (addressFormat ile aynı kural).
    .replace(/^İ/, 'I')
    .replace(/^0(?=\d)/, 'O')
  // "G0101" gibi ayırıcısız tam adres.
  const compact = /^([A-Z])(\d{2})(\d{2})$/.exec(text)
  return compact ? `${compact[1]}${compact[2]}-${compact[3]}` : text
}

/** Girişi rota anahtarına çevirir; tanınmazsa null. */
export function parseRangeBound(raw: string, edge: 'from' | 'to'): string | null {
  const text = normalizeBoundText(raw)
  if (!text) return null
  const match = PARTIAL.exec(text)
  if (!match) return null
  const [, aisle, rack, level] = match
  const fill = edge === 'from' ? '00' : '99'
  const rackPart = rack ? rack.padStart(2, '0') : fill
  const levelPart = level ? (/^D/.test(level) ? '00' : level.padStart(2, '0')) : fill
  return `${aisle}${rackPart}${levelPart}`
}

export function resolveAddressRange(fromInput: string, toInput: string): { range: AddressRange } | { error: string } {
  if (!fromInput.trim()) return { error: 'Başlangıç adresini yazın (örn. G01-01 ya da yalnızca G).' }
  const fromKey = parseRangeBound(fromInput, 'from')
  if (!fromKey) return { error: `Başlangıç "${fromInput.trim()}" tanınmadı. Örnek: G, G05 ya da G05-02.` }

  // Bitiş boşsa başlangıcın koridorunun sonu: "G01-01'den G'nin sonuna kadar".
  const aisle = fromKey[0]
  const toText = toInput.trim() || aisle
  const toKey = parseRangeBound(toText, 'to')
  if (!toKey) return { error: `Bitiş "${toInput.trim()}" tanınmadı. Örnek: G, G37 ya da G37-04.` }
  if (fromKey > toKey) return { error: 'Başlangıç, bitişten sonra geliyor. İki alanın yerini değiştirin.' }

  return { range: { fromKey, toKey, label: `${describeBound(fromInput)} → ${describeBound(toText, true)}` } }
}

function describeBound(raw: string, isEnd = false): string {
  const text = normalizeBoundText(raw)
  // Yalnızca koridor harfi yazıldıysa "G başı" / "G sonu" demek daha anlaşılır.
  if (/^[A-Z]$/.test(text)) return `${text} ${isEnd ? 'sonu' : 'başı'}`
  return text
}
