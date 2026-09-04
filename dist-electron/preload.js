"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    saveCsv: (suggestedName, content) => electron_1.ipcRenderer.invoke('save-csv', { suggestedName, content }),
});
