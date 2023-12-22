// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron/renderer')

contextBridge.exposeInMainWorld('electronAPI', {
  pickPathToBackUp() {
    return ipcRenderer.invoke('pickPathToBackUp')
  },
  pickPathToBackUpTo() {
    return ipcRenderer.invoke('pickPathToBackUpTo')
  },
  startBackingUp() {
    ipcRenderer.send('startBackingUp')
  },
  stopBackingUp() {
    ipcRenderer.send('stopBackingUp')
  },
})
