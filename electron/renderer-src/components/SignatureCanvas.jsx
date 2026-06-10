import React, { useRef } from 'react';
import './SignatureCanvas.css';

const CANVAS_W = 400;
const CANVAS_H = 150;

export { CANVAS_W, CANVAS_H };

export default function SignatureCanvas({ onSig, s }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  function getPos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if (e.touches) {
      const t = e.touches[0];
      return [(t.clientX - rect.left) * scaleX, (t.clientY - rect.top) * scaleY];
    }
    return [(e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY];
  }

  function startDraw(e) {
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const [x, y] = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawing.current = true;
  }

  function draw(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const [x, y] = getPos(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111111';
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function endDraw() {
    if (!drawing.current) return;
    drawing.current = false;
    onSig?.(canvasRef.current.toDataURL('image/png'));
  }

  function clear() {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    onSig?.(null);
  }

  return (
    <div className="sig-canvas-wrap">
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="sig-canvas"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      <div className="sig-canvas-actions">
        <button className="sig-btn-clear" onClick={clear}>{s.signClearBtn}</button>
      </div>
    </div>
  );
}
