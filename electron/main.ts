import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'

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

  window.loadFile(path.join(__dirname, '../dist/index.html'))
}

app.whenReady().then(() => {
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

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
