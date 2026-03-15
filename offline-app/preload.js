const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('offlineStorage', {
  // 从磁盘读取 localStorage 快照
  async loadLocal() {
    const data = await ipcRenderer.invoke('offline:loadLocalSnapshot');
    return data || {};
  },
  // 将当前 localStorage 快照写入磁盘
  async saveLocal(snapshot) {
    return ipcRenderer.invoke('offline:saveLocalSnapshot', snapshot || {});
  }
});

