import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import './Convert.css';

// ─── helpers ──────────────────────────────────────────────────────────────────

function ext(file) { return file.name.split('.').pop().toLowerCase(); }

function detectGroup(files) {
  if (!files.length) return null;
  const exts = new Set(files.map(ext));
  if ([...exts].every(e => e === 'pdf'))  return 'pdf';
  if ([...exts].every(e => e === 'jpg' || e === 'jpeg')) return 'jpeg';
  if ([...exts].every(e => e === 'png'))  return 'png';
  if ([...exts].every(e => ['jpg','jpeg','png'].includes(e))) return 'images';
  return 'mixed';
}

// Which tool buttons are relevant per detected group
const TOOLS_FOR_GROUP = {
  jpeg:   ['jpeg_to_png', 'images_to_pdf'],
  png:    ['png_to_jpeg', 'images_to_pdf'],
  images: ['images_to_pdf'],
  pdf:    ['pdf_to_png', 'pdf_to_jpeg'],
  mixed:  ['jpeg_to_png', 'png_to_jpeg', 'images_to_pdf', 'pdf_to_png', 'pdf_to_jpeg'],
};

// Which tools produce multiple files (i.e. show join/separate toggle)
const MULTI_OUTPUT_TOOLS = new Set(['jpeg_to_png', 'png_to_jpeg', 'pdf_to_png', 'pdf_to_jpeg']);

function basename(filePath) {
  return filePath.split(/[\\/]/).pop();
}

function humanType(group) {
  return { jpeg: 'JPEG', png: 'PNG', images: 'image', pdf: 'PDF', mixed: '' }[group] ?? '';
}

// ─── component ────────────────────────────────────────────────────────────────

export default function Convert({ s, outputDir, onPickFolder }) {
  const [files, setFiles]         = useState([]);    // File objects
  const [tool, setTool]           = useState(null);  // selected tool id
  const [joinOutput, setJoin]     = useState(false); // join/separate toggle
  const [dpi, setDpi]             = useState(150);   // for pdf renders
  const [phase, setPhase]         = useState('idle');// idle|converting|done|error
  const [progress, setProgress]   = useState(0);
  const [progressMsg, setProgMsg] = useState('');
  const [results, setResults]     = useState([]);   // output_paths
  const [errorMsg, setErrorMsg]   = useState('');

  const group = detectGroup(files);
  const availableTools = group ? TOOLS_FOR_GROUP[group] : [];
  const showToggle = tool && MULTI_OUTPUT_TOOLS.has(tool) && files.length > 1;

  // Reset tool if it's not valid for the new group
  useEffect(() => {
    if (tool && !availableTools.includes(tool)) setTool(null);
  }, [group]);

  const onDrop = useCallback((accepted) => {
    if (!accepted.length) return;
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.path));
      const fresh = accepted.filter(f => !existing.has(f.path));
      return [...prev, ...fresh].slice(0, 50);
    });
    setPhase('idle');
    setResults([]);
    setErrorMsg('');
  }, []);

  // Drag-and-drop only — clicks use the Electron dialog (more reliable in sandbox mode).
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] },
    noClick: true,
    noKeyboard: true,
  });

  async function openFilePicker() {
    const paths = await window.electronAPI.pickFiles();
    if (!paths.length) return;
    // Construct minimal File-like objects with path and name.
    const fileObjs = paths.map(p => ({ path: p, name: p.split('/').pop() }));
    onDrop(fileObjs);
  }

  function clearFiles() {
    setFiles([]);
    setTool(null);
    setPhase('idle');
    setResults([]);
    setErrorMsg('');
  }

  async function runConvert() {
    if (!tool || !files.length || phase === 'converting') return;

    setPhase('converting');
    setProgress(0);
    setProgMsg('');
    setResults([]);
    setErrorMsg('');

    const api = window.electronAPI;

    // Ensure the output directory exists before writing any files.
    try { await api.ensureDir(outputDir); } catch (_) {}


    try {
      const outPaths = [];

      if (tool === 'images_to_pdf') {
        // Single job — all images → one PDF
        const outputPath = `${outputDir}/converted.pdf`;
        const result = await api.invoke(
          'image.images_to_pdf',
          { input_paths: files.map(f => f.path), output_path: outputPath, overwrite: true },
          (p, msg) => { setProgress(p); setProgMsg(msg ?? ''); },
        );
        outPaths.push(...(result.output_paths ?? [outputPath]));

      } else if (tool === 'jpeg_to_png' || tool === 'png_to_jpeg') {
        const action = tool === 'jpeg_to_png' ? 'image.jpeg_to_png' : 'image.png_to_jpeg';
        const suffix = tool === 'jpeg_to_png' ? '.png' : '.jpg';

        if (joinOutput) {
          // Join: images → PDF via separate step
          const pngPaths = [];
          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const outPath = `${outputDir}/${f.name.replace(/\.[^.]+$/, suffix)}`;
            const res = await api.invoke(
              action,
              { input_path: f.path, output_path: outPath, overwrite: true },
              (p, msg) => { setProgress((i + p) / files.length); setProgMsg(msg ?? ''); },
            );
            pngPaths.push(res.output_paths?.[0] ?? outPath);
          }
          // Combine into PDF
          const pdfPath = `${outputDir}/converted.pdf`;
          const pdfRes = await api.invoke(
            'image.images_to_pdf',
            { input_paths: pngPaths, output_path: pdfPath, overwrite: true },
            (p, msg) => { setProgress(p); setProgMsg(msg ?? ''); },
          );
          outPaths.push(...(pdfRes.output_paths ?? [pdfPath]));
        } else {
          // Separate files
          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const outPath = `${outputDir}/${f.name.replace(/\.[^.]+$/, suffix)}`;
            const res = await api.invoke(
              action,
              { input_path: f.path, output_path: outPath, overwrite: true },
              (p, msg) => { setProgress((i + p) / files.length); setProgMsg(msg ?? ''); },
            );
            outPaths.push(res.output_paths?.[0] ?? outPath);
          }
        }

      } else if (tool === 'pdf_to_png' || tool === 'pdf_to_jpeg') {
        const action = tool === 'pdf_to_png' ? 'pdf.to_png' : 'pdf.to_jpeg';
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          const params = { input_path: f.path, dpi, overwrite: true };
          if (joinOutput) {
            params.join = true;
            params.output_path = `${outputDir}/${f.name.replace(/\.pdf$/i, tool === 'pdf_to_png' ? '.png' : '.jpg')}`;
          } else {
            params.output_dir = outputDir;
          }
          const res = await api.invoke(
            action, params,
            (p, msg) => { setProgress((i + p) / files.length); setProgMsg(msg ?? ''); },
          );
          outPaths.push(...(res.output_paths ?? []));
        }
      }

      setResults(outPaths);
      setPhase('done');
    } catch (err) {
      setErrorMsg(err.message ?? 'Unknown error');
      setPhase('error');
    }
  }

  function showInFolder(filePath) {
    window.electronAPI.showInFolder(filePath);
  }

  const toolDefs = [
    { id: 'jpeg_to_png',   label: s.toolJpegToPng },
    { id: 'png_to_jpeg',   label: s.toolPngToJpeg },
    { id: 'images_to_pdf', label: s.toolImagesToPdf },
    { id: 'pdf_to_png',    label: s.toolPdfToPng },
    { id: 'pdf_to_jpeg',   label: s.toolPdfToJpeg },
  ].filter(t => !group || availableTools.includes(t.id));

  const canConvert = tool && files.length > 0 && phase !== 'converting';

  return (
    <div className="convert-screen">
      <div className="screen-title">{s.convertTitle}</div>
      <div className="screen-sub">{s.convertSub}</div>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`drop-zone${isDragActive ? ' drag-over' : ''}`}
        role="button"
        aria-label={s.dropTitle}
        onClick={openFilePicker}
        onKeyDown={e => e.key === 'Enter' && openFilePicker()}
        tabIndex={0}
      >
        <input {...getInputProps()} />
        <div className="drop-icon">↑</div>
        <div className="drop-title">{s.dropTitle}</div>
        <div className="drop-sub">{s.dropSub}</div>
        <div className="detect-badge">⚙ {s.dropDetect}</div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <>
          <div className={`banner info`} style={{ marginTop: '0.75rem' }}>
            <span className="bicon">✔</span>
            <span>{s.detectedBanner(files.length, humanType(group))}</span>
            <button className="clear-btn" onClick={clearFiles} aria-label="Clear files">✕</button>
          </div>

          {/* Tool grid */}
          <div className="sec-label">{s.convertTo}</div>
          <div className="tool-grid" role="radiogroup" aria-label={s.convertTo}>
            {toolDefs.map(t => (
              <button
                key={t.id}
                className={`tool-btn${tool === t.id ? ' sel' : ''}`}
                onClick={() => setTool(t.id)}
                role="radio"
                aria-checked={tool === t.id}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* DPI selector for PDF→image */}
          {tool && (tool === 'pdf_to_png' || tool === 'pdf_to_jpeg') && (
            <div className="dpi-row">
              <span className="dpi-label">{s.dpi}</span>
              {[72, 96, 150, 300].map(d => (
                <button
                  key={d}
                  className={`dpi-btn${dpi === d ? ' sel' : ''}`}
                  onClick={() => setDpi(d)}
                  aria-pressed={dpi === d}
                >{d}</button>
              ))}
            </div>
          )}

          {/* Join/Separate toggle */}
          {showToggle && (
            <>
              <div className="sec-label">{s.outputMode}</div>
              <div className="output-toggle" role="group">
                <button
                  className={`ot-btn${!joinOutput ? ' sel' : ''}`}
                  onClick={() => setJoin(false)}
                  aria-pressed={!joinOutput}
                >
                  📄 {s.sepFiles}
                </button>
                <button
                  className={`ot-btn${joinOutput ? ' sel' : ''}`}
                  onClick={() => setJoin(true)}
                  aria-pressed={joinOutput}
                >
                  📋 {s.joinFile}
                </button>
              </div>
            </>
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

          {/* Convert button */}
          <button
            className="btn-primary"
            onClick={runConvert}
            disabled={!canConvert}
          >
            {phase === 'converting' ? s.converting : `⚡ ${s.convertBtn}`}
          </button>

          {/* Progress */}
          {phase === 'converting' && (
            <div className="prog-card">
              <div className="prog-file">
                <span className="prog-fn">{progressMsg || s.converting}</span>
                <span className="prog-pct">{Math.round(progress * 100)}%</span>
              </div>
              <div className="prog-track">
                <div className="prog-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </div>
          )}

          {/* Results */}
          {phase === 'done' && results.map((p, i) => (
            <div key={i} className="prog-card">
              <div className="done-row">
                <span style={{ color: 'var(--color-text-success)' }}>✔</span>
                <span className="done-label">{s.doneLabel(basename(p))}</span>
                <span className="done-reveal" onClick={() => showInFolder(p)}>
                  📂 {s.showInFolder}
                </span>
              </div>
            </div>
          ))}

          {/* Error */}
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
