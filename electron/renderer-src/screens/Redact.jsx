import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import './Redact.css';

function basename(p) { return p.split(/[\\/]/).pop(); }

function mapUiPointToPdf(uiX, uiY, displayW, displayH, page) {
  const box = page.crop_box;
  const rotation = page.rotation % 360;
  const vW = page.visual_width_points;
  const vH = page.visual_height_points;
  const visX = (uiX / displayW) * vW;
  const visYTop = (uiY / displayH) * vH;
  let relX, relY;
  if (rotation === 0)        { relX = visX;               relY = box.height - visYTop; }
  else if (rotation === 90)  { relX = visYTop;            relY = visX; }
  else if (rotation === 180) { relX = box.width - visX;   relY = visYTop; }
  else                       { relX = box.width - visYTop; relY = box.height - visX; }
  return { x: box.left + relX, y: box.bottom + relY };
}

export default function Redact({ s, outputDir, onPickFolder }) {
  const [file, setFile]           = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [preview, setPreview]     = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError]     = useState('');
  const [displaySize, setDisplaySize]       = useState(null);
  const [dragStart, setDragStart]   = useState(null);
  const [dragCurrent, setDragCurrent] = useState(null);
  const [redactions, setRedactions] = useState([]);   // { page, pdfRect, uiNorm }
  const [phase, setPhase]   = useState('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const imgRef = useRef(null);

  const onDrop = useCallback((accepted) => {
    if (!accepted.length) return;
    const f = accepted[0];
    setFile(f);
    setPreview(null); setDisplaySize(null);
    setPageNumber(1); setPageCount(1);
    setRedactions([]); setDragStart(null); setDragCurrent(null);
    setPhase('idle'); setResult(null); setErrorMsg(''); setPreviewError('');
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
    setFile(null); setPreview(null); setDisplaySize(null);
    setPageNumber(1); setPageCount(1); setRedactions([]);
    setDragStart(null); setDragCurrent(null);
    setPhase('idle'); setResult(null); setErrorMsg(''); setPreviewError('');
  }

  async function loadPreview(pageNum) {
    if (!file) return;
    setLoadingPreview(true);
    setPreviewError('');
    setPreview(null); setDisplaySize(null);
    setDragStart(null); setDragCurrent(null);
    try {
      await window.electronAPI.ensureDir(outputDir);
      const tmpPath = `${outputDir}/_redact_preview_tmp.png`;
      const res = await window.electronAPI.invoke(
        'pdf.render_preview',
        { input_path: file.path, output_path: tmpPath, page_number: pageNum, preview_kind: 'sign', overwrite: true },
      );
      setPreview({ src: 'file://' + res.image.path, page: res.page });
      setPageCount(res.page.page_count);
    } catch (err) {
      setPreviewError(err.message ?? 'Could not render page preview.');
    } finally {
      setLoadingPreview(false);
    }
  }

  useEffect(() => {
    if (file) loadPreview(1);
  }, [file]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleImgLoad() {
    if (!imgRef.current) return;
    setDisplaySize({ w: imgRef.current.clientWidth, h: imgRef.current.clientHeight });
  }

  function getRelativePos(e) {
    if (!imgRef.current) return { x: 0, y: 0 };
    const rect = imgRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(e.clientX - rect.left, rect.width)),
      y: Math.max(0, Math.min(e.clientY - rect.top, rect.height)),
    };
  }

  function handleMouseDown(e) {
    if (!preview || !displaySize || e.button !== 0) return;
    e.preventDefault();
    const pos = getRelativePos(e);
    setDragStart(pos);
    setDragCurrent(pos);
  }

  function handleMouseMove(e) {
    if (!dragStart) return;
    e.preventDefault();
    setDragCurrent(getRelativePos(e));
  }

  function handleMouseUp() {
    if (!dragStart || !dragCurrent || !preview || !displaySize) {
      setDragStart(null); setDragCurrent(null);
      return;
    }

    const x1 = Math.min(dragStart.x, dragCurrent.x);
    const y1 = Math.min(dragStart.y, dragCurrent.y);
    const x2 = Math.max(dragStart.x, dragCurrent.x);
    const y2 = Math.max(dragStart.y, dragCurrent.y);

    if (x2 - x1 < 8 || y2 - y1 < 8) {
      setDragStart(null); setDragCurrent(null);
      return;
    }

    const p1 = mapUiPointToPdf(x1, y1, displaySize.w, displaySize.h, preview.page);
    const p2 = mapUiPointToPdf(x2, y2, displaySize.w, displaySize.h, preview.page);
    const pdfRect = {
      x: Math.min(p1.x, p2.x),
      y: Math.min(p1.y, p2.y),
      w: Math.abs(p2.x - p1.x),
      h: Math.abs(p1.y - p2.y),
    };
    const uiNorm = {
      x: x1 / displaySize.w,
      y: y1 / displaySize.h,
      w: (x2 - x1) / displaySize.w,
      h: (y2 - y1) / displaySize.h,
    };

    setRedactions(prev => [...prev, { page: pageNumber, pdfRect, uiNorm }]);
    setDragStart(null); setDragCurrent(null);
  }

  function removeRedaction(i) {
    setRedactions(prev => prev.filter((_, idx) => idx !== i));
  }

  const pageRedactions = redactions.filter(r => r.page === pageNumber);

  const dragRect = dragStart && dragCurrent ? {
    x: Math.min(dragStart.x, dragCurrent.x),
    y: Math.min(dragStart.y, dragCurrent.y),
    w: Math.abs(dragCurrent.x - dragStart.x),
    h: Math.abs(dragCurrent.y - dragStart.y),
  } : null;

  async function applyRedact() {
    if (!file || phase === 'applying') return;
    setPhase('applying'); setProgress(0); setResult(null); setErrorMsg('');
    try {
      await window.electronAPI.ensureDir(outputDir);
      const stem = basename(file.path ?? file.name).replace(/\.pdf$/i, '');
      const outputPath = `${outputDir}/${stem}_redacted.pdf`;
      const payload = redactions.map(r => ({
        page: r.page,
        x_pt: r.pdfRect.x,
        y_pt: r.pdfRect.y,
        width_pt: r.pdfRect.w,
        height_pt: r.pdfRect.h,
      }));
      const res = await window.electronAPI.invoke(
        'pdf.redact',
        { input_path: file.path, output_path: outputPath, redactions: payload, overwrite: true },
        (p) => setProgress(p),
      );
      setResult(res.output_paths?.[0] ?? outputPath);
      setPhase('done');
    } catch (err) {
      setErrorMsg(err.message ?? 'Unknown error');
      setPhase('error');
    }
  }

  const canApply = !!file && phase !== 'applying';

  return (
    <div className="redact-screen">
      <div className="screen-title">{s.redactTitle}</div>
      <div className="screen-sub">{s.redactSub}</div>

      <div className="banner danger redact-warn">
        <span className="bicon">⚠</span>
        <span>{s.redactWarning}</span>
      </div>

      {!file && (
        <div
          {...getRootProps()}
          className={`drop-zone${isDragActive ? ' drag-over' : ''}`}
          role="button"
          aria-label={s.redactDropTitle}
          onClick={openFilePicker}
          onKeyDown={e => e.key === 'Enter' && openFilePicker()}
          tabIndex={0}
        >
          <input {...getInputProps()} />
          <div className="drop-icon">↑</div>
          <div className="drop-title">{s.redactDropTitle}</div>
          <div className="drop-sub">{s.redactDropSub}</div>
        </div>
      )}

      {file && (
        <>
          <div className="banner info" style={{ marginTop: '0.75rem' }}>
            <span className="bicon">✔</span>
            <span>{file.name} — {s.redactDetected(pageCount)}</span>
            <button className="clear-btn" onClick={clearFile} aria-label="Clear file">✕</button>
          </div>

          <div className="sign-page-row">
            <div className="sec-label" style={{ margin: 0 }}>{s.redactPageLabel}</div>
            <input
              type="number"
              className="sign-page-input"
              min={1}
              max={pageCount}
              value={pageNumber}
              onChange={e => setPageNumber(Math.max(1, Math.min(pageCount, Number(e.target.value) || 1)))}
            />
            <span className="sign-page-of">/ {pageCount}</span>
            <button className="sign-load-btn" onClick={() => loadPreview(pageNumber)} disabled={loadingPreview}>
              {loadingPreview ? '…' : s.redactLoadPage}
            </button>
          </div>

          {previewError && (
            <div className="banner danger" style={{ marginBottom: '0.75rem' }}>
              <span className="bicon">⚠</span><span>{previewError}</span>
            </div>
          )}

          {preview && (
            <>
              <div className="sec-label" style={{ marginTop: '0.5rem' }}>{s.redactDragHint}</div>
              <div
                className="redact-preview-wrap"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => { if (dragStart) { setDragStart(null); setDragCurrent(null); } }}
              >
                <img
                  ref={imgRef}
                  src={preview.src}
                  alt="PDF page preview"
                  className="redact-preview-img"
                  onLoad={handleImgLoad}
                  draggable={false}
                />

                {displaySize && pageRedactions.map((r, i) => (
                  <div
                    key={i}
                    className="redact-box"
                    style={{
                      left:   r.uiNorm.x * displaySize.w,
                      top:    r.uiNorm.y * displaySize.h,
                      width:  r.uiNorm.w * displaySize.w,
                      height: r.uiNorm.h * displaySize.h,
                    }}
                  />
                ))}

                {dragRect && (
                  <div
                    className="redact-dragrect"
                    style={{ left: dragRect.x, top: dragRect.y, width: dragRect.w, height: dragRect.h }}
                  />
                )}
              </div>
            </>
          )}

          {/* Redaction list */}
          {redactions.length > 0 && (
            <>
              <div className="sec-label" style={{ marginTop: '0.75rem' }}>
                {s.redactAnnLabel(redactions.length)}
              </div>
              <div className="edit-ann-list">
                {redactions.map((r, i) => (
                  <div key={i} className="edit-ann-row">
                    <span className="redact-swatch" />
                    <span className="edit-ann-type">{s.redactBoxLabel}</span>
                    <span className="edit-ann-page">p.{r.page}</span>
                    <button className="fl-remove" onClick={() => removeRedaction(i)} aria-label={`Remove redaction ${i + 1}`}>✕</button>
                  </div>
                ))}
              </div>
            </>
          )}

          {redactions.length === 0 && preview && (
            <div className="edit-no-anns">{s.redactNoBoxes}</div>
          )}

          <div className="sec-label">{s.saveIn}</div>
          <div className="out-row">
            <span className="icon">📁</span>
            <span className="path">{outputDir}</span>
            <span className="change" onClick={onPickFolder} role="button" tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onPickFolder()}>{s.change}</span>
          </div>

          <button className="btn-primary redact-apply-btn" onClick={applyRedact} disabled={!canApply}>
            {phase === 'applying' ? s.redactApplying : s.redactApplyBtn}
          </button>

          {phase === 'applying' && (
            <div className="prog-card">
              <div className="prog-file">
                <span className="prog-fn">{s.redactApplying}</span>
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
                <span className="done-label">{s.redactDone(basename(result))}</span>
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
