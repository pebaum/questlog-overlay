const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('questlog', {
  load: () => ipcRenderer.invoke('journal:load'),
  save: journal => ipcRenderer.send('journal:save', journal),
  fit: (height, layout) => ipcRenderer.send('panel:fit', height, layout),
  size: (width, height) => ipcRenderer.send('panel:size', { width, height }),
  autoSize: () => ipcRenderer.send('panel:auto-size'),
  openLink: url => ipcRenderer.invoke('link:open', url),
  startTimer: entry => ipcRenderer.invoke('timer:start', entry),
  stopTimer: () => ipcRenderer.invoke('timer:stop'),
  updateAction: () => ipcRenderer.invoke('update:action'),
  watchUpdate: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('update:state', listener);
    ipcRenderer.send('update:watch');
    return () => ipcRenderer.removeListener('update:state', listener);
  },
  watchTimer: callback => {
    ipcRenderer.on('timer:state', (_event, update) => callback(update));
    ipcRenderer.send('timer:watch');
  },
  toggleLock: () => ipcRenderer.send('panel:toggle-lock'),
  onReveal: callback => ipcRenderer.on('panel:reveal', () => callback()),
  hide: () => ipcRenderer.send('panel:hide'),
  quit: () => ipcRenderer.send('panel:quit'),
  onMode: callback => ipcRenderer.on('panel:mode', (_event, mode) => callback(mode)),
  onLimit: callback => ipcRenderer.on('panel:limit', (_event, limit) => callback(limit)),
  onHover: callback => ipcRenderer.on('panel:hover', (_event, hot) => callback(hot)),
  onSettings: callback => ipcRenderer.on('panel:settings', () => callback()),
  onSave: callback => ipcRenderer.on('journal:status', (_event, status) => callback(status))
});
