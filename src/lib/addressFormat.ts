// Depo adresi biçimi: <koridor harfi><2 haneli raf>-<2 haneli kat | DİBİ>
// Örnek: F13-01, I05-04, F14-DİBİ.
//
// Canlı veri (2026-09-11): 2.818 aktif adresin 2.790'ı bu biçimde, 26'sı
// "DİBİ" katında, 2'si bozuk girilmiş (H21-1, H34-1 — doğrusu -01).
// Koridorlar F, G, H, I, J, K, N, O; raflar 01–37; katlar 01–04.
//
// Bu modül saf: Supabase import etmez, testler .env olmadan çalışır
// (CLAUDE.md Tuzak #11).

export const FLOOR_LEVEL = 'DİBİ'

export type ParsedAddress = {
  aisle: string
  rack: number
  /** DİBİ (zemin) = 0; böylece 01'den önce sıralanır. */
  level: number
}

const CANONICAL = /^([A-Z])(\d{2})-(\d{2}|DİBİ)$/

/** Kanonik biçimdeki bir adresi parçalar; biçim dışıysa null. */
export function parseAddress(address: string): ParsedAddress | null {
  const match = CANONICAL.exec(address.trim())
  if (!match) return null
  const level = match[3] === FLOOR_LEVEL ? 0 : Number(match[3])
  if (match[3] !== FLOOR_LEVEL && level === 0) return null
  return { aisle: match[1], rack: Number(match[2]), level }
}

export type NormalizedAddress = {
  /** Yazılacak değer. Tanınmadıysa yalnızca büyük harfe ve tireye çevrilmiş hali. */
  value: string
  /** Girilen değerden farklı mı (kullanıcıya "düzeltildi" diye gösterilir). */
  changed: boolean
  /** Kanonik biçime uyuyor mu. */
  valid: boolean
}

// Ayırıcılar arasında esnek: "h21 1", "H21-1", "H21/01", "H2101".
// Kat hanesi ayırıcısız yazıldıysa yalnızca 4 hane (raf 2 + kat 2) kabul edilir;
// "H211" gibi belirsiz girişler tahmin edilmez.
const LOOSE = /^([A-ZİÇĞÖŞÜ0])-?(?:(\d{2})-?(\d{2}|D[İI]B[İI])|(\d{1,2})-(\d{1,2}|D[İI]B[İI]))$/

/**
 * Elle ya da Gemini ile girilmiş bir adresi kanonik biçime çevirir.
 *
 * - Büyük harf düz `toUpperCase()` ile — `tr-TR` DEĞİL. Koridor harfinde
 *   "İ" ve "ı/i" I'ya çevrilir (depoda I koridoru var, İ yok).
 * - Koridor yerinde "0" yazıldıysa O koridoru kabul edilir.
 * - Boşluk, alt çizgi, nokta, eğik çizgi tireye çevrilir.
 * - Raf ve kat iki haneye tamamlanır; "dibi", "DIBI" → "DİBİ".
 */
export function normalizeAddressInput(raw: string): NormalizedAddress {
  const trimmed = raw.trim()
  const separated = trimmed
    .toUpperCase()
    .replace(/[\s_./\\]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  const match = LOOSE.exec(separated)
  if (!match) return { value: separated, changed: separated !== trimmed, valid: false }

  const aisle = match[1] === 'İ' ? 'I' : match[1] === '0' ? 'O' : match[1]
  const rackText = match[2] ?? match[4]
  const levelText = match[3] ?? match[5]
  const level = /^D/.test(levelText) ? FLOOR_LEVEL : levelText.padStart(2, '0')
  const value = `${aisle}${rackText.padStart(2, '0')}-${level}`
  const valid = parseAddress(value) !== null
  return { value: valid ? value : separated, changed: (valid ? value : separated) !== trimmed, valid }
}

/**
 * Veritabanına yazılacak değer: biçim tanınıyorsa kanonik hali, tanınmıyorsa
 * girilen değerin yalnızca kırpılmış hali. Tanınmayan bir girişi büyük harfe
 * çevirip tirelerle yazmak, kullanıcının bilmediği bir değişiklik olurdu.
 */
export function toStoredAddress(raw: string): string {
  const normalized = normalizeAddressInput(raw)
  return normalized.valid ? normalized.value : raw.trim()
}

/**
 * Toplama rotası sırası: koridor → raf → kat (DİBİ önce).
 * Biçim dışı adresler sona, kendi aralarında alfabetik.
 */
export function compareAddresses(left: string, right: string): number {
  const a = parseAddress(normalizeAddressInput(left).value)
  const b = parseAddress(normalizeAddressInput(right).value)
  if (a && b) return a.aisle.localeCompare(b.aisle) || a.rack - b.rack || a.level - b.level
  if (a) return -1
  if (b) return 1
  return left.localeCompare(right, 'tr-TR')
}

/** Adresin koridor harfi; biçim dışıysa null. */
export function aisleOf(address: string): string | null {
  return parseAddress(normalizeAddressInput(address).value)?.aisle ?? null
}
