'use strict';

/**
 * Electron main process.
 *
 * Responsibilities:
 *  - Create and manage the BrowserWindow.
 *  - Spawn and own the Python worker via WorkerBridge.
 *  - Handle IPC from the renderer, forward to the worker, stream results back.
 *  - Shut everything down cleanly on quit.
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { WorkerBridge } = require('./worker-bridge');

// ─── Worker path resolution ────────────────────────────────────────────────
// Dev: python/dist/ilovepavidf-worker/  (two levels up from electron/src/)
// Production (packaged): resources/python-worker/  (electron-builder extraResources)

function resolveWorkerBinary() {
  if (app.isPackaged) {
    return path.join(
      process.resourcesPath,
      'python-worker',
      'ilovepavidf-worker',
      process.platform === 'win32' ? 'ilovepavidf-worker.exe' : 'ilovepavidf-worker',
    );
  }
  const repoRoot = path.resolve(__dirname, '..', '..'); // electron/src/ → repo root
  const binary = process.platform === 'win32' ? 'ilovepavidf-worker.exe' : 'ilovepavidf-worker';
  return path.join(repoRoot, 'python', 'dist', 'ilovepavidf-worker', binary);
}

// ─── Global state ─────────────────────────────────────────────────────────

/** @type {WorkerBridge|null} */
let workerBridge = null;

/** @type {BrowserWindow|null} */
let mainWindow = null;

// ─── Window creation ──────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    title: 'iLovePaviDF',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (!app.isPackaged) mainWindow.webContents.openDevTools({ mode: 'bottom' });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── IPC: worker:invoke ───────────────────────────────────────────────────
//
// The renderer calls ipcRenderer.invoke('worker:invoke', action, params)
// and receives back the commandId so it can listen for streaming events.
// The main process then forwards progress and final result to the renderer
// via per-commandId channels.

// commandId is generated in the renderer (preload) so progress listeners are
// registered before this handle even fires — no race condition possible.
ipcMain.handle('worker:invoke', async (event, commandId, action, params) => {
  if (!workerBridge) {
    throw new Error('Python worker is not running.');
  }

  const sender = event.sender;
  return workerBridge.invokeWithId(commandId, action, params, (progress, message) => {
    if (!sender.isDestroyed()) {
      sender.send('worker:progress', commandId, progress, message);
    }
  });
});

// ─── App lifecycle ────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  const binaryPath = resolveWorkerBinary();
  workerBridge = new WorkerBridge(binaryPath);

  try {
    await workerBridge.start();
    console.log('[main] Python worker started successfully.');
  } catch (err) {
    console.error('[main] Failed to start Python worker:', err.message);
    dialog.showErrorBox(
      'iLovePaviDF — startup error',
      `Could not start the PDF processing engine.\n\n${err.message}\n\nWorker path: ${binaryPath}`,
    );
    app.quit();
    return;
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', async (event) => {
  if (workerBridge) {
    event.preventDefault();
    try {
      await workerBridge.shutdown();
    } catch (err) {
      console.error('[main] Worker shutdown error:', err.message);
    } finally {
      workerBridge = null;
      app.quit();
    }
  }
});
