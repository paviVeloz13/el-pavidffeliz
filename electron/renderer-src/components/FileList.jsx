import React, { useRef, useState } from 'react';
import './FileList.css';

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function FileList({ files, onReorder, onRemove }) {
  const dragSrc = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  function onDragStart(i) {
    dragSrc.current = i;
  }

  function onDragOver(e, i) {
    e.preventDefault();
    if (dragSrc.current !== null && dragSrc.current !== i) setDragOver(i);
  }

  function onDrop(e, i) {
    e.preventDefault();
    setDragOver(null);
    const src = dragSrc.current;
    if (src === null || src === i) return;
    const next = [...files];
    const [moved] = next.splice(src, 1);
    next.splice(i, 0, moved);
    dragSrc.current = null;
    onReorder(next);
  }

  function onDragEnd() {
    dragSrc.current = null;
    setDragOver(null);
  }

  return (
    <div className="file-list">
      {files.map((f, i) => (
        <div
          key={f.path ?? f.name}
          className={`file-row${dragOver === i ? ' drag-over' : ''}`}
          draggable
          onDragStart={() => onDragStart(i)}
          onDragOver={(e) => onDragOver(e, i)}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => onDrop(e, i)}
          onDragEnd={onDragEnd}
        >
          <span className="fl-handle" aria-hidden="true">⠿</span>
          <span className="fl-num">{i + 1}</span>
          <span className="fl-name" title={f.name}>{f.name}</span>
          {f.size ? <span className="fl-size">{fmtSize(f.size)}</span> : null}
          <button
            className="fl-remove"
            onClick={() => onRemove(i)}
            aria-label={`Remove ${f.name}`}
          >✕</button>
        </div>
      ))}
    </div>
  );
}
