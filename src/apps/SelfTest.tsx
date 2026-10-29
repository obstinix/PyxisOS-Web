import { useState } from 'react';
import { AppProps } from './types';
import { useStore } from '../core/store';
import { listSelfTests, runSelfTests, selfTestStore } from '../core/selftest';
import { runtime, systemFiles } from '../core/system';
import { DEFAULT_SETTINGS, settingsStore } from '../core/settings';
import { userState } from '../core/userstate';
import { persistedSpecs } from '../core/persisted';
import { wm } from '../core/windows';
import { VirtualFS } from '../core/vfs';
import { notifications } from '../core/notifications';
import { events } from '../core/events';
import { Icon } from '../shell/icons';
import { confirmDialog, StatusDot } from '../shell/ui';

interface Recovery {
  id: string;
  title: string;
  removes: string;
  keeps: string;
  danger: boolean;
  run: () => Promise<void> | void;
}

const RECOVERY: Recovery[] = [
  {
    id: 'settings',
    title: 'Restore default settings',
    removes: 'Theme, wallpaper, dock, notification and accessibility preferences.',
    keeps: 'Files, favourites, browser data and window layout.',
    danger: false,
    run: () => settingsStore.set({ ...DEFAULT_SETTINGS, displayName: settingsStore.get().displayName }),
  },
  {
    id: 'layout',
    title: 'Reset window layout',
    removes: 'All open windows and the saved session layout (apps with unsaved changes still ask).',
    keeps: 'Files and preferences.',
    danger: false,
    run: () => {
      [...wm.windows].forEach((w) => wm.close(w.id));
      wm.switchWorkspace(0);
    },
  },
  {
    id: 'userstate',
    title: 'Reset app data',
    removes: 'Dock favourites, recent apps, browser tabs/history/bookmarks, service startup config, Aegis policy and audit log, assistant activity and configuration history.',
    keeps: 'Files and desktop preferences.',
    danger: true,
    run: () => {
      for (const spec of persistedSpecs()) spec.store.set(spec.defaults());
      userState.set((u) => ({ ...u, onboardingDone: true }));
    },
  },
  {
    id: 'files',
    title: 'Reset the virtual filesystem',
    removes: 'Every file and folder you created under /home and /tmp in this browser.',
    keeps: 'Preferences and app data. Export files you need from Files first.',
    danger: true,
    run: async () => {
      const fresh = VirtualFS.defaultTree();
      runtime.fs.root = fresh;
      runtime.fs.installSystemFiles(systemFiles());
      runtime.fs.changed.emit();
      await runtime.saveNow();
    },
  },
  {
    id: 'erase',
    title: 'Erase all PyxisOS data',
    removes: 'Everything PyxisOS-Web stored in this browser: files, settings, layout and app data. The page reloads into a first boot.',
    keeps: 'Nothing. Your real computer and other websites are not affected.',
    danger: true,
    run: () => runtime.factoryReset(),
  },
];

/** Self-Test & Recovery Center. */
export function SelfTestApp(_: AppProps) {
  const report = useStore(selfTestStore);
  const [busy, setBusy] = useState(false);
  const results = report?.results;
  const failed = results?.filter((r) => !r.ok).length ?? 0;

  const run = async () => {
    setBusy(true);
    try {
      await runSelfTests();
    } finally {
      setBusy(false);
    }
  };

  const recover = async (r: Recovery) => {
    const ok = await confirmDialog(`${r.title}?`, {
      message: `This removes: ${r.removes}\nThis keeps: ${r.keeps}`,
      confirmLabel: r.title,
      danger: r.danger,
    });
    if (!ok) return;
    try {
      await r.run();
      events.log('recovery', `${r.title} performed`, 'warn');
      notifications.notify(r.title, 'Done', 'success', 'selftest');
    } catch (e) {
      notifications.notify(`${r.title} failed`, (e as Error).message, 'error', 'selftest');
    }
  };

  return (
    <div className="app-scroll selftest">
      <div className="toolbar wrap">
        <button className="btn primary small" onClick={() => void run()} disabled={busy}>
          <Icon.play size={13} /> {busy ? 'Running…' : 'Run self-test'}
        </button>
        {results && (
          <span className="small">
            {results.length - failed} passed · {failed} failed · {new Date(report!.ranAt).toLocaleTimeString()}
          </span>
        )}
      </div>
      <p className="muted small pad">These tests exercise the web demo's own code with isolated instances and scratch data. They do not test your hardware, your operating system or a native PyxisOS kernel.</p>
      <table className="table">
        <thead>
          <tr>
            <th>Area</th>
            <th>Test</th>
            <th>Result</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {listSelfTests().map((t) => {
            const r = results?.find((x) => x.id === t.id);
            return (
              <tr key={t.id}>
                <td>{t.area}</td>
                <td>{t.name}</td>
                <td>
                  {r ? (
                    <>
                      <StatusDot status={r.ok ? 'ok' : 'err'} /> {r.ok ? 'pass' : 'fail'}
                    </>
                  ) : (
                    <span className="muted">not run</span>
                  )}
                </td>
                <td className="small">
                  {r?.detail}
                  {r && !r.ok && <div className="danger-text">What to do: {r.advice}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h3 className="section-title pad">Recovery</h3>
      <div className="recovery-list">
        {RECOVERY.map((r) => (
          <div key={r.id} className="card">
            <div className="card-head">
              <strong>{r.title}</strong>
            </div>
            <p className="small">
              <strong>Removes:</strong> {r.removes}
            </p>
            <p className="small muted">
              <strong>Keeps:</strong> {r.keeps}
            </p>
            <button className={`btn small ${r.danger ? 'danger' : ''}`} onClick={() => void recover(r)}>
              {r.title}…
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
