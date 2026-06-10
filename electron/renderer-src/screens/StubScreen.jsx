import React from 'react';

export default function StubScreen({ title, sub }) {
  return (
    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🚧</div>
      <div className="screen-title" style={{ textAlign: 'center' }}>{title}</div>
      <div className="screen-sub" style={{ textAlign: 'center', marginTop: '0.5rem' }}>{sub}</div>
    </div>
  );
}
