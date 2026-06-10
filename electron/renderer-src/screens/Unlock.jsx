import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import './Unlock.css';
import './Lock.css';

function basename(p) { return p.split(/[\\/]/).pop(); }

export default function Unlock({ s, outputDir, onPickFolder }) {
  const [file, setFile]         = useState(null);
  const [password, setPassword] = useState('');
  const [phase, setPhase]       = useState('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult]     = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const onDrop = useCallback((accepted) => {
    if (!accepted.length) return;
    setFile(accepted[0]);
    setPhase('idle');
    setResult(null);
    setErrorMsg('');
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    noClick: true,
    noKeyboard: true,
    maxFiles: 1,
  });

  async function openFilePicker() {
    const paths = await window.electronAPI.pickFiles([
      { name: 'PDF files', extensions: ['pdf'] },
    ]);
    if (!paths.length) return;
    onDrop([{ path: paths[0], name: basename(paths[0]) }]);
  }

  function clearFile() {
    setFile(null);
    setPhase('idle');
    setResult(null);
    setErrorMsg('');
    setPassword('');
  }

  async function runUnlock() {
    if (!file || phase === 'converting' || !password) return;
    setPhase('converting');
    setProgress(0);
    setResult(null);
    setErrorMsg('');

    const api = window.electronAPI;
    try {
      await api.ensureDir(outputDir);
      const stem = basename(file.path ?? file.name).replace(/\.pdf$/i, '');
      const outputPath = `${outputDir}/${stem}_unlocked.pdf`;
      const res = await api.invoke(
        'pdf.unlock',
        { input_path: file.path, output_path: outputPath, password, overwrite: true },
        (p) => setProgress(p),
      );
      setResult(res.output_paths?.[0] ?? outputPath);
      setPhase('done');
    } catch (err) {
      setErrorMsg(err.message ?? 'Unknown error');
      setPhase('error');
    }
  }

  const canUnlock = file && phase !== 'converting' && password.length > 0;

  return (
    <div className="unlock-screen">
      <div className="screen-title">{s.unlockTitle}</div>
      <div className="screen-sub">{s.unlockSub}</div>

      <div
        {...getRootProps()}
        className={`drop-zone${isDragActive ? ' drag-over' : ''}`}
        role="button"
        aria-label={s.unlockDropTitle}
        onClick={openFilePicker}
        onKeyDown={e => e.key === 'Enter' && openFilePicker()}
        tabIndex={0}
      >
        <input {...getInputProps()} />
        <div className="drop-icon">↑</div>
        <div className="drop-title">{s.unlockDropTitle}</div>
        <div className="drop-sub">{s.unlockDropSub}</div>
      </div>

      {file && (
        <>
          <div className="banner info" style={{ marginTop: '0.75rem' }}>
            <span className="bicon">✔</span>
            <span>{file.name} — {s.unlockDetected}</span>
            <button className="clear-btn" onClick={clearFile} aria-label="Clear file">✕</button>
          </div>

          <div className="sec-label">{s.unlockPasswordLabel}</div>
          <input
            className="pw-input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={s.unlockPasswordHint}
            autoComplete="current-password"
          />

          <div className="sec-label">{s.saveIn}</div>
          <div className="out-row">
            <span className="icon">📁</span>
            <span className="path">{outputDir}</span>
            <span className="change" onClick={onPickFolder} role="button" tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onPickFolder()}>
              {s.change}
            </span>
          </div>

          <button className="btn-primary" onClick={runUnlock} disabled={!canUnlock}>
            {phase === 'converting' ? s.unlocking : `⚡ ${s.unlockBtn}`}
          </button>

          {phase === 'converting' && (
            <div className="prog-card">
              <div className="prog-file">
                <span className="prog-fn">{s.unlocking}</span>
                <span className="prog-pct">{Math.round(progress * 100)}%</span>
              </div>
              <div className="prog-track">
                <div className="prog-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </div>
          )}

          {phase === 'done' && result && (
            <div className="prog-card">
              <div className="done-row">
                <span style={{ color: 'var(--color-text-success)' }}>✔</span>
                <span className="done-label">{s.unlockDone(basename(result))}</span>
                <span className="done-reveal" onClick={() => window.electronAPI.showInFolder(result)}>
                  📂 {s.showInFolder}
                </span>
              </div>
            </div>
          )}

          {phase === 'error' && (
            <div className="banner danger" style={{ marginTop: '0.75rem' }}>
              <span className="bicon">⚠</span>
              <span><strong>{s.errorPrefix}:</strong> {errorMsg}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
