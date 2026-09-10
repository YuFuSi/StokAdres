import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'

const isDev = process.argv.includes('--dev')

const createWindow = (): void => {
  const window = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#f5f7f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Uygulama tek bir yerel sayfadan ibaret. Yeni pencere acmasi gereken hicbir
  // akis yok; window.open cagrisi ancak beklenmedik/enjekte bir icerikten
  // gelebilir. Harici baglantilar varsayilan tarayiciya devredilir, uygulama
  // penceresinde acilmaz.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Renderer'in kendi kaynagindan baska bir yere gitmesi beklenen bir davranis
  // degil. Gezinme denemesi engellenir; https ise disariya devredilir.
  window.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith('http://localhost:5173') : url.startsWith('file://')
    if (allowed) return
    event.preventDefault()
    if (url.startsWith('https://')) void shell.openExternal(url)
  })

  if (isDev) {
    window.loadURL('http://localhost:5173')
  } else {
    window.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  // Uretimde varsayilan Electron menusu (Reload, Toggle DevTools, Zoom...)
  // kaldirilir: uygulamanin kendi navigasyonu var ve bu menu Harun abinin
  // yanlislikla gelistirici araclarini acmasindan baska bir ise yaramiyor.
  // Gelistirmede duruyor.
  if (!isDev) Menu.setApplicationMenu(null)

  ipcMain.handle('save-csv', async (_event, payload: { suggestedName: string; content: string }) => {
    const result = await dialog.showSaveDialog({
      title: 'CSV dışa aktar',
      defaultPath: payload.suggestedName,
      filters: [{ name: 'CSV dosyası', extensions: ['csv'] }],
    })
    if (result.canceled || !result.filePath) return { canceled: true }

    await fs.writeFile(result.filePath, payload.content, 'utf8')
    return { canceled: false, filePath: result.filePath }
  })
  ipcMain.handle('save-file', async (_event, payload: { suggestedName: string; content: string; encoding: unknown }) => {
    // Encoding renderer'dan geliyor. BufferEncoding olarak tiplemek yalnızca
    // derleme zamanı bir vaat; IPC sınırında gelen değer her şey olabilir.
    // Beyaz liste preload'un gerçekten sunduğu iki değerle sınırlı.
    if (payload.encoding !== 'utf8' && payload.encoding !== 'base64') {
      throw new Error(`Desteklenmeyen dosya kodlaması: ${String(payload.encoding)}`)
    }
    const result = await dialog.showSaveDialog({
      title: 'Excel dışa aktar', defaultPath: payload.suggestedName,
      filters: [{ name: 'Excel dosyası', extensions: ['xlsx'] }],
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    await fs.writeFile(result.filePath, payload.content, payload.encoding)
    return { canceled: false, filePath: result.filePath }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
