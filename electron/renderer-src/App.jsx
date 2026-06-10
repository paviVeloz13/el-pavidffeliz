import React, { useState, useEffect, useRef } from 'react';
import './styles/global.css';
import Sidebar from './components/Sidebar.jsx';
import Convert from './screens/Convert.jsx';
import Merge from './screens/Merge.jsx';
import Split from './screens/Split.jsx';
import Compress from './screens/Compress.jsx';
import Organize from './screens/Organize.jsx';
import Lock from './screens/Lock.jsx';
import Unlock from './screens/Unlock.jsx';
import Edit from './screens/Edit.jsx';
import Redact from './screens/Redact.jsx';
import History from './screens/History.jsx';
import Sign from './screens/Sign.jsx';
import Settings from './screens/Settings.jsx';
import { useStrings } from './i18n/strings.js';

const DEFAULT_LANG = 'es';

export default function App() {
  const [screen, setScreen]       = useState('convert');
  const [lang, setLang]           = useState(DEFAULT_LANG);
  const [outputDir, setOutputDir] = useState('~/Downloads/El PaviDFeliz');

  const s = useStrings(lang);
  const settingsLoaded = useRef(false);

  // Load persisted settings on mount; fall back to default output dir if none saved.
  useEffect(() => {
    window.electronAPI?.settingsRead?.()
      .then(saved => {
        if (saved.outputDir) setOutputDir(saved.outputDir);
        if (saved.lang)      setLang(saved.lang);
      })
      .catch(() =>
        window.electronAPI?.getDefaultOutputDir?.()
          .then(dir => { if (dir) setOutputDir(dir); })
          .catch(() => {})
      )
      .finally(() => { settingsLoaded.current = true; });
  }, []);

  // Persist settings whenever lang or outputDir changes (after initial load).
  useEffect(() => {
    if (!settingsLoaded.current) return;
    window.electronAPI?.settingsWrite?.({ lang, outputDir })?.catch?.(() => {});
  }, [lang, outputDir]);

  async function pickFolder() {
    const dir = await window.electronAPI?.pickFolder(outputDir);
    if (dir) setOutputDir(dir);
  }

  function renderScreen() {
    switch (screen) {
      case 'convert':  return <Convert s={s} outputDir={outputDir} onPickFolder={pickFolder} />;
      case 'organize': return <Organize s={s} outputDir={outputDir} onPickFolder={pickFolder} />;
      case 'merge':    return <Merge s={s} outputDir={outputDir} onPickFolder={pickFolder} />;
      case 'split':    return <Split s={s} outputDir={outputDir} onPickFolder={pickFolder} />;
      case 'compress': return <Compress s={s} outputDir={outputDir} onPickFolder={pickFolder} />;
      case 'edit':     return <Edit s={s} outputDir={outputDir} onPickFolder={pickFolder} />;
      case 'redact':   return <Redact s={s} outputDir={outputDir} onPickFolder={pickFolder} />;
      case 'sign':     return <Sign s={s} outputDir={outputDir} onPickFolder={pickFolder} />;
      case 'lock':     return <Lock s={s} outputDir={outputDir} onPickFolder={pickFolder} />;
      case 'unlock':   return <Unlock s={s} outputDir={outputDir} onPickFolder={pickFolder} />;
      case 'history':  return <History s={s} />;
      case 'settings': return <Settings s={s} lang={lang} onLang={setLang} outputDir={outputDir} onPickFolder={pickFolder} />;
      default:         return null;
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        screen={screen}
        onNav={setScreen}
        lang={lang}
        onLang={setLang}
        s={s}
      />
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.375rem 1.625rem',
          background: 'var(--color-background-tertiary)',
        }}
        aria-live="polite"
      >
        {renderScreen()}
      </main>
    </div>
  );
}
