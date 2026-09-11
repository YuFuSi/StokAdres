import { supabase } from '../lib/supabase'

export type ConnectionState = 'checking' | 'online' | 'offline'

/** Kenar çubuğundaki göstergenin yenilenme aralığı. */
export const CONNECTION_CHECK_INTERVAL_MS = 60_000

/**
 * Kontrolün en fazla bekleyeceği süre.
 *
 * Zaman aşımı olmadan ölçüldü: ağ kesildikten sonra gösterge ~10 saniye boyunca
 * yeşil kalıyordu (fetch hatası supabase-js katmanlarından geçene kadar).
 * Sağlık göstergesinin 10 saniye yanlış bilgi vermesi kabul edilemez; 4 saniye
 * içinde yanıt gelmezse çevrimdışı sayılır.
 */
const CONNECTION_TIMEOUT_MS = 4_000

/**
 * Supabase'e ulaşılabildiğini doğrular.
 *
 * Kenar çubuğu eskiden koşulsuz "Sistem çevrimiçi · Supabase bağlantısı aktif"
 * yazıyordu; bağlantı kopukken bile yeşil yanıyordu. Gösterge bir şey iddia
 * ediyorsa doğrulanmış olmalı.
 *
 * Sorgu bilerek en ucuz biçimde: tek kolon, tek satır, sayım yok. `count`
 * istenseydi 94.900 satırlık tabloyu taramak gerekirdi — dakikada bir
 * çalışan bir sağlık kontrolü için kabul edilemez.
 */
/**
 * Çevrimdışı olmanın sebebi.
 *
 * `navigator.onLine === false` kesin olarak "internet yok" demek. `true` ise
 * internet büyük olasılıkla var ve sorun veritabanı tarafında: ücretsiz
 * Supabase projeleri 7 gün kullanılmayınca durduruluyor (2026-09-11, plan:
 * free). Kullanıcıya "bağlantı yok" demek onu yanlış yere baktırırdı.
 */
export function offlineReason(): 'no-internet' | 'database' {
  return typeof navigator !== 'undefined' && navigator.onLine === false ? 'no-internet' : 'database'
}

export const PAUSED_PROJECT_HINT =
  'İnternet varsa veritabanı projesi durdurulmuş olabilir: ücretsiz Supabase projeleri 7 gün kullanılmayınca durur. supabase.com → StokAdres projesi → Restore.'

export async function checkConnection(): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS)
  try {
    const { error } = await supabase
      .from('products')
      .select('id')
      .limit(1)
      .abortSignal(controller.signal)
    return !error
  } catch {
    // Zaman aşımı ve ağ hatası dahil her başarısızlık "çevrimdışı" demek;
    // bu fonksiyon çağıranı asla bozmamalı.
    return false
  } finally {
    clearTimeout(timer)
  }
}
