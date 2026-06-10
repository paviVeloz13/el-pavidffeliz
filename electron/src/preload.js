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
    // Web Crypto API is available in sandboxed preloads; Node's require('crypto') is not.
    const commandId = self.crypto.randomUUID();

    if (onProgress) progressCallbacks[commandId] = onProgress;

    return ipcRenderer
      .invoke('worker:invoke', commandId, action, params)
      .finally(() => {
        delete progressCallbacks[commandId];
      });
  },

  platform: process.platform,
});
