import { useEffect } from 'react';
import { useStore } from './core/store';
import { runtime } from './core/system';
import { applySettingsToDocument, settingsStore } from './core/settings';
import { BootScreen, FailureScreen, LoginScreen, ShutdownScreen } from './shell/Session';
import { Desktop } from './shell/Desktop';

export function App() {
  const phase = useStore(runtime.phase);
  const settings = useStore(settingsStore);

  useEffect(() => applySettingsToDocument(settings), [settings]);

  useEffect(() => {
    void runtime.boot({ pace: 70 });
    const save = () => void runtime.saveNow();
    const onHide = () => document.visibilityState === 'hidden' && save();
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);

  switch (phase) {
    case 'boot':
      return <BootScreen />;
    case 'login':
      return <LoginScreen />;
    case 'desktop':
      return <Desktop />;
    case 'shutdown':
      return <ShutdownScreen />;
    case 'failed':
      return <FailureScreen />;
  }
}
