import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import SignatureCanvas, { CANVAS_W, CANVAS_H } from '../components/SignatureCanvas.jsx';
import './Sign.css';

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

export default function Sign({ s, outputDir, onPickFolder }) {
  const [file, setFile]             = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount]   = useState(1);
  const [preview, setPreview]       = useState(null);   // { src, page }
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError]     = useState('');
  const [displaySize, setDisplaySize]       = useState(null); // { w, h }
  const [sigDataUrl, setSigDataUrl] = useState(null);
  const [placed, setPlaced]         = useState(null);   // { xPx, yPx } center in display coords
  const [sigWidthPt, setSigWidthPt] = useState(150);
  const [cleaning, setCleaning]     = useState(false);
  const [phase, setPhase]           = useState('idle');
  const [progress, setProgress]     = useState(0);
  const [result, setResult]         = useState(null);
  const [errorMsg, setErrorMsg]     = useState('');

  const imgRef = useRef(null);

  const onDrop = useCallback((accepted) => {
    if (!accepted.length) return;
    const f = accepted[0];
    setFile(f);
    setPreview(null);
    setDisplaySize(null);
    setPlaced(null);
    setPageNumber(1);
    setPageCount(1);
    setResult(null);
    setErrorMsg('');
    setPhase('idle');
    setPreviewError('');
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
    setFile(null); setPreview(null); setDisplaySize(null); setPlaced(null);
    setPageNumber(1); setPageCount(1); setResult(null); setErrorMsg('');
    setPhase('idle'); setPreviewError(''); setSigDataUrl(null);
  }

  async function loadPreview(pageNum) {
    if (!file) return;
    setLoadingPreview(true);
    setPreviewError('');
    setPreview(null);
    setDisplaySize(null);
    setPlaced(null);
    try {
      await window.electronAPI.ensureDir(outputDir);
      const tmpPath = `${outputDir}/_sign_preview_tmp.png`;
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

  function handlePreviewClick(e) {
    if (!sigDataUrl || !displaySize || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    setPlaced({ xPx: e.clientX - rect.left, yPx: e.clientY - rect.top });
  }

  async function cleanSig() {
    if (!sigDataUrl || cleaning) return;
    setCleaning(true);
    try {
      const res = await window.electronAPI.invoke('image.clean_signature', { signature_data_url: sigDataUrl });
      setSigDataUrl(res.cleaned_data_url);
      setPlaced(null);
    } catch {
      // keep the drawn sig
    } finally {
      setCleaning(false);
    }
  }

  async function applySig() {
    if (!file || !preview || !sigDataUrl || !placed || !displaySize || phase === 'applying') return;
    setPhase('applying');
    setProgress(0);
    setResult(null);
    setErrorMsg('');

    const center = mapUiPointToPdf(placed.xPx, placed.yPx, displaySize.w, displaySize.h, preview.page);
    const heightPt = sigWidthPt * (CANVAS_H / CANVAS_W);
    const x_pt = center.x - sigWidthPt / 2;
    const y_pt = center.y - heightPt / 2;

    try {
      await window.electronAPI.ensureDir(outputDir);
      const stem = basename(file.path ?? file.name).replace(/\.pdf$/i, '');
      const outputPath = `${outputDir}/${stem}_signed.pdf`;
      const res = await window.electronAPI.invoke(
        'pdf.apply_signature',
        {
          input_path: file.path,
          output_path: outputPath,
          page_number: preview.page.page_number,
          signature_data_url: sigDataUrl,
          x_pt,
          y_pt,
          width_pt: sigWidthPt,
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

  const sigDisplayW = (displaySize && preview)
    ? (sigWidthPt / preview.page.visual_width_points) * displaySize.w
    : 0;
  const sigDisplayH = sigDisplayW * (CANVAS_H / CANVAS_W);
  const canApply = !!(file && preview && sigDataUrl && placed && displaySize && phase !== 'applying');

  return (
    <div className="sign-screen">
      <div className="screen-title">{s.signTitle}</div>
      <div className="screen-sub">{s.signSub}</div>

      {!file && (
        <div
          {...getRootProps()}
          className={`drop-zone${isDragActive ? ' drag-over' : ''}`}
          role="button"
          aria-label={s.signDropTitle}
          onClick={openFilePicker}
          onKeyDown={e => e.key === 'Enter' && openFilePicker()}
          tabIndex={0}
        >
          <input {...getInputProps()} />
          <div className="drop-icon">↑</div>
          <div className="drop-title">{s.signDropTitle}</div>
          <div className="drop-sub">{s.signDropSub}</div>
        </div>
      )}

      {file && (
        <>
          <div className="banner info" style={{ marginTop: '0.75rem' }}>
            <span className="bicon">✔</span>
            <span>{file.name} — {s.signDetected(pageCount)}</span>
            <button className="clear-btn" onClick={clearFile} aria-label="Clear file">✕</button>
          </div>

          <div className="sign-page-row">
            <div className="sec-label" style={{ margin: 0 }}>{s.signPageLabel}</div>
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
              {loadingPreview ? '…' : s.signLoadPage}
            </button>
          </div>

          {previewError && (
            <div className="banner danger" style={{ marginBottom: '0.75rem' }}>
              <span className="bicon">⚠</span>
              <span>{previewError}</span>
            </div>
          )}

          <div className="sec-label">{s.signDrawLabel}</div>
          <SignatureCanvas
            s={s}
            onSig={(dataUrl) => { setSigDataUrl(dataUrl); setPlaced(null); }}
          />
          {sigDataUrl && (
            <button className="sign-clean-btn" onClick={cleanSig} disabled={cleaning}>
              {cleaning ? '…' : s.signCleanBtn}
            </button>
          )}

          {preview && (
            <>
              <div className="sec-label">{s.signPlaceLabel}</div>
              <div
                className="sign-preview-wrap"
                style={{ cursor: sigDataUrl ? 'crosshair' : 'default' }}
                onClick={handlePreviewClick}
              >
                <img
                  ref={imgRef}
                  src={preview.src}
                  alt="PDF page preview"
                  className="sign-preview-img"
                  onLoad={handleImgLoad}
                  draggable={false}
                />
                {placed && sigDataUrl && displaySize && (
                  <img
                    className="sig-overlay"
                    src={sigDataUrl}
                    alt="signature placement"
                    style={{
                      left: placed.xPx - sigDisplayW / 2,
                      top: placed.yPx - sigDisplayH / 2,
                      width: sigDisplayW,
                      height: sigDisplayH,
                    }}
                  />
                )}
              </div>

              <div className="sec-label">{s.signWidthLabel}</div>
              <div className="sign-slider-row">
                <input
                  type="range"
                  min={50}
                  max={300}
                  step={10}
                  value={sigWidthPt}
                  onChange={e => setSigWidthPt(Number(e.target.value))}
                  className="sign-slider"
                />
                <span className="sign-slider-val">{sigWidthPt} pt</span>
              </div>

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

              <button className="btn-primary" onClick={applySig} disabled={!canApply}>
                {phase === 'applying' ? s.signApplying : `✍ ${s.signApplyBtn}`}
              </button>

              {phase === 'applying' && (
                <div className="prog-card">
                  <div className="prog-file">
                    <span className="prog-fn">{s.signApplying}</span>
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
                    <span className="done-label">{s.signDone(basename(result))}</span>
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
