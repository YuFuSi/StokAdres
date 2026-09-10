/**
 * Sayı biçimlendirme — TEK otorite.
 *
 * Bu dosyadan önce aynı sayı ekrandan ekrana farklı görünüyordu: Genel Bakış
 * `toLocaleString('tr-TR')` kullandığı için "94.900", Stoklar ve Adresler ham
 * `{value}` bastığı için "94900" yazıyordu. Aynı uygulamada iki biçim olması,
 * kullanıcının aynı sayıya baktığından emin olamaması demek.
 *
 * Yeni bir sayı ekrana basılacaksa buradan geçsin.
 */
export function formatNumber(value: number): string {
  return value.toLocaleString('tr-TR')
}
