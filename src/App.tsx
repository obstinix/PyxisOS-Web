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

  // Keep the time-based wallpaper's time of day current.
  useEffect(() => {
    if (settings.wallpaper !== 'daycycle') return;
    const id = setInterval(() => applySettingsToDocument(settingsStore.get()), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [settings.wallpaper]);

  useEffect(() => {
    // A replay requested from the Boot Lab runs the full-length sequence once.
    let replay = false;
    try {
      replay = sessionStorage.getItem('pyxis.replayBoot') === '1';
      sessionStorage.removeItem('pyxis.replayBoot');
    } catch {
      replay = false;
    }
    void runtime.boot({ pace: replay ? 220 : 70 });
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
