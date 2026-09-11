import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'

const isDev = process.argv.includes('--dev')

// Yedekler kullanıcıya diyalog açtırmadan hep aynı yere yazılır; klasör adı
// burada sabit, renderer yol veremez.
const backupDirectory = (): string => path.join(app.getPath('documents'), 'StokAdres Yedekleri')
const BACKUP_FOLDER_NAME = /^StokAdres_yedek_\d{4}-\d{2}-\d{2}_\d{4}$/
const BACKUP_FILE_NAMES = new Set(['bilgi.txt', 'stoklar.csv', 'barkodlar.csv', 'adresler.csv'])

const createWindow = (): void => {
  const window = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#f5f7f8',
    // Paketlenmiş uygulamada pencere ikonu exe'den gelir (electron-builder
    // build/icon.ico'yu gömer). Geliştirmede exe yok, o yüzden ikon burada
    // veriliyor — yoksa `npm run dev` varsayılan Electron ikonuyla açılır.
    // build/ üretim paketine dahil edilmediği için yol yalnızca dev'de geçerli.
    ...(isDev ? { icon: path.join(__dirname, '../build/icon.png') } : {}),
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
  ipcMain.handle('save-backup', async (_event, payload: { folderName: unknown; files: unknown }) => {
    // Klasör ve dosya adları renderer'dan geliyor: yol ayırıcısı ya da "..",
    // yedek klasörünün dışına yazdırabilirdi. Yalnızca backupService'in ürettiği
    // klasör biçimi ve dört sabit dosya adı kabul edilir.
    if (typeof payload?.folderName !== 'string' || !BACKUP_FOLDER_NAME.test(payload.folderName)) {
      throw new Error('Geçersiz yedek klasörü adı.')
    }
    if (!Array.isArray(payload.files) || payload.files.length === 0) {
      throw new Error('Yedek dosyası yok.')
    }
    const files = payload.files.map((file: { name?: unknown; content?: unknown }) => {
      if (typeof file?.name !== 'string' || !BACKUP_FILE_NAMES.has(file.name) || typeof file.content !== 'string') {
        throw new Error('Geçersiz yedek dosyası.')
      }
      return { name: file.name, content: file.content }
    })
    const folderPath = path.join(backupDirectory(), payload.folderName)
    await fs.mkdir(folderPath, { recursive: true })
    for (const file of files) await fs.writeFile(path.join(folderPath, file.name), file.content, 'utf8')
    return { folderPath }
  })
  ipcMain.handle('open-backup-folder', async () => {
    const directory = backupDirectory()
    await fs.mkdir(directory, { recursive: true })
    const error = await shell.openPath(directory)
    return { ok: error === '' }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
