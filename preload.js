const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('versions', {
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
});

contextBridge.exposeInMainWorld('winCtl', {
  min: () => ipcRenderer.send('win:min'),
  max: () => ipcRenderer.send('win:max'),
  close: () => ipcRenderer.send('win:close'),
  theme: (light) => ipcRenderer.send('win:theme', !!light),
});

contextBridge.exposeInMainWorld('api', {
  loadStore: () => ipcRenderer.invoke('store:load'),
  saveStore: (data) => ipcRenderer.invoke('store:save', data),
  loadSettingsSync: () => ipcRenderer.sendSync('settings:getSync'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  dataDir: () => ipcRenderer.invoke('app:dataDir'),
  checkUpdate: () => ipcRenderer.invoke('app:checkUpdate'),
  startUpdate: (idx) => ipcRenderer.invoke('update:start', idx),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  onUpdate: (cb) => {
    const listener = (e, p) => cb(p);
    ipcRenderer.on('update:event', listener);
    return () => ipcRenderer.removeListener('update:event', listener);
  },
  openDataDir: () => ipcRenderer.invoke('shell:openDataDir'),
  pickDir: () => ipcRenderer.invoke('dialog:pickDir'),
  importUIGF: (game) => ipcRenderer.invoke('uigf:import', game),
  exportUIGF: (payload) => ipcRenderer.invoke('uigf:export', payload),
  exportExcel: (payload) => ipcRenderer.invoke('excel:export', payload),
  copyGenshinUrl: () => ipcRenderer.invoke('genshin:copyUrl'),
  openGenshinCacheDir: () => ipcRenderer.invoke('genshin:openCacheDir'),
  fetchGenshin: (knownLatest, link) => ipcRenderer.invoke('genshin:fetch', knownLatest, link),
  fetchHsr: (knownLatest, link) => ipcRenderer.invoke('hsr:fetch', knownLatest, link),
  copyHsrUrl: () => ipcRenderer.invoke('hsr:copyUrl'),
  openHsrCacheDir: () => ipcRenderer.invoke('hsr:openCacheDir'),
  fetchZzz: (knownLatest, link) => ipcRenderer.invoke('zzz:fetch', knownLatest, link),
  copyZzzUrl: () => ipcRenderer.invoke('zzz:copyUrl'),
  openZzzCacheDir: () => ipcRenderer.invoke('zzz:openCacheDir'),
  fetchWuwa: (link) => ipcRenderer.invoke('wuwa:fetch', link),
  importWuwaExcel: () => ipcRenderer.invoke('wuwa:importExcel'),
  copyWuwaUrl: () => ipcRenderer.invoke('wuwa:copyUrl'),
  openWuwaCacheDir: () => ipcRenderer.invoke('wuwa:openCacheDir'),
  onWuwaProgress: (cb) => {
    const listener = (e, p) => cb(p);
    ipcRenderer.on('wuwa:progress', listener);
    return () => ipcRenderer.removeListener('wuwa:progress', listener);
  },
  onZzzProgress: (cb) => {
    const listener = (e, p) => cb(p);
    ipcRenderer.on('zzz:progress', listener);
    return () => ipcRenderer.removeListener('zzz:progress', listener);
  },
  onHsrProgress: (cb) => {
    const listener = (e, p) => cb(p);
    ipcRenderer.on('hsr:progress', listener);
    return () => ipcRenderer.removeListener('hsr:progress', listener);
  },
  onFetchProgress: (cb) => {
    const listener = (e, p) => cb(p);
    ipcRenderer.on('genshin:progress', listener);
    return () => ipcRenderer.removeListener('genshin:progress', listener);
  },
});
