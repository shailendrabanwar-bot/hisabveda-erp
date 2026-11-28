const { contextBridge, ipcRenderer } = require('electron');

let cachedBootstrap = null;

function readBootstrapState() {
  if (!cachedBootstrap) {
    cachedBootstrap = ipcRenderer.sendSync('hv:bootstrap-sync');
  }
  return cachedBootstrap;
}

const desktopBridge = {
  isDesktopApp: true,
  platform: process.platform,
  onNavigate: (callback) => ipcRenderer.on('nav', (_event, tab) => callback(tab)),
  getBootstrapState: () => readBootstrapState(),
  getMachineId: () => ipcRenderer.sendSync('hv:get-machine-id'),
  getHardwareSummary: () => ipcRenderer.sendSync('hv:get-hardware-summary'),
  checkClockSync: (nowMs) => ipcRenderer.sendSync('hv:clock-check', nowMs),
  saveWorkspace: (storageKey, data) => ipcRenderer.invoke('hv:save-workspace', storageKey, data),
  saveSettings: (config) => ipcRenderer.invoke('hv:save-settings', config),
  saveSnapshot: (snapshotKey, snapshot) => ipcRenderer.invoke('hv:save-snapshot', snapshotKey, snapshot),
  saveLicenseState: (license) => ipcRenderer.invoke('hv:save-license', license),
  createBackupNow: () => ipcRenderer.invoke('hv:create-backup-now'),
  getStorageInfo: () => ipcRenderer.invoke('hv:get-storage-info'),
  openExternalUrl: (url) => ipcRenderer.invoke('hv:open-external', url),
  flushSync: (payload) => ipcRenderer.sendSync('hv:flush-sync', payload),
  checkForUpdates: () => ipcRenderer.invoke('hv:check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('hv:install-update'),
  onUpdateAvailable: (callback) => ipcRenderer.on('hv:update-available', (_e, info) => callback(info)),
  onUpdateProgress: (callback) => ipcRenderer.on('hv:update-progress', (_e, prog) => callback(prog)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('hv:update-downloaded', (_e, info) => callback(info)),
};

contextBridge.exposeInMainWorld('hisabvedaDesktop', Object.freeze(desktopBridge));

// Preserve backward-compatible read-only bridge namespace
contextBridge.exposeInMainWorld('snaNativeAPI', Object.freeze({
  onNavigate: desktopBridge.onNavigate,
  platform: process.platform,
  isDesktopApp: true,
}));
