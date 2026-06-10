import React from 'react';
import './Sidebar.css';

const LANGS = [
  { code: 'en', label: '🌐 English' },
  { code: 'es', label: '🌐 Español' },
  { code: 'ja', label: '🌐 日本語' },
  { code: 'ko', label: '🌐 한국어' },
];

export default function Sidebar({ screen, onNav, lang, onLang, s }) {
  const item = (id, icon, label) => (
    <button
      className={`nav-item${screen === id ? ' active' : ''}`}
      onClick={() => onNav(id)}
      aria-current={screen === id ? 'page' : undefined}
    >
      <span className="nav-icon" aria-hidden="true">{icon}</span>
      {label}
    </button>
  );

  return (
    <aside className="sidebar" aria-label="Navigation">
      <div className="logo">
        <div className="logo-name">
          El <span className="logo-accent">P</span>avi<span className="logo-accent">DF</span>eliz
        </div>
        <div className="logo-tag">{s.appTagline}</div>
      </div>

      <div className="lang-row">
        <select
          className="lang-sel"
          value={lang}
          onChange={e => onLang(e.target.value)}
          aria-label={s.langLabel}
        >
          {LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </div>

      <nav>
        <div className="nav-section">{s.sectionConversion}</div>
        {item('convert',  '⇄',  s.navConvert)}

        <div className="nav-section">{s.sectionPdfTools}</div>
        {item('organize', '▦',  s.navOrganize)}
        {item('merge',    '⊕',  s.navMerge)}
        {item('split',    '✂',  s.navSplit)}
        {item('compress', '◈',  s.navCompress)}
        {item('edit',     '✏',  s.navEdit)}
        {item('redact',   '◼',  s.navRedact)}
        {item('sign',     '✍',  s.navSign)}
        {item('lock',     '🔒', s.navLock)}
        {item('unlock',   '🔓', s.navUnlock)}

        <div className="nav-section">{s.sectionApp}</div>
        {item('history',  '🕐', s.navHistory)}
        {item('settings', '⚙',  s.navSettings)}
      </nav>
    </aside>
  );
}
