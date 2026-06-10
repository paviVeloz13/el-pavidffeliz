import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import './Edit.css';

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

const TOOL_COLORS = {
  highlight:     [1.0, 1.0, 0.0],
  strikethrough: [1.0, 0.0, 0.0],
  text_box:      [0.0, 0.0, 0.0],
};

const TOOL_CSS_COLORS = {
  highlight:     'rgba(255,255,0,0.45)',
  strikethrough: 'rgba(255,0,0,0.8)',
  text_box:      'rgba(0,0,200,0.25)',
};

export default function Edit({ s, outputDir, onPickFolder }) {
  const [file, setFile]           = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [preview, setPreview]     = useState(null);   // { src, page }
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError]     = useState('');
  const [displaySize, setDisplaySize]       = useState(null);  // { w, h }
  const [activeTool, setActiveTool]         = useState('highlight');
  const [dragStart, setDragStart]   = useState(null);   // { x, y } px relative to img
  const [dragCurrent, setDragCurrent] = useState(null);
  const [pendingAnn, setPendingAnn] = useState(null);   // { uiNorm, pdfRect } waiting for text
  const [pendingText, setPendingText] = useState('');
  const [annotations, setAnnotations] = useState([]);   // finalized
  const [phase, setPhase]   = useState('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const imgRef     = useRef(null);
  const wrapRef    = useRef(null);
  const textInputRef = useRef(null);

  const onDrop = useCallback((accepted) => {
    if (!accepted.length) return;
    const f = accepted[0];
    setFile(f);
    setPreview(null); setDisplaySize(null);
    setPageNumber(1); setPageCount(1);
    setAnnotations([]); setDragStart(null); setDragCurrent(null);
    setPendingAnn(null); setPendingText('');
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
    setPageNumber(1); setPageCount(1); setAnnotations([]);
    setDragStart(null); setDragCurrent(null); setPendingAnn(null); setPendingText('');
    setPhase('idle'); setResult(null); setErrorMsg(''); setPreviewError('');
  }

  async function loadPreview(pageNum) {
    if (!file) return;
    setLoadingPreview(true);
    setPreviewError('');
    setPreview(null);
    setDisplaySize(null);
    setDragStart(null); setDragCurrent(null);
    setPendingAnn(null); setPendingText('');
    try {
      await window.electronAPI.ensureDir(outputDir);
      const tmpPath = `${outputDir}/_edit_preview_tmp.png`;
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
    if (pendingAnn) return;   // wait for text box confirmation first
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

  function handleMouseUp(e) {
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

    setDragStart(null); setDragCurrent(null);

    if (activeTool === 'text_box') {
      setPendingAnn({ uiNorm, pdfRect });
      setPendingText('');
      setTimeout(() => textInputRef.current?.focus(), 50);
    } else {
      addAnnotation(uiNorm, pdfRect, activeTool, '');
    }
  }

  function addAnnotation(uiNorm, pdfRect, type, text) {
    setAnnotations(prev => [...prev, {
      type,
      page: pageNumber,
      pdfRect,
      uiNorm,
      text,
      color: TOOL_COLORS[type],
    }]);
  }

  function confirmPending() {
    if (!pendingAnn) return;
    addAnnotation(pendingAnn.uiNorm, pendingAnn.pdfRect, 'text_box', pendingText.trim());
    setPendingAnn(null); setPendingText('');
  }

  function cancelPending() {
    setPendingAnn(null); setPendingText('');
  }

  function removeAnnotation(i) {
    setAnnotations(prev => prev.filter((_, idx) => idx !== i));
  }

  const pageAnns = annotations.filter(a => a.page === pageNumber);

  async function applyAnnotations() {
    if (!file || !annotations.length || phase === 'applying') return;
    setPhase('applying'); setProgress(0); setResult(null); setErrorMsg('');
    try {
      await window.electronAPI.ensureDir(outputDir);
      const stem = basename(file.path ?? file.name).replace(/\.pdf$/i, '');
      const outputPath = `${outputDir}/${stem}_annotated.pdf`;
      const payload = annotations.map(a => ({
        type: a.type,
        page: a.page,
        x_pt: a.pdfRect.x,
        y_pt: a.pdfRect.y,
        width_pt: a.pdfRect.w,
        height_pt: a.pdfRect.h,
        color: a.color,
        ...(a.type === 'text_box' ? { text: a.text } : {}),
      }));
      const res = await window.electronAPI.invoke(
        'pdf.apply_annotations',
        { input_path: file.path, output_path: outputPath, annotations: payload, overwrite: true },
        (p) => setProgress(p),
      );
      setResult(res.output_paths?.[0] ?? outputPath);
      setPhase('done');
    } catch (err) {
      setErrorMsg(err.message ?? 'Unknown error');
      setPhase('error');
    }
  }

  const canApply = file && annotations.length > 0 && phase !== 'applying';

  const dragRect = dragStart && dragCurrent ? {
    x: Math.min(dragStart.x, dragCurrent.x),
    y: Math.min(dragStart.y, dragCurrent.y),
    w: Math.abs(dragCurrent.x - dragStart.x),
    h: Math.abs(dragCurrent.y - dragStart.y),
  } : null;

  return (
    <div className="edit-screen">
      <div className="screen-title">{s.editTitle}</div>
      <div className="screen-sub">{s.editSub}</div>

      {!file && (
        <div
          {...getRootProps()}
          className={`drop-zone${isDragActive ? ' drag-over' : ''}`}
          role="button"
          aria-label={s.editDropTitle}
          onClick={openFilePicker}
          onKeyDown={e => e.key === 'Enter' && openFilePicker()}
          tabIndex={0}
        >
          <input {...getInputProps()} />
          <div className="drop-icon">↑</div>
          <div className="drop-title">{s.editDropTitle}</div>
          <div className="drop-sub">{s.editDropSub}</div>
        </div>
      )}

      {file && (
        <>
          <div className="banner info" style={{ marginTop: '0.75rem' }}>
            <span className="bicon">✔</span>
            <span>{file.name} — {s.editDetected(pageCount)}</span>
            <button className="clear-btn" onClick={clearFile} aria-label="Clear file">✕</button>
          </div>

          <div className="sign-page-row">
            <div className="sec-label" style={{ margin: 0 }}>{s.editPageLabel}</div>
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
              {loadingPreview ? '…' : s.editLoadPage}
            </button>
          </div>

          {previewError && (
            <div className="banner danger" style={{ marginBottom: '0.75rem' }}>
              <span className="bicon">⚠</span><span>{previewError}</span>
            </div>
          )}

          {/* Tool palette */}
          <div className="sec-label">{s.editToolLabel}</div>
          <div className="edit-tools">
            {['highlight', 'strikethrough', 'text_box'].map(tool => (
              <button
                key={tool}
                className={`edit-tool-btn${activeTool === tool ? ' active' : ''}`}
                onClick={() => { setActiveTool(tool); cancelPending(); }}
              >
                <span
                  className="edit-tool-swatch"
                  style={{ background: TOOL_CSS_COLORS[tool], borderColor: TOOL_CSS_COLORS[tool] }}
                />
                {s[`editTool${tool.charAt(0).toUpperCase() + tool.slice(1).replace('_b', 'B')}`]}
              </button>
            ))}
          </div>

          {preview && (
            <>
              <div className="sec-label" style={{ marginTop: '0.75rem' }}>{s.editDragHint}</div>
              <div
                ref={wrapRef}
                className="edit-preview-wrap"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => { if (dragStart) { setDragStart(null); setDragCurrent(null); } }}
                style={{ cursor: pendingAnn ? 'default' : 'crosshair' }}
              >
                <img
                  ref={imgRef}
                  src={preview.src}
                  alt="PDF page preview"
                  className="edit-preview-img"
                  onLoad={handleImgLoad}
                  draggable={false}
                />

                {/* Existing annotations for this page */}
                {displaySize && pageAnns.map((ann, i) => (
                  <div
                    key={i}
                    className={`edit-overlay edit-overlay-${ann.type}`}
                    style={{
                      left:   ann.uiNorm.x * displaySize.w,
                      top:    ann.uiNorm.y * displaySize.h,
                      width:  ann.uiNorm.w * displaySize.w,
                      height: ann.uiNorm.h * displaySize.h,
                    }}
                  >
                    {ann.type === 'strikethrough' && (
                      <div className="edit-strike-line" />
                    )}
                    {ann.type === 'text_box' && ann.text && (
                      <span className="edit-textbox-preview">{ann.text}</span>
                    )}
                  </div>
                ))}

                {/* Pending annotation being drawn */}
                {displaySize && pendingAnn && (
                  <div
                    className={`edit-overlay edit-overlay-${activeTool}`}
                    style={{
                      left:   pendingAnn.uiNorm.x * displaySize.w,
                      top:    pendingAnn.uiNorm.y * displaySize.h,
                      width:  pendingAnn.uiNorm.w * displaySize.w,
                      height: pendingAnn.uiNorm.h * displaySize.h,
                    }}
                  />
                )}

                {/* Live drag rect */}
                {dragRect && (
                  <div
                    className={`edit-dragrect edit-overlay-${activeTool}`}
                    style={{ left: dragRect.x, top: dragRect.y, width: dragRect.w, height: dragRect.h }}
                  />
                )}
              </div>

              {/* Text input for text_box */}
              {pendingAnn && activeTool === 'text_box' && (
                <div className="edit-textinput-row">
                  <input
                    ref={textInputRef}
                    className="edit-textinput"
                    placeholder={s.editPendingTextHint}
                    value={pendingText}
                    onChange={e => setPendingText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') confirmPending(); if (e.key === 'Escape') cancelPending(); }}
                  />
                  <button className="edit-confirm-btn" onClick={confirmPending} disabled={!pendingText.trim()}>
                    {s.editConfirmBtn}
                  </button>
                  <button className="edit-cancel-btn" onClick={cancelPending}>{s.editCancelBtn}</button>
                </div>
              )}
            </>
          )}

          {/* Annotation list */}
          {annotations.length > 0 && (
            <>
              <div className="sec-label" style={{ marginTop: '0.75rem' }}>
                {s.editAnnLabel(annotations.length)}
              </div>
              <div className="edit-ann-list">
                {annotations.map((ann, i) => (
                  <div key={i} className="edit-ann-row">
                    <span
                      className="edit-ann-swatch"
                      style={{ background: `rgb(${ann.color.map(c => Math.round(c * 255)).join(',')})` }}
                    />
                    <span className="edit-ann-type">
                      {s[`editTool${ann.type.charAt(0).toUpperCase() + ann.type.slice(1).replace('_b', 'B')}`]}
                    </span>
                    <span className="edit-ann-page">p.{ann.page}</span>
                    {ann.type === 'text_box' && (
                      <span className="edit-ann-text" title={ann.text}>{ann.text}</span>
                    )}
                    <button
                      className="fl-remove"
                      onClick={() => removeAnnotation(i)}
                      aria-label={`Remove annotation ${i + 1}`}
                    >✕</button>
                  </div>
                ))}
              </div>
            </>
          )}

          {annotations.length === 0 && preview && (
            <div className="edit-no-anns">{s.editNoAnns}</div>
          )}

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
            >{s.change}</span>
          </div>

          <button className="btn-primary" onClick={applyAnnotations} disabled={!canApply}>
            {phase === 'applying' ? s.editApplying : s.editApplyBtn}
          </button>

          {phase === 'applying' && (
            <div className="prog-card">
              <div className="prog-file">
                <span className="prog-fn">{s.editApplying}</span>
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
                <span className="done-label">{s.editDone(basename(result))}</span>
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
