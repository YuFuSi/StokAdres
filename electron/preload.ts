import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
	saveCsv: (suggestedName: string, content: string) => ipcRenderer.invoke('save-csv', { suggestedName, content }),
	saveFile: (suggestedName: string, content: string, encoding: 'utf8' | 'base64') => ipcRenderer.invoke('save-file', { suggestedName, content, encoding }),
})
