import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
	saveCsv: (suggestedName: string, content: string) => ipcRenderer.invoke('save-csv', { suggestedName, content }),
})
