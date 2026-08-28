const { contextBridge, ipcRenderer } = require('electron');

if (process.isMainFrame) {
  contextBridge.exposeInMainWorld('browserRouting', {
    getSettings: () => ipcRenderer.invoke('browser-routing:get'),
    listBrowsers: () => ipcRenderer.invoke('browser-routing:list'),
    saveSettings: (settings) => ipcRenderer.invoke('browser-routing:save', settings),
    chooseExecutable: () => ipcRenderer.invoke('browser-routing:choose-executable'),
  });
}
