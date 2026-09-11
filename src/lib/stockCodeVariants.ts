// Gemini'nin kâğıttan okurken yaptığı tipik hatalar için stok kodu adayları
// üretir. Adaylar veritabanında aranır; yalnızca gerçekten var olanlar öneri
// olarak gösterilir, hiçbiri kendiliğinden yazılmaz.
//
// Canlı stok kodu biçimleri (2026-09-11): TEKS10465 (74k), ELK00339,
// ZÜC54337, HIR0122, 001614 (sayısal), ELK-00816 (tireli).
// Yapı "harf öneki + sayı" olduğu için hatalar da buna göre aranıyor:
//   - sayı kısmında rakama benzeyen harfler   TEKSI0465 → TEKS10465
//   - önekte harfe benzeyen rakamlar          0YN013989 → OYN013989
//   - Ü'nün U okunması                        ZUCC90592 → ZÜCC90592
//   - önek ile sayı arasındaki tire           ELK00816  → ELK-00816
//   - sayısal kodlarda baştaki sıfırlar       1614      → 001614
//
// Saf modül: Supabase import etmez (CLAUDE.md Tuzak #11).

const TO_DIGIT: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', İ: '1', L: '1', Z: '2', S: '5', G: '6', B: '8' }
const TO_LETTER: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '6': 'G', '8': 'B' }
const LETTERS = /^[A-ZÇĞİÖŞÜ]*$/
const MAX_PREFIX_LENGTH = 5
const MAX_VARIANTS = 60

export function stockCodeVariants(code: string): string[] {
  const original = code.trim().toUpperCase().replace(/\s+/g, '')
  const body = original.replace(/-/g, '')
  if (!body) return []

  const variants = new Set<string>()

  for (let split = 0; split <= Math.min(MAX_PREFIX_LENGTH, body.length - 1); split += 1) {
    const prefix = [...body.slice(0, split)].map((char) => TO_LETTER[char] ?? char).join('')
    const tailChars = [...body.slice(split)]
    if (!LETTERS.test(prefix)) continue
    if (!tailChars.every((char) => /\d/.test(char) || char in TO_DIGIT)) continue
    // Kuyrukta en az bir gerçek rakam olmalı; yoksa "TEKS" gibi bir kelime
    // bütünüyle rakama çevrilip anlamsız adaylar üretilir.
    if (!tailChars.some((char) => /\d/.test(char))) continue
    const tail = tailChars.map((char) => TO_DIGIT[char] ?? char).join('')

    const prefixes = prefix.includes('U') ? [prefix, prefix.replace(/U/g, 'Ü')] : [prefix]
    for (const candidatePrefix of prefixes) {
      variants.add(candidatePrefix + tail)
      if (candidatePrefix) variants.add(`${candidatePrefix}-${tail}`)
    }
    if (!prefix && tail.length < 7) {
      variants.add(tail.padStart(6, '0'))
      variants.add(tail.padStart(7, '0'))
    }
  }

  variants.delete(original)
  return [...variants].slice(0, MAX_VARIANTS)
}
