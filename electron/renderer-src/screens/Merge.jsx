import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import FileList from '../components/FileList';
import './Merge.css';

function basename(p) { return p.split(/[\\/]/).pop(); }

export default function Merge({ s, outputDir, onPickFolder }) {
  const [files, setFiles]       = useState([]);
  const [outName, setOutName]   = useState('');
  const [phase, setPhase]       = useState('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult]     = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const onDrop = useCallback((accepted) => {
    if (!accepted.length) return;
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.path));
      const fresh = accepted.filter(f => !existing.has(f.path));
      return [...prev, ...fresh].slice(0, 50);
    });
    setPhase('idle');
    setResult(null);
    setErrorMsg('');
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    noClick: true,
    noKeyboard: true,
  });

  async function openFilePicker() {
    const paths = await window.electronAPI.pickFiles([
      { name: 'PDF files', extensions: ['pdf'] },
    ]);
    if (!paths.length) return;
    onDrop(paths.map(p => ({ path: p, name: basename(p) })));
  }

  function clearFiles() {
    setFiles([]);
    setPhase('idle');
    setResult(null);
    setErrorMsg('');
  }

  async function runMerge() {
    if (files.length < 2 || phase === 'converting') return;
    setPhase('converting');
    setProgress(0);
    setResult(null);
    setErrorMsg('');

    const api = window.electronAPI;
    try {
      await api.ensureDir(outputDir);
      const name = (outName.trim() || s.mergeOutputPlaceholder).replace(/\.pdf$/i, '') + '.pdf';
      const outputPath = `${outputDir}/${name}`;
      const res = await api.invoke(
        'pdf.merge',
        { input_paths: files.map(f => f.path), output_path: outputPath, overwrite: true },
        (p, msg) => { setProgress(p); },
      );
      setResult(res.output_paths?.[0] ?? outputPath);
      setPhase('done');
    } catch (err) {
      setErrorMsg(err.message ?? 'Unknown error');
      setPhase('error');
    }
  }

  const canMerge = files.length >= 2 && phase !== 'converting';

  return (
    <div className="merge-screen">
      <div className="screen-title">{s.mergeTitle}</div>
      <div className="screen-sub">{s.mergeSub}</div>

      <div
        {...getRootProps()}
        className={`drop-zone${isDragActive ? ' drag-over' : ''}`}
        role="button"
        aria-label={s.mergeDropTitle}
        onClick={openFilePicker}
        onKeyDown={e => e.key === 'Enter' && openFilePicker()}
        tabIndex={0}
      >
        <input {...getInputProps()} />
        <div className="drop-icon">↑</div>
        <div className="drop-title">{s.mergeDropTitle}</div>
        <div className="drop-sub">{s.mergeDropSub}</div>
      </div>

      {files.length > 0 && (
        <>
          <div className="banner info" style={{ marginTop: '0.75rem' }}>
            <span className="bicon">✔</span>
            <span>{s.mergeDetected(files.length)}</span>
            <button className="clear-btn" onClick={clearFiles} aria-label="Clear files">✕</button>
          </div>

          <FileList
            files={files}
            onReorder={setFiles}
            onRemove={idx => setFiles(f => f.filter((_, i) => i !== idx))}
          />

          {/* Output filename */}
          <div className="sec-label">{s.mergeOutputLabel}</div>
          <input
            className="name-input"
            type="text"
            value={outName}
            onChange={e => setOutName(e.target.value)}
            placeholder={s.mergeOutputPlaceholder}
            spellCheck={false}
          />

          {/* Output folder */}
          <div className="sec-label">{s.saveIn}</div>
          <div className="out-row">
            <span className="icon">📁</span>
            <span className="path">{outputDir}</span>
            <span className="change" onClick={onPickFolder} role="button" tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onPickFolder()}>
              {s.change}
            </span>
          </div>

          <button
            className="btn-primary"
            onClick={runMerge}
            disabled={!canMerge}
          >
            {phase === 'converting' ? s.merging : `⚡ ${s.mergeBtn}`}
          </button>

          {phase === 'converting' && (
            <div className="prog-card">
              <div className="prog-file">
                <span className="prog-fn">{s.merging}</span>
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
                <span className="done-label">{s.mergeDone(basename(result))}</span>
                <span className="done-reveal"
                  onClick={() => window.electronAPI.showInFolder(result)}>
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
