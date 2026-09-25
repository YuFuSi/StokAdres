// Açılışta beyaz flaşı önleme: React render edilmeden önce kayıtlı temayı
// oku ve html data-theme ile meta theme-color değerini derhal ayarla.
//
// index.html'e INLINE olarak yazılmaz: üretim CSP'si `script-src 'self'`
// (nonce/hash veya 'unsafe-inline' yok, vite.config.ts CONTENT_SECURITY_POLICY),
// inline <script> tarayıcı tarafından sessizce engellenir ve flaş önleme hiç
// çalışmaz (yalnızca CSP meta'sının eklenmediği dev sunucusunda görünmeden
// çalışır — build:win ile paketlenmiş uygulamada fark edilmezdi). Aynı-köken
// bir dosyadan <script src> yüklemek `'self'` altında serbesttir.
(function () {
  try {
    var stored = localStorage.getItem('stokadres-theme-v1')
    var isDark = stored === 'dark' || (stored === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
    if (isDark) {
      document.documentElement.dataset.theme = 'dark'
      document.documentElement.style.backgroundColor = '#171a1a'
      var meta = document.querySelector('meta[name="theme-color"]')
      if (meta) meta.setAttribute('content', '#171a1a')
    } else {
      document.documentElement.dataset.theme = 'light'
      document.documentElement.style.backgroundColor = '#f5f7f8'
    }
  } catch (e) {}
})()
