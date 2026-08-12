const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('sneaky', {
  getRecord: () => ipcRenderer.invoke('record:get'),
  saveRecord: (record) => ipcRenderer.send('record:save', record),
  // 오버레이는 포커스를 받지 않으므로 스윙은 전역 단축키 → main → 여기로 온다.
  onSwing: (handler) => ipcRenderer.on('swing', () => handler()),
})
