import { ReactNode, useEffect, useRef, useState } from 'react';
import { AppProps } from './types';
import { useStore } from '../core/store';
import { ACCENTS, AccentId, DEFAULT_SETTINGS, SCALES, Settings, WALLPAPERS, WallpaperId, settingsStore, updateSettings } from '../core/settings';
import { notifications } from '../core/notifications';
import { runtime } from '../core/system';
import { events } from '../core/events';
import { VirtualFS } from '../core/vfs';
import { sanitizeSettings } from '../core/settings';
import { confirmDialog } from '../shell/ui';
import { Icon } from '../shell/icons';

type Section = 'appearance' | 'desktop' | 'notifications' | 'session';
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'desktop', label: 'Desktop & dock' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'session', label: 'Session & data' },
];

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-label">
        <span>{label}</span>
        {hint && <small className="muted">{hint}</small>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} className={`switch${checked ? ' on' : ''}`} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

function Choice<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={value === o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const set = (patch: Partial<Settings>, what: string) => {
  updateSettings(patch);
  events.log('settings', `${what} changed`);
};

export function SettingsApp({ win }: AppProps) {
  const s = useStore(settingsStore);
  const initial = SECTIONS.some((x) => x.id === win.props.section) ? (win.props.section as Section) : 'appearance';
  const [section, setSection] = useState<Section>(initial);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (SECTIONS.some((x) => x.id === win.props.section)) setSection(win.props.section as Section);
  }, [win.props]);

  const exportProfile = () => {
    const data = { format: 'pyxisos-web-profile', version: 1, exportedAt: new Date().toISOString(), settings: s, filesystem: runtime.fs.serialize() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pyxisos-profile-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    events.log('settings', 'Profile exported');
  };

  const importProfile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data?.format !== 'pyxisos-web-profile') throw new Error('Not a PyxisOS-Web profile file');
      const fs = VirtualFS.fromSnapshot(data.filesystem);
      const ok = await confirmDialog('Replace current data with this profile?', {
        message: 'Your current files and settings will be replaced. PyxisOS will restart to apply the profile.',
        confirmLabel: 'Import and restart',
        danger: true,
      });
      if (!ok) return;
      await runtime.storage.set('vfs', fs.serialize());
      await runtime.storage.set('settings', sanitizeSettings(data.settings));
      await runtime.storage.set('session', []);
      location.reload();
    } catch (e) {
      notifications.notify('Import failed', (e as Error).message, 'error');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  const reset = async () => {
    const ok = await confirmDialog('Erase all PyxisOS-Web data?', {
      message: 'This permanently deletes your virtual files, settings and saved session from this browser, then restarts.',
      confirmLabel: 'Erase and restart',
      danger: true,
    });
    if (ok) await runtime.factoryReset();
  };

  return (
    <div className="settings">
      <nav className="settings-nav" aria-label="Settings sections">
        {SECTIONS.map((x) => (
          <button key={x.id} className={`side-item${section === x.id ? ' active' : ''}`} aria-current={section === x.id ? 'page' : undefined} onClick={() => setSection(x.id)}>
            {x.label}
          </button>
        ))}
      </nav>
      <div className="settings-body app-scroll">
        {section === 'appearance' && (
          <>
            <h2>Appearance</h2>
            <Row label="Theme">
              <Choice
                label="Theme"
                value={s.theme}
                options={[
                  { value: 'dark', label: 'Dark' },
                  { value: 'light', label: 'Light' },
                ]}
                onChange={(theme) => set({ theme }, 'Theme')}
              />
            </Row>
            <Row label="Accent" hint="Lunar-Pyxis accent colour">
              <div className="swatches" role="radiogroup" aria-label="Accent colour">
                {(Object.keys(ACCENTS) as AccentId[]).map((id) => (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={s.accent === id}
                    aria-label={ACCENTS[id].label}
                    title={ACCENTS[id].label}
                    className={`swatch${s.accent === id ? ' active' : ''}`}
                    style={{ background: s.theme === 'dark' ? ACCENTS[id].dark : ACCENTS[id].light }}
                    onClick={() => set({ accent: id }, 'Accent')}
                  />
                ))}
              </div>
            </Row>
            <Row label="Wallpaper">
              <div className="wallpapers" role="radiogroup" aria-label="Wallpaper">
                {(Object.keys(WALLPAPERS) as WallpaperId[]).map((id) => (
                  <button key={id} role="radio" aria-checked={s.wallpaper === id} className={`wp-option${s.wallpaper === id ? ' active' : ''}`} onClick={() => set({ wallpaper: id }, 'Wallpaper')}>
                    <span className={`wp-thumb wp-${id}`} aria-hidden="true" />
                    <span>{WALLPAPERS[id]}</span>
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Display scale" hint="Scales text and interface elements">
              <Choice label="Display scale" value={s.scale} options={SCALES.map((v) => ({ value: v, label: `${Math.round(v * 100)}%` }))} onChange={(scale) => set({ scale }, 'Display scale')} />
            </Row>
            <Row label="Motion" hint="System follows your OS reduced-motion preference">
              <Choice
                label="Motion"
                value={s.motion}
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'full', label: 'Full' },
                  { value: 'reduced', label: 'Reduced' },
                ]}
                onChange={(motion) => set({ motion }, 'Motion preference')}
              />
            </Row>
          </>
        )}

        {section === 'desktop' && (
          <>
            <h2>Desktop &amp; dock</h2>
            <Row label="Dock position">
              <Choice
                label="Dock position"
                value={s.dockPosition}
                options={[
                  { value: 'bottom', label: 'Bottom' },
                  { value: 'left', label: 'Left' },
                  { value: 'right', label: 'Right' },
                ]}
                onChange={(dockPosition) => set({ dockPosition }, 'Dock position')}
              />
            </Row>
            <Row label="Auto-hide dock" hint="Reveal the dock by moving the pointer to its edge">
              <Toggle label="Auto-hide dock" checked={s.dockAutohide} onChange={(dockAutohide) => set({ dockAutohide }, 'Dock auto-hide')} />
            </Row>
            <Row label="Clock format">
              <Choice
                label="Clock format"
                value={s.clock24h ? '24' : '12'}
                options={[
                  { value: '24', label: '24-hour' },
                  { value: '12', label: '12-hour' },
                ]}
                onChange={(v) => set({ clock24h: v === '24' }, 'Clock format')}
              />
            </Row>
            <Row label="Show seconds">
              <Toggle label="Show seconds" checked={s.clockSeconds} onChange={(clockSeconds) => set({ clockSeconds }, 'Clock seconds')} />
            </Row>
            <div className="shortcuts">
              <h3>Keyboard shortcuts</h3>
              <dl>
                <dt>
                  <kbd>Alt</kbd>+<kbd>Space</kbd> / <kbd>Ctrl</kbd>+<kbd>K</kbd>
                </dt>
                <dd>Launcher</dd>
                <dt>
                  <kbd>Alt</kbd>+<kbd>T</kbd>
                </dt>
                <dd>New terminal</dd>
                <dt>
                  <kbd>Alt</kbd>+<kbd>E</kbd>
                </dt>
                <dd>Files</dd>
                <dt>
                  <kbd>Alt</kbd>+<kbd>,</kbd>
                </dt>
                <dd>Settings</dd>
                <dt>
                  <kbd>Alt</kbd>+<kbd>W</kbd>
                </dt>
                <dd>Close focused window</dd>
                <dt>
                  <kbd>Alt</kbd>+<kbd>M</kbd>
                </dt>
                <dd>Minimize focused window</dd>
                <dt>
                  <kbd>Alt</kbd>+<kbd>`</kbd>
                </dt>
                <dd>Cycle windows</dd>
                <dt>
                  <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>←</kbd>/<kbd>→</kbd>/<kbd>↑</kbd>/<kbd>↓</kbd>
                </dt>
                <dd>Snap left / right, maximize, minimize</dd>
              </dl>
            </div>
          </>
        )}

        {section === 'notifications' && (
          <>
            <h2>Notifications</h2>
            <Row label="Show notification toasts" hint="Notifications are always kept in the panel">
              <Toggle label="Show notification toasts" checked={s.notifications} onChange={(notificationsOn) => set({ notifications: notificationsOn }, 'Notifications')} />
            </Row>
            <Row label="Toast duration">
              <Choice
                label="Toast duration"
                value={s.notificationDurationMs}
                options={[
                  { value: 3000, label: '3 s' },
                  { value: 4500, label: '4.5 s' },
                  { value: 8000, label: '8 s' },
                ]}
                onChange={(notificationDurationMs) => set({ notificationDurationMs }, 'Notification duration')}
              />
            </Row>
            <Row label="Test">
              <button className="btn small" onClick={() => notifications.notify('Test notification', 'Notifications are working.', 'info')}>
                Send test notification
              </button>
            </Row>
          </>
        )}

        {section === 'session' && (
          <>
            <h2>Session &amp; data</h2>
            <Row label="Display name" hint="Shown on the login screen and in the session menu">
              <input
                className="input"
                defaultValue={s.displayName}
                maxLength={40}
                aria-label="Display name"
                onBlur={(e) => e.target.value.trim() && e.target.value !== s.displayName && set({ displayName: e.target.value }, 'Display name')}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            </Row>
            <Row label="Restore windows on sign-in" hint="Reopen the windows you had open last time">
              <Toggle label="Restore windows on sign-in" checked={s.restoreSession} onChange={(restoreSession) => set({ restoreSession }, 'Session restore')} />
            </Row>
            <Row label="Storage" hint="Where your virtual files and settings are kept">
              <span className="mono">{runtime.storage.kind}</span>
            </Row>
            <Row label="Profile backup" hint="Export or import files and settings as JSON">
              <div className="row gap-2">
                <button className="btn small" onClick={exportProfile}>
                  <Icon.download size={14} /> Export
                </button>
                <button className="btn small" onClick={() => importRef.current?.click()}>
                  <Icon.upload size={14} /> Import…
                </button>
                <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(e) => void importProfile(e.target.files?.[0])} />
              </div>
            </Row>
            <Row label="Restore default settings" hint="Keeps your files">
              <button
                className="btn small"
                onClick={async () => {
                  if (await confirmDialog('Restore default settings?', { confirmLabel: 'Restore defaults' })) {
                    settingsStore.set({ ...DEFAULT_SETTINGS, displayName: s.displayName });
                    events.log('settings', 'Settings restored to defaults');
                  }
                }}
              >
                Restore defaults
              </button>
            </Row>
            <Row label="Erase all data" hint="Files, settings and session — cannot be undone">
              <button className="btn small danger" onClick={() => void reset()}>
                Erase and restart
              </button>
            </Row>
          </>
        )}
      </div>
    </div>
  );
}
