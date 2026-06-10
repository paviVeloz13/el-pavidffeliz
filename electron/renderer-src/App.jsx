import React, { useState, useEffect } from 'react';
import './styles/global.css';
import Sidebar from './components/Sidebar.jsx';
import Convert from './screens/Convert.jsx';
import Merge from './screens/Merge.jsx';
import Split from './screens/Split.jsx';
import StubScreen from './screens/StubScreen.jsx';
import { useStrings } from './i18n/strings.js';

const DEFAULT_LANG = 'es';

export default function App() {
  const [screen, setScreen]       = useState('convert');
  const [lang, setLang]           = useState(DEFAULT_LANG);
  const [outputDir, setOutputDir] = useState('~/Downloads/iLovePaviDF');

  const s = useStrings(lang);

  // Fetch the real home-dir-based default from main process once.
  useEffect(() => {
    window.electronAPI?.getDefaultOutputDir?.()
      .then(dir => { if (dir) setOutputDir(dir); })
      .catch(() => {});
  }, []);

  async function pickFolder() {
    const dir = await window.electronAPI?.pickFolder(outputDir);
    if (dir) setOutputDir(dir);
  }

  function renderScreen() {
    switch (screen) {
      case 'convert':  return <Convert s={s} outputDir={outputDir} onPickFolder={pickFolder} />;
      case 'organize': return <StubScreen title={s.navOrganize}  sub={s.stubSub} />;
      case 'merge':    return <Merge s={s} outputDir={outputDir} onPickFolder={pickFolder} />;
      case 'split':    return <Split s={s} outputDir={outputDir} onPickFolder={pickFolder} />;
      case 'compress': return <StubScreen title={s.navCompress}  sub={s.stubSub} />;
      case 'edit':     return <StubScreen title={s.navEdit}      sub={s.stubSub} />;
      case 'redact':   return <StubScreen title={s.navRedact}    sub={s.stubSub} />;
      case 'sign':     return <StubScreen title={s.navSign}      sub={s.stubSub} />;
      case 'lock':     return <StubScreen title={s.navLock}      sub={s.stubSub} />;
      case 'unlock':   return <StubScreen title={s.navUnlock}    sub={s.stubSub} />;
      case 'history':  return <StubScreen title={s.historyTitle} sub={s.historySub} />;
      case 'settings': return <StubScreen title={s.settingsTitle} sub={s.settingsSub} />;
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
