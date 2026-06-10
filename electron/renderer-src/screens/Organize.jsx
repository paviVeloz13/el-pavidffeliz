import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import './Organize.css';

function basename(p) { return p.split(/[\\/]/).pop(); }
function pad3(n) { return String(n).padStart(3, '0'); }

export default function Organize({ s, outputDir, onPickFolder }) {
  const [file, setFile]               = useState(null);
  const [pages, setPages]             = useState([]);   // { id, origNum, src, loaded }
  const [loadingThumbs, setLoadingThumbs] = useState(false);
  const [loadError, setLoadError]     = useState('');
  const [phase, setPhase]             = useState('idle');
  const [progress, setProgress]       = useState(0);
  const [result, setResult]           = useState(null);
  const [errorMsg, setErrorMsg]       = useState('');

  const dragSrc = useRef(null);
  const [dragOver, setDragOver]       = useState(null);

  const onDrop = useCallback((accepted) => {
    if (!accepted.length) return;
    setFile(accepted[0]);
    setPages([]);
    setLoadError('');
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
    const paths = await window.electronAPI.pickFiles([{ name: 'PDF files', extensions: ['pdf'] }]);
    if (!paths.length) return;
    onDrop([{ path: paths[0], name: basename(paths[0]) }]);
  }

  function clearFile() {
    setFile(null); setPages([]); setLoadError('');
    setPhase('idle'); setResult(null); setErrorMsg('');
  }

  useEffect(() => {
    if (!file) return;
    let cancelled = false;

    async function load() {
      setLoadingThumbs(true);
      setLoadError('');
      try {
        await window.electronAPI.ensureDir(outputDir);
        const api = window.electronAPI;
        const res1 = await api.invoke('pdf.render_preview', {
          input_path: file.path,
          output_path: `${outputDir}/_org_p001_tmp.png`,
          page_number: 1,
          preview_kind: 'organize',
          overwrite: true,
        });
        if (cancelled) return;
        const total = res1.page.page_count;
        const initial = Array.from({ length: total }, (_, i) => ({
          id: `p${i + 1}`,
          origNum: i + 1,
          src: i === 0 ? 'file://' + res1.image.path : null,
          loaded: i === 0,
        }));
        setPages(initial);

        if (total > 1) {
          const remaining = Array.from({ length: total - 1 }, (_, i) => i + 2);
          await Promise.all(remaining.map(pageNum =>
            api.invoke('pdf.render_preview', {
              input_path: file.path,
              output_path: `${outputDir}/_org_p${pad3(pageNum)}_tmp.png`,
              page_number: pageNum,
              preview_kind: 'organize',
              overwrite: true,
            }).then(res => {
              if (cancelled) return;
              setPages(prev => prev.map(p =>
                p.origNum === pageNum ? { ...p, src: 'file://' + res.image.path, loaded: true } : p
              ));
            }).catch(() => {
              if (cancelled) return;
              setPages(prev => prev.map(p =>
                p.origNum === pageNum ? { ...p, loaded: true } : p
              ));
            })
          ));
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message ?? 'Failed to load page previews.');
      } finally {
        if (!cancelled) setLoadingThumbs(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [file]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- drag-to-reorder (native DnD) ---
  function onDragStart(i) { dragSrc.current = i; }

  function onDragOver(e, i) {
    e.preventDefault();
    if (dragSrc.current !== null && dragSrc.current !== i) setDragOver(i);
  }

  function onDropRow(e, i) {
    e.preventDefault();
    setDragOver(null);
    const src = dragSrc.current;
    if (src === null || src === i) return;
    const next = [...pages];
    const [moved] = next.splice(src, 1);
    next.splice(i, 0, moved);
    dragSrc.current = null;
    setPages(next);
  }

  function onDragEnd() { dragSrc.current = null; setDragOver(null); }

  function removePage(i) {
    if (pages.length <= 1) return; // must keep at least one page
    setPages(prev => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (!file || pages.length === 0 || phase === 'saving') return;
    setPhase('saving');
    setProgress(0);
    setResult(null);
    setErrorMsg('');
    try {
      await window.electronAPI.ensureDir(outputDir);
      const stem = basename(file.path ?? file.name).replace(/\.pdf$/i, '');
      const outputPath = `${outputDir}/${stem}_organized.pdf`;
      const res = await window.electronAPI.invoke(
        'pdf.organize_pages',
        {
          input_path: file.path,
          output_path: outputPath,
          page_order: pages.map(p => p.origNum),
          overwrite: true,
        },
        (p) => setProgress(p),
      );
      setResult(res.output_paths?.[0] ?? outputPath);
      setPhase('done');
    } catch (err) {
      setErrorMsg(err.message ?? 'Unknown error');
      setPhase('error');
    }
  }

  const totalPages = pages.length > 0 ? pages[0] && pages.find(() => true) : null;
  const origPageCount = file && pages.length > 0
    ? Math.max(...pages.map(p => p.origNum), pages.length)
    : 0;
  const canSave = pages.length > 0 && !loadingThumbs && phase !== 'saving';

  return (
    <div className="organize-screen">
      <div className="screen-title">{s.organizeTitle}</div>
      <div className="screen-sub">{s.organizeSub}</div>

      {!file && (
        <div
          {...getRootProps()}
          className={`drop-zone${isDragActive ? ' drag-over' : ''}`}
          role="button"
          aria-label={s.organizeDropTitle}
          onClick={openFilePicker}
          onKeyDown={e => e.key === 'Enter' && openFilePicker()}
          tabIndex={0}
        >
          <input {...getInputProps()} />
          <div className="drop-icon">↑</div>
          <div className="drop-title">{s.organizeDropTitle}</div>
          <div className="drop-sub">{s.organizeDropSub}</div>
        </div>
      )}

      {file && (
        <>
          <div className="banner info" style={{ marginTop: '0.75rem' }}>
            <span className="bicon">✔</span>
            <span>
              {file.name}
              {pages.length > 0 && ` — ${s.organizeDetected(pages.length)}`}
            </span>
            <button className="clear-btn" onClick={clearFile} aria-label="Clear file">✕</button>
          </div>

          {loadError && (
            <div className="banner danger" style={{ marginBottom: '0.75rem' }}>
              <span className="bicon">⚠</span>
              <span>{loadError}</span>
            </div>
          )}

          {loadingThumbs && pages.length === 0 && (
            <div className="org-loading">{s.organizeLoading}</div>
          )}

          {pages.length > 0 && (
            <div className="org-list">
              {pages.map((page, i) => (
                <div
                  key={page.id}
                  className={`org-row${dragOver === i ? ' drag-over' : ''}`}
                  draggable
                  onDragStart={() => onDragStart(i)}
                  onDragOver={(e) => onDragOver(e, i)}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => onDropRow(e, i)}
                  onDragEnd={onDragEnd}
                >
                  <span className="org-handle" aria-hidden="true">⠿</span>

                  {page.src ? (
                    <div className="org-thumb-wrap">
                      <img
                        className="org-thumb"
                        src={page.src}
                        alt={s.organizePageLabel(page.origNum)}
                        draggable={false}
                      />
                    </div>
                  ) : (
                    <div className="org-thumb-placeholder">
                      <div className="org-thumb-spinner" />
                    </div>
                  )}

                  <span className="org-page-label">{s.organizePageLabel(page.origNum)}</span>

                  <button
                    className="org-remove"
                    onClick={() => removePage(i)}
                    disabled={pages.length <= 1}
                    aria-label={`Remove ${s.organizePageLabel(page.origNum)}`}
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          {pages.length > 0 && (
            <>
              <div className="sec-label">{s.saveIn}</div>
              <div className="out-row">
                <span className="icon">📁</span>
                <span className="path">{outputDir}</span>
                <span
                  className="change"
                  onClick={onPickFolder}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && onPickFolder()}
                >
                  {s.change}
                </span>
              </div>

              <button className="btn-primary" onClick={save} disabled={!canSave}>
                {phase === 'saving' ? s.organizeSaving : s.organizeSaveBtn}
              </button>

              {phase === 'saving' && (
                <div className="prog-card">
                  <div className="prog-file">
                    <span className="prog-fn">{s.organizeSaving}</span>
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
                    <span className="done-label">{s.organizeDone(basename(result))}</span>
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
        </>
      )}
    </div>
  );
}
