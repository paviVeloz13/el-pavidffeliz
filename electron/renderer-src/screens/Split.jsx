import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import './Split.css';

function basename(p) { return p.split(/[\\/]/).pop(); }

export default function Split({ s, outputDir, onPickFolder }) {
  const [file, setFile]           = useState(null);
  const [mode, setMode]           = useState('ranges'); // ranges | every_n | individual
  const [ranges, setRanges]       = useState('');
  const [everyN, setEveryN]       = useState(2);
  const [phase, setPhase]         = useState('idle');
  const [progress, setProgress]   = useState(0);
  const [results, setResults]     = useState([]);
  const [errorMsg, setErrorMsg]   = useState('');

  const onDrop = useCallback((accepted) => {
    if (!accepted.length) return;
    setFile(accepted[0]);
    setPhase('idle');
    setResults([]);
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
    const f = { path: paths[0], name: basename(paths[0]) };
    onDrop([f]);
  }

  function clearFile() {
    setFile(null);
    setPhase('idle');
    setResults([]);
    setErrorMsg('');
  }

  async function runSplit() {
    if (!file || phase === 'converting') return;
    setPhase('converting');
    setProgress(0);
    setResults([]);
    setErrorMsg('');

    const api = window.electronAPI;
    try {
      await api.ensureDir(outputDir);
      let action, params;

      if (mode === 'ranges') {
        action = 'pdf.split_ranges';
        params = { input_path: file.path, ranges: ranges.trim() || '1', output_dir: outputDir, overwrite: true };
      } else if (mode === 'every_n') {
        action = 'pdf.split_every_n';
        params = { input_path: file.path, pages_per_chunk: Number(everyN) || 1, output_dir: outputDir, overwrite: true };
      } else {
        action = 'pdf.split_individual';
        params = { input_path: file.path, output_dir: outputDir, overwrite: true };
      }

      const res = await api.invoke(action, params, (p) => setProgress(p));
      setResults(res.output_paths ?? []);
      setPhase('done');
    } catch (err) {
      setErrorMsg(err.message ?? 'Unknown error');
      setPhase('error');
    }
  }

  const canSplit = file && phase !== 'converting' &&
    (mode !== 'ranges' || ranges.trim().length > 0);

  return (
    <div className="split-screen">
      <div className="screen-title">{s.splitTitle}</div>
      <div className="screen-sub">{s.splitSub}</div>

      <div
        {...getRootProps()}
        className={`drop-zone${isDragActive ? ' drag-over' : ''}`}
        role="button"
        aria-label={s.splitDropTitle}
        onClick={openFilePicker}
        onKeyDown={e => e.key === 'Enter' && openFilePicker()}
        tabIndex={0}
      >
        <input {...getInputProps()} />
        <div className="drop-icon">↑</div>
        <div className="drop-title">{s.splitDropTitle}</div>
        <div className="drop-sub">{s.splitDropSub}</div>
      </div>

      {file && (
        <>
          <div className="banner info" style={{ marginTop: '0.75rem' }}>
            <span className="bicon">✔</span>
            <span>{file.name} — {s.splitDetected}</span>
            <button className="clear-btn" onClick={clearFile} aria-label="Clear file">✕</button>
          </div>

          {/* Split mode */}
          <div className="sec-label">{s.splitModeLabel}</div>
          <div className="split-mode-row" role="radiogroup" aria-label={s.splitModeLabel}>
            {[
              { id: 'ranges',     label: s.splitModeRanges },
              { id: 'every_n',   label: s.splitModeEveryN },
              { id: 'individual', label: s.splitModeIndividual },
            ].map(m => (
              <button
                key={m.id}
                className={`split-mode-btn${mode === m.id ? ' sel' : ''}`}
                onClick={() => setMode(m.id)}
                role="radio"
                aria-checked={mode === m.id}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Mode-specific options */}
          {mode === 'ranges' && (
            <>
              <div className="sec-label">{s.splitRangesLabel}</div>
              <input
                className="split-input"
                type="text"
                value={ranges}
                onChange={e => setRanges(e.target.value)}
                placeholder={s.splitRangesHint}
                spellCheck={false}
              />
            </>
          )}

          {mode === 'every_n' && (
            <div className="split-n-row">
              <span className="sec-label" style={{ margin: 0 }}>{s.splitEveryNLabel}</span>
              <input
                className="split-n-input"
                type="number"
                min={1}
                max={999}
                value={everyN}
                onChange={e => setEveryN(e.target.value)}
              />
            </div>
          )}

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
            onClick={runSplit}
            disabled={!canSplit}
          >
            {phase === 'converting' ? s.splitting : `⚡ ${s.splitBtn}`}
          </button>

          {phase === 'converting' && (
            <div className="prog-card">
              <div className="prog-file">
                <span className="prog-fn">{s.splitting}</span>
                <span className="prog-pct">{Math.round(progress * 100)}%</span>
              </div>
              <div className="prog-track">
                <div className="prog-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </div>
          )}

          {phase === 'done' && results.map((p, i) => (
            <div key={i} className="prog-card">
              <div className="done-row">
                <span style={{ color: 'var(--color-text-success)' }}>✔</span>
                <span className="done-label">{s.doneLabel(basename(p))}</span>
                <span className="done-reveal" onClick={() => window.electronAPI.showInFolder(p)}>
                  📂 {s.showInFolder}
                </span>
              </div>
            </div>
          ))}

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
