'use strict';

/**
 * WorkerBridge — manages the single persistent Python backend process.
 *
 * Lifecycle:
 *   const bridge = new WorkerBridge(binaryPath);
 *   await bridge.start();          // spawn + health-check
 *   const result = await bridge.invoke('pdf.to_png', params, onProgress);
 *   await bridge.shutdown();       // graceful stop
 *
 * Protocol (NDJSON over stdin/stdout):
 *   → {"id":"<uuid>","action":"<op>","params":{...}}
 *   ← {"id":"<uuid>","status":"progress","progress":0.5,"message":"..."}  (0..N)
 *   ← {"id":"<uuid>","status":"ok","result":{...}}                         (final)
 *   ← {"id":"<uuid>","status":"error","error":{"code":"...","message":"..."}}
 */

const { spawn } = require('child_process');
const readline = require('readline');
const { randomUUID } = require('crypto');
const path = require('path');

const STARTUP_TIMEOUT_MS = 15_000;
const INVOKE_TIMEOUT_MS = 120_000;

class WorkerBridge {
  /** @param {string} binaryPath  Absolute path to the ilovepavidf-worker executable */
  constructor(binaryPath) {
    this._binaryPath = binaryPath;
    /** @type {Map<string, {resolve: Function, reject: Function, onProgress: Function|null, timer: NodeJS.Timeout}>} */
    this._pending = new Map();
    this._process = null;
    this._rl = null;
    this._stopping = false;
  }

  /** Spawn the worker process and verify it responds to a health check. */
  async start() {
    if (this._process) throw new Error('WorkerBridge already started');

    const workerDir = path.dirname(this._binaryPath);

    this._process = spawn(this._binaryPath, [], {
      cwd: workerDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    this._process.on('error', (err) => this._onProcessError(err));
    this._process.on('exit', (code, signal) => this._onProcessExit(code, signal));

    // Capture stderr for diagnostics but don't crash on it.
    this._process.stderr.on('data', (chunk) => {
      console.error('[worker stderr]', chunk.toString().trimEnd());
    });

    // Wire up line-by-line stdout reader.
    this._rl = readline.createInterface({ input: this._process.stdout, crlfDelay: Infinity });
    this._rl.on('line', (line) => this._onLine(line));

    // Health check to confirm the worker is alive.
    await this.invoke('health', {}, null, STARTUP_TIMEOUT_MS);
  }

  /**
   * Send one command to the worker and return a Promise for the final result.
   * @param {string} action
   * @param {object} params
   * @param {((progress: number, message?: string) => void)|null} onProgress
   * @param {number} [timeoutMs]
   * @returns {Promise<any>}
   */
  invoke(action, params = {}, onProgress = null, timeoutMs = INVOKE_TIMEOUT_MS) {
    return this.invokeWithId(randomUUID(), action, params, onProgress, timeoutMs);
  }

  /**
   * Same as invoke() but uses a caller-supplied id.
   * Use this when the caller needs the id before the promise resolves (e.g.
   * to set up a progress event channel in the renderer before results arrive).
   */
  invokeWithId(id, action, params = {}, onProgress = null, timeoutMs = INVOKE_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      if (this._stopping || !this._process) {
        return reject(new Error('Worker is not running.'));
      }

      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`Worker timed out after ${timeoutMs / 1000}s (action=${action})`));
      }, timeoutMs);

      this._pending.set(id, { resolve, reject, onProgress, timer });

      const line = JSON.stringify({ id, action, params }) + '\n';
      this._process.stdin.write(line);
    });
  }

  /**
   * Close stdin and wait for the process to exit cleanly (max 5 s, then SIGTERM).
   */
  async shutdown() {
    if (this._stopping) return;
    this._stopping = true;

    // Reject any still-pending requests.
    for (const [id, entry] of this._pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error('Worker shut down before this request completed.'));
      this._pending.delete(id);
    }

    if (!this._process) return;

    const proc = this._process;
    this._process = null;

    // Ask the worker to stop by closing its stdin.
    try { proc.stdin.end(); } catch (_) {}

    await new Promise((resolve) => {
      const forceKill = setTimeout(() => {
        try { proc.kill('SIGTERM'); } catch (_) {}
        resolve();
      }, 5_000);

      proc.once('exit', () => {
        clearTimeout(forceKill);
        resolve();
      });
    });
  }

  // ─── private ──────────────────────────────────────────────────────────────

  _onLine(line) {
    line = line.trim();
    if (!line) return;

    let event;
    try {
      event = JSON.parse(line);
    } catch {
      console.error('[worker-bridge] Non-JSON line from worker:', line);
      return;
    }

    const { id, status } = event;
    const entry = this._pending.get(id);
    if (!entry) {
      console.warn('[worker-bridge] Received response for unknown id:', id);
      return;
    }

    if (status === 'progress') {
      entry.onProgress?.(event.progress, event.message);
      return; // keep the pending entry alive
    }

    // Final response — resolve or reject and clean up.
    clearTimeout(entry.timer);
    this._pending.delete(id);

    if (status === 'ok') {
      entry.resolve(event.result);
    } else {
      const err = event.error ?? {};
      const message = err.message || 'Unknown worker error';
      const code = err.code || 'WORKER_ERROR';
      const details = err.details || {};
      const workerError = new Error(message);
      workerError.code = code;
      workerError.details = details;
      entry.reject(workerError);
    }
  }

  _onProcessError(err) {
    console.error('[worker-bridge] Process error:', err.message);
    this._rejectAllPending(new Error(`Worker process error: ${err.message}`));
  }

  _onProcessExit(code, signal) {
    if (this._stopping) return;
    console.error(`[worker-bridge] Worker exited unexpectedly (code=${code}, signal=${signal})`);
    this._rejectAllPending(new Error(`Worker exited unexpectedly (code=${code})`));
    this._process = null;
  }

  _rejectAllPending(error) {
    for (const [id, entry] of this._pending) {
      clearTimeout(entry.timer);
      entry.reject(error);
      this._pending.delete(id);
    }
  }
}

module.exports = { WorkerBridge };
