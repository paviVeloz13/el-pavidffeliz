import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import './Compress.css';

function basename(p) { return p.split(/[\\/]/).pop(); }
function ext(name) { return name.split('.').pop().toLowerCase(); }

function fileType(name) {
  const e = ext(name);
  if (e === 'pdf') return 'pdf';
  if (e === 'jpg' || e === 'jpeg') return 'jpeg';
  if (e === 'png') return 'png';
  return null;
}

const ACCEPTED = { 'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] };

export default function Compress({ s, outputDir, onPickFolder }) {
  const [files, setFiles]     = useState([]);
  const [quality, setQuality] = useState(75);
  const [phase, setPhase]     = useState('idle');
  const [results, setResults] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  const onDrop = useCallback((accepted) => {
    if (!accepted.length) return;
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.path));
      const fresh = accepted.filter(f => fileType(f.name) && !existing.has(f.path));
      return [...prev, ...fresh];
    });
    setPhase('idle');
    setResults([]);
    setErrorMsg('');
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    noClick: true,
    noKeyboard: true,
    multiple: true,
  });

  async function openFilePicker() {
    const paths = await window.electronAPI.pickFiles([
      { name: 'PDF / Image files', extensions: ['pdf', 'jpg', 'jpeg', 'png'] },
    ]);
    if (!paths.length) return;
    onDrop(paths.map(p => ({ path: p, name: basename(p) })));
  }

  function removeFile(i) {
    setFiles(prev => prev.filter((_, idx) => idx !== i));
  }

  function clearAll() {
    setFiles([]); setPhase('idle'); setResults([]); setErrorMsg('');
  }

  const hasJpeg = files.some(f => fileType(f.name) === 'jpeg');

  async function compress() {
    if (!files.length || phase === 'compressing') return;
    setPhase('compressing');
    setResults([]);
    setErrorMsg('');

    try {
      await window.electronAPI.ensureDir(outputDir);
      const api = window.electronAPI;
      const newResults = [];

      for (const f of files) {
        const type = fileType(f.name);
        const stem = basename(f.path ?? f.name).replace(/\.[^.]+$/, '');
        const suffix = type === 'pdf' ? 'pdf' : type === 'jpeg' ? 'jpg' : 'png';
        const outputPath = `${outputDir}/${stem}_compressed.${suffix}`;

        try {
          let res;
          if (type === 'pdf') {
            res = await api.invoke('pdf.compress', { input_path: f.path, output_path: outputPath, overwrite: true });
          } else {
            res = await api.invoke('image.compress', { input_path: f.path, output_path: outputPath, quality, overwrite: true });
          }
          newResults.push({
            name: f.name,
            status: 'ok',
            savedPct: res.saved_pct ?? 0,
            savedBytes: res.saved_bytes ?? 0,
            outputPath: res.output_paths?.[0] ?? outputPath,
          });
        } catch (err) {
          newResults.push({ name: f.name, status: 'error', error: err.message ?? 'Failed' });
        }
        setResults([...newResults]);
      }
      setPhase('done');
    } catch (err) {
      setErrorMsg(err.message ?? 'Unknown error');
      setPhase('error');
    }
  }

  const canCompress = files.length > 0 && phase !== 'compressing';

  return (
    <div className="compress-screen">
      <div className="screen-title">{s.compressTitle}</div>
      <div className="screen-sub">{s.compressSub}</div>

      <div
        {...getRootProps()}
        className={`drop-zone${isDragActive ? ' drag-over' : ''}`}
        role="button"
        aria-label={s.compressDropTitle}
        onClick={openFilePicker}
        onKeyDown={e => e.key === 'Enter' && openFilePicker()}
        tabIndex={0}
      >
        <input {...getInputProps()} />
        <div className="drop-icon">↑</div>
        <div className="drop-title">{s.compressDropTitle}</div>
        <div className="drop-sub">{s.compressDropSub}</div>
      </div>

      {files.length > 0 && (
        <>
          <div className="banner info" style={{ marginTop: '0.75rem' }}>
            <span className="bicon">✔</span>
            <span>{s.compressDetected(files.length)}</span>
            <button className="clear-btn" onClick={clearAll} aria-label="Clear all">✕</button>
          </div>

          {/* File list */}
          <div className="file-list" style={{ marginBottom: '0.75rem' }}>
            {files.map((f, i) => (
              <div key={f.path ?? f.name} className="file-row">
                <span className="fl-num">{i + 1}</span>
                <span className="fl-name" title={f.name}>{f.name}</span>
                <span className="fl-size" style={{ textTransform: 'uppercase', fontSize: '0.6875rem' }}>
                  {fileType(f.name)}
                </span>
                <button className="fl-remove" onClick={() => removeFile(i)} aria-label={`Remove ${f.name}`}>✕</button>
              </div>
            ))}
          </div>

          {/* JPEG quality slider (only when JPEG files present) */}
          {hasJpeg && (
            <>
              <div className="sec-label">{s.compressQualityLabel}</div>
              <div className="compress-quality-row">
                <input
                  type="range" min={30} max={95} step={5}
                  value={quality}
                  onChange={e => setQuality(Number(e.target.value))}
                  className="compress-slider"
                />
                <span className="compress-slider-val">{quality}%</span>
              </div>
            </>
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

          <button className="btn-primary" onClick={compress} disabled={!canCompress}>
            {phase === 'compressing' ? s.compressing : s.compressBtn}
          </button>

          {/* Per-file results */}
          {results.length > 0 && (
            <div className="compress-results">
              {results.map((r, i) => (
                <div key={i} className={`compress-result-row ${r.status === 'ok' ? (r.savedPct > 0 ? 'ok' : 'warn') : 'err'}`}>
                  <span className="compress-result-name" title={r.name}>{r.name}</span>
                  {r.status === 'ok' && r.savedPct > 0 && (
                    <>
                      <span className="compress-result-badge">−{r.savedPct}%</span>
                      {r.outputPath && (
                        <span className="compress-result-reveal"
                          onClick={() => window.electronAPI.showInFolder(r.outputPath)}>
                          📂
                        </span>
                      )}
                    </>
                  )}
                  {r.status === 'ok' && r.savedPct <= 0 && (
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-warning)' }}>no savings</span>
                  )}
                  {r.status === 'error' && (
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-danger)' }}>{r.error}</span>
                  )}
                </div>
              ))}
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
