import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Electron production build'i renderer'ı file:// üzerinden yükler.
  // Mutlak '/assets/...' yolları file:// altında sürücü köküne çözülür ve
  // beyaz ekrana yol açar; göreli base bunu önler. Dev sunucusu etkilenmez.
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist'
  }
})
