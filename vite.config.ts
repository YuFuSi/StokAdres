import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Ayarlar ekranı sürüm numarasını gösteriyor. Elle yazılan bir sabit
// package.json'dan kaçınılmaz olarak sapardı; tek kaynak package.json.
const { version: APP_VERSION } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// Paketlenmis uygulamanin ihtiyac duydugu TEK harici kaynaklar:
//   fonts.googleapis.com  -> global.css'teki @import (stylesheet)
//   fonts.gstatic.com     -> o stylesheet'in cektigi font dosyalari
//   *.supabase.co         -> REST cagrilari
// Bunlarin disinda hicbir sey yuklenmemeli; default-src 'none' bunu dayatir.
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data:",
  "connect-src https://*.supabase.co",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  // frame-ancestors BILEREK yok: <meta> ile teslim edildiginde tarayici bu
  // direktifi yok sayiyor ve konsola uyari basiyor. Uygulama zaten hicbir
  // yerde iframe'e gomulmuyor (tek pencere, file://).
].join('; ')

/**
 * CSP meta etiketini YALNIZCA uretim derlemesine ekler.
 *
 * Dev sunucusunda eklenmiyor: Vite'in HMR istemcisi ve React Fast Refresh
 * preamble'i inline script ve ws:// baglantisi kullaniyor; ayni politika
 * gelistirmeyi kirardi. Tehdit modeli zaten dagitilan exe, dev sunucusu degil.
 */
function productionCsp(): Plugin {
  return {
    name: 'stokadres-production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />`,
      )
    },
  }
}

export default defineConfig({
  // Electron production build'i renderer'ı file:// üzerinden yükler.
  // Mutlak '/assets/...' yolları file:// altında sürücü köküne çözülür ve
  // beyaz ekrana yol açar; göreli base bunu önler. Dev sunucusu etkilenmez.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [react(), productionCsp()],
  server: {
    watch: {
      // Build çıktıları izlenmez. Eskiden Vite `release/`i de izliyordu:
      // `npm run build:win` sırasında win-unpacked.tmp dosyaları için sürekli
      // sayfa yeniledi, izleyicinin kilitleri electron-builder'ın yeniden
      // adlandırmasını EPERM ile düşürdü ve dev sunucusu sonunda bir .dll
      // üzerinde EBUSY ile çöktü (2026-09-11, CLAUDE.md Tuzak #8b).
      ignored: ['**/release/**', '**/dist/**', '**/dist-electron/**'],
    },
  },
  build: {
    outDir: 'dist'
  }
})
