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

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { WorkerBridge } = require('./worker-bridge');

// ─── Worker path resolution ────────────────────────────────────────────────
// Dev: python/dist/pavidffeliz-worker/  (two levels up from electron/src/)
// Production (packaged): resources/python-worker/  (electron-builder extraResources)

function resolveWorkerBinary() {
  if (app.isPackaged) {
    return path.join(
      process.resourcesPath,
      'python-worker',
      process.platform === 'win32' ? 'pavidffeliz-worker.exe' : 'pavidffeliz-worker',
    );
  }
  const repoRoot = path.resolve(__dirname, '..', '..'); // electron/src/ → repo root
  const binary = process.platform === 'win32' ? 'pavidffeliz-worker.exe' : 'pavidffeliz-worker';
  return path.join(repoRoot, 'python', 'dist', 'pavidffeliz-worker', binary);
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
    title: 'El PaviDFeliz',
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

// ─── IPC: dialog + shell helpers ──────────────────────────────────────────

// ─── Settings ─────────────────────────────────────────────────────────────

let _settingsFile = null;
function settingsFile() {
  if (!_settingsFile) _settingsFile = path.join(app.getPath('userData'), 'settings.json');
  return _settingsFile;
}

function readSettings() {
  const defaults = { outputDir: path.join(os.homedir(), 'Downloads', 'El PaviDFeliz'), lang: 'es' };
  try {
    const raw = fs.readFileSync(settingsFile(), 'utf8');
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

ipcMain.handle('settings:read', () => readSettings());

ipcMain.handle('settings:write', (_event, settings) => {
  try {
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('[settings] write failed:', err.message);
  }
});

ipcMain.handle('app:default-output-dir', () => readSettings().outputDir);

ipcMain.handle('dialog:pick-files', async (_event, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: filters ?? [
      { name: 'Supported files', extensions: ['pdf', 'jpg', 'jpeg', 'png'] },
    ],
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('dialog:pick-folder', async (_event, defaultPath) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath,
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('shell:show-in-folder', (_event, filePath) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle('fs:ensure-dir', (_event, dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
});

// ─── History ──────────────────────────────────────────────────────────────

const HISTORY_SKIP = new Set(['health', 'pdf.render_preview', 'image.clean_signature']);
let _historyFile = null;

function historyFile() {
  if (!_historyFile) _historyFile = path.join(app.getPath('userData'), 'history.ndjson');
  return _historyFile;
}

function historyAppend(action, result) {
  if (HISTORY_SKIP.has(action)) return;
  const outputPaths = result?.output_paths;
  if (!Array.isArray(outputPaths) || outputPaths.length === 0) return;
  const entry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    action,
    output_paths: outputPaths,
  };
  try {
    fs.appendFileSync(historyFile(), JSON.stringify(entry) + '\n', 'utf8');
  } catch (err) {
    console.error('[history] append failed:', err.message);
  }
}

ipcMain.handle('history:read', () => {
  try {
    const raw = fs.readFileSync(historyFile(), 'utf8');
    return raw
      .split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch {
    return [];
  }
});

ipcMain.handle('history:clear', () => {
  try { fs.writeFileSync(historyFile(), '', 'utf8'); } catch {}
});

// ─── IPC: worker:invoke ───────────────────────────────────────────────────
//
// commandId is generated in the renderer (preload) so progress listeners are
// registered before this handle even fires — no race condition possible.
ipcMain.handle('worker:invoke', async (event, commandId, action, params) => {
  if (!workerBridge) {
    throw new Error('Python worker is not running.');
  }

  const sender = event.sender;
  const result = await workerBridge.invokeWithId(commandId, action, params, (progress, message) => {
    if (!sender.isDestroyed()) {
      sender.send('worker:progress', commandId, progress, message);
    }
  });
  historyAppend(action, result);
  return result;
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
      'El PaviDFeliz — startup error',
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
