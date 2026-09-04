"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const createWindow = () => {
    const window = new electron_1.BrowserWindow({
        width: 1200,
        height: 780,
        minWidth: 900,
        minHeight: 620,
        backgroundColor: '#f5f7f8',
        webPreferences: {
            preload: node_path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    window.loadFile(node_path_1.default.join(__dirname, '../dist/index.html'));
};
electron_1.app.whenReady().then(() => {
    electron_1.ipcMain.handle('save-csv', async (_event, payload) => {
        const result = await electron_1.dialog.showSaveDialog({
            title: 'CSV dışa aktar',
            defaultPath: payload.suggestedName,
            filters: [{ name: 'CSV dosyası', extensions: ['csv'] }],
        });
        if (result.canceled || !result.filePath)
            return { canceled: true };
        await promises_1.default.writeFile(result.filePath, payload.content, 'utf8');
        return { canceled: false, filePath: result.filePath };
    });
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
