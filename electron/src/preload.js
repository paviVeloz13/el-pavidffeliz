'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Single shared listener for all in-flight progress events.
const progressCallbacks = {};
ipcRenderer.on('worker:progress', (_evt, commandId, progress, message) => {
  progressCallbacks[commandId]?.(progress, message);
});

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Send one job to the Python worker.
   * @param {string} action  e.g. "pdf.to_png"
   * @param {object} params
   * @param {((progress: number, message?: string) => void) | null} onProgress
   * @returns {Promise<any>}
   */
  invoke(action, params = {}, onProgress = null) {
    const commandId = self.crypto.randomUUID();
    if (onProgress) progressCallbacks[commandId] = onProgress;
    return ipcRenderer
      .invoke('worker:invoke', commandId, action, params)
      .finally(() => { delete progressCallbacks[commandId]; });
  },

  /** Show a native file picker. Returns array of chosen file paths. */
  pickFiles(filters) {
    return ipcRenderer.invoke('dialog:pick-files', filters);
  },

  /** Show a native folder picker. Returns the chosen path or null. */
  pickFolder(defaultPath) {
    return ipcRenderer.invoke('dialog:pick-folder', defaultPath);
  },

  /** Reveal a file in Finder / Explorer. */
  showInFolder(filePath) {
    return ipcRenderer.invoke('shell:show-in-folder', filePath);
  },

  /** Get the default output directory (~/ Downloads/El PaviDFeliz). */
  getDefaultOutputDir() {
    return ipcRenderer.invoke('app:default-output-dir');
  },

  /** Create a directory (and parents) if it doesn't exist. */
  ensureDir(dirPath) {
    return ipcRenderer.invoke('fs:ensure-dir', dirPath);
  },

  /** Read persisted settings ({ outputDir, lang }). */
  settingsRead() {
    return ipcRenderer.invoke('settings:read');
  },

  /** Persist settings ({ outputDir, lang }). */
  settingsWrite(settings) {
    return ipcRenderer.invoke('settings:write', settings);
  },

  /** Return all history entries (oldest first). */
  historyRead() {
    return ipcRenderer.invoke('history:read');
  },

  /** Erase all history entries. */
  historyClear() {
    return ipcRenderer.invoke('history:clear');
  },

  platform: process.platform,
});
