import React from 'react';
import './Settings.css';

const LANG_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
];

export default function Settings({ s, lang, onLang, outputDir, onPickFolder }) {
  return (
    <div className="settings-screen">
      <div className="screen-title">{s.settingsTitle}</div>
      <div className="screen-sub">{s.settingsSub}</div>

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

      <div className="sec-label" style={{ marginTop: '1.25rem' }}>{s.langLabel}</div>
      <div className="settings-lang-grid">
        {LANG_OPTIONS.map(({ code, label }) => (
          <button
            key={code}
            className={`settings-lang-btn${lang === code ? ' active' : ''}`}
            onClick={() => onLang(code)}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="settings-hint">{s.settingsHint}</p>
    </div>
  );
}
