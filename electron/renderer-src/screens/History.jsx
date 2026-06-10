import React, { useState, useEffect } from 'react';
import './History.css';

function basename(p) { return p.split(/[\\/]/).pop(); }

function relativeTime(iso, s) {
  const ms = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 90) return s.historyJustNow;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return s.historyMinAgo(mins);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return s.historyHrAgo(hours);
  if (hours < 48) return s.historyYesterday;
  const days = Math.floor(hours / 24);
  if (days < 14) return s.historyDaysAgo(days);
  return new Date(iso).toLocaleDateString();
}

function actionLabel(action, s) {
  const map = {
    'pdf.to_jpeg':           s.toolPdfToJpeg,
    'pdf.to_png':            s.toolPdfToPng,
    'pdf.merge':             s.navMerge,
    'pdf.split_ranges':      s.navSplit,
    'pdf.split_every_n':     s.navSplit,
    'pdf.split_individual':  s.navSplit,
    'pdf.reorder':           s.navOrganize,
    'pdf.delete_pages':      s.navOrganize,
    'pdf.organize_pages':    s.navOrganize,
    'pdf.compress':          s.navCompress,
    'pdf.lock':              s.navLock,
    'pdf.unlock':            s.navUnlock,
    'pdf.apply_signature':   s.navSign,
    'pdf.apply_annotations': s.navEdit,
    'pdf.redact':            s.navRedact,
    'pdf.flatten_to_image_pdf': s.navRedact,
    'image.jpeg_to_png':     s.toolJpegToPng,
    'image.png_to_jpeg':     s.toolPngToJpeg,
    'image.images_to_pdf':   s.toolImagesToPdf,
    'image.compress':        s.navCompress,
  };
  return map[action] ?? action;
}

export default function History({ s }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const all = await window.electronAPI.historyRead();
      setEntries([...all].reverse());
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function clearAll() {
    await window.electronAPI.historyClear();
    setEntries([]);
  }

  return (
    <div className="history-screen">
      <div className="screen-title">{s.historyTitle}</div>
      <div className="screen-sub">{s.historySub}</div>

      {!loading && entries.length > 0 && (
        <button className="history-clear-btn" onClick={clearAll}>
          {s.historyClearBtn}
        </button>
      )}

      {loading && <div className="history-loading">…</div>}

      {!loading && entries.length === 0 && (
        <div className="history-empty">{s.historyEmpty}</div>
      )}

      {!loading && entries.length > 0 && (
        <div className="history-list">
          {entries.map(entry => (
            <div key={entry.id} className="history-row">
              <div className="history-row-header">
                <span className="history-action">{actionLabel(entry.action, s)}</span>
                <span
                  className="history-time"
                  title={new Date(entry.timestamp).toLocaleString()}
                >
                  {relativeTime(entry.timestamp, s)}
                </span>
              </div>
              <div className="history-outputs">
                {(entry.output_paths ?? []).map((p, i) => (
                  <div key={i} className="history-output-row">
                    <span className="history-filename" title={p}>{basename(p)}</span>
                    <span
                      className="history-reveal"
                      role="button"
                      tabIndex={0}
                      onClick={() => window.electronAPI.showInFolder(p)}
                      onKeyDown={e => e.key === 'Enter' && window.electronAPI.showInFolder(p)}
                    >
                      📂 {s.showInFolder}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
