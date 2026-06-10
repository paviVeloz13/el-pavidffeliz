import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import './Lock.css';

function basename(p) { return p.split(/[\\/]/).pop(); }

export default function Lock({ s, outputDir, onPickFolder }) {
  const [file, setFile]         = useState(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [phase, setPhase]       = useState('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult]     = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const mismatch = confirm.length > 0 && password !== confirm;

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
    setConfirm('');
  }

  async function runLock() {
    if (!file || phase === 'converting' || !password || mismatch) return;
    setPhase('converting');
    setProgress(0);
    setResult(null);
    setErrorMsg('');

    const api = window.electronAPI;
    try {
      await api.ensureDir(outputDir);
      const stem = basename(file.path ?? file.name).replace(/\.pdf$/i, '');
      const outputPath = `${outputDir}/${stem}_locked.pdf`;
      const res = await api.invoke(
        'pdf.lock',
        { input_path: file.path, output_path: outputPath, user_password: password, overwrite: true },
        (p) => setProgress(p),
      );
      setResult(res.output_paths?.[0] ?? outputPath);
      setPhase('done');
    } catch (err) {
      setErrorMsg(err.message ?? 'Unknown error');
      setPhase('error');
    }
  }

  const canLock = file && phase !== 'converting' && password.length > 0 && !mismatch && password === confirm;

  return (
    <div className="lock-screen">
      <div className="screen-title">{s.lockTitle}</div>
      <div className="screen-sub">{s.lockSub}</div>

      <div
        {...getRootProps()}
        className={`drop-zone${isDragActive ? ' drag-over' : ''}`}
        role="button"
        aria-label={s.lockDropTitle}
        onClick={openFilePicker}
        onKeyDown={e => e.key === 'Enter' && openFilePicker()}
        tabIndex={0}
      >
        <input {...getInputProps()} />
        <div className="drop-icon">↑</div>
        <div className="drop-title">{s.lockDropTitle}</div>
        <div className="drop-sub">{s.lockDropSub}</div>
      </div>

      {file && (
        <>
          <div className="banner info" style={{ marginTop: '0.75rem' }}>
            <span className="bicon">✔</span>
            <span>{file.name} — {s.lockDetected}</span>
            <button className="clear-btn" onClick={clearFile} aria-label="Clear file">✕</button>
          </div>

          <div className="sec-label">{s.lockPasswordLabel}</div>
          <input
            className={`pw-input${mismatch ? ' error' : ''}`}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={s.lockPasswordHint}
            autoComplete="new-password"
          />

          <div className="sec-label">{s.lockConfirmLabel}</div>
          <input
            className={`pw-input${mismatch ? ' error' : ''}`}
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder={s.lockConfirmHint}
            autoComplete="new-password"
          />

          {mismatch && (
            <div className="banner danger" style={{ marginTop: '-0.375rem', marginBottom: '0.75rem' }}>
              <span className="bicon">⚠</span>
              <span>{s.lockMismatch}</span>
            </div>
          )}

          <div className="sec-label">{s.saveIn}</div>
          <div className="out-row">
            <span className="icon">📁</span>
            <span className="path">{outputDir}</span>
            <span className="change" onClick={onPickFolder} role="button" tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onPickFolder()}>
              {s.change}
            </span>
          </div>

          <button className="btn-primary" onClick={runLock} disabled={!canLock}>
            {phase === 'converting' ? s.locking : `⚡ ${s.lockBtn}`}
          </button>

          {phase === 'converting' && (
            <div className="prog-card">
              <div className="prog-file">
                <span className="prog-fn">{s.locking}</span>
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
                <span className="done-label">{s.lockDone(basename(result))}</span>
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
