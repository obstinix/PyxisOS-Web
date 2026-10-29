import { useEffect, useRef, useState } from 'react';
import { useStore } from '../core/store';
import { settingsStore, updateSettings, WALLPAPERS, WallpaperId } from '../core/settings';
import { wm, WORKSPACE_COUNT } from '../core/windows';
import { Icon } from './icons';
import { Badge } from './ui';

interface BatteryInfo {
  level: number;
  charging: boolean;
}

type BatteryManager = BatteryInfo & EventTarget;

/** Live battery state where the browser exposes the Battery Status API (Chromium); null otherwise. */
export function useBattery(): BatteryInfo | null | 'unsupported' {
  const [info, setInfo] = useState<BatteryInfo | null | 'unsupported'>(null);
  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
    if (!nav.getBattery) {
      setInfo('unsupported');
      return;
    }
    let bm: BatteryManager | null = null;
    const update = () => bm && setInfo({ level: bm.level, charging: bm.charging });
    nav
      .getBattery()
      .then((b) => {
        bm = b;
        update();
        b.addEventListener('levelchange', update);
        b.addEventListener('chargingchange', update);
      })
      .catch(() => setInfo('unsupported'));
    return () => {
      bm?.removeEventListener('levelchange', update);
      bm?.removeEventListener('chargingchange', update);
    };
  }, []);
  return info;
}

interface NetInfo {
  online: boolean;
  type?: string;
  downlink?: number;
}

export function useNetwork(): NetInfo {
  const read = (): NetInfo => {
    const c = (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number } }).connection;
    return { online: navigator.onLine, type: c?.effectiveType, downlink: c?.downlink };
  };
  const [info, setInfo] = useState(read);
  useEffect(() => {
    const update = () => setInfo(read());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    const c = (navigator as Navigator & { connection?: EventTarget }).connection;
    c?.addEventListener?.('change', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      c?.removeEventListener?.('change', update);
    };
  }, []);
  return info;
}

export function BatteryIndicator() {
  const b = useBattery();
  if (!b || b === 'unsupported') return null;
  const pct = Math.round(b.level * 100);
  const label = `Battery ${pct}%${b.charging ? ', charging' : ''} (reported by your browser)`;
  return (
    <span className="status-ind battery-ind" title={label} aria-label={label} role="img">
      <Icon.battery size={16} />
      <span className="battery-fill" style={{ width: `${Math.max(8, pct) * 0.11}px` }} aria-hidden="true" />
    </span>
  );
}

export function WorkspaceSwitcher() {
  const { activeWorkspace, windows } = useStore(wm.store);
  return (
    <div className="ws-switcher" role="group" aria-label="Workspaces">
      {Array.from({ length: WORKSPACE_COUNT }, (_, i) => {
        const count = windows.filter((w) => w.workspace === i).length;
        return (
          <button
            key={i}
            className={`ws-btn${i === activeWorkspace ? ' active' : ''}${count ? ' used' : ''}`}
            aria-pressed={i === activeWorkspace}
            aria-label={`Workspace ${i + 1}${count ? `, ${count} window${count > 1 ? 's' : ''}` : ''}`}
            title={`Workspace ${i + 1} (Alt+${i + 1})`}
            onClick={() => wm.switchWorkspace(i)}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ label, on, onChange, icon }: { label: string; on: boolean; onChange: (v: boolean) => void; icon: JSX.Element }) {
  return (
    <button className={`qs-toggle${on ? ' on' : ''}`} aria-pressed={on} onClick={() => onChange(!on)}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function QuickSettings({ onClose, onOpenSettings }: { onClose: () => void; onOpenSettings: () => void }) {
  const s = useStore(settingsStore);
  const net = useNetwork();
  const battery = useBattery();
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    navigator.storage
      ?.estimate?.()
      .then((e) => e.quota && setStorage({ usage: e.usage ?? 0, quota: e.quota }))
      .catch(() => undefined);
  }, []);

  const mb = (n: number) => `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`;

  return (
    <div ref={ref} className="panel qs-panel" role="dialog" aria-label="Quick settings" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="qs-grid">
        <Toggle label={s.theme === 'dark' ? 'Dark' : 'Light'} on={s.theme === 'dark'} onChange={(v) => updateSettings({ theme: v ? 'dark' : 'light' })} icon={s.theme === 'dark' ? <Icon.moon size={16} /> : <Icon.sun size={16} />} />
        <Toggle label="Do not disturb" on={s.dnd} onChange={(v) => updateSettings({ dnd: v })} icon={<Icon.bell size={16} />} />
        <Toggle label="Reduce motion" on={s.motion === 'reduced'} onChange={(v) => updateSettings({ motion: v ? 'reduced' : 'system' })} icon={<Icon.layers size={16} />} />
        <Toggle label="High contrast" on={s.highContrast} onChange={(v) => updateSettings({ highContrast: v })} icon={<Icon.sliders size={16} />} />
      </div>

      <label className="qs-row">
        <span className="qs-label">
          {s.soundVolume ? <Icon.volume size={15} /> : <Icon.volumeOff size={15} />} Notification sound
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={s.soundVolume}
          aria-label="Notification sound volume"
          aria-valuetext={s.soundVolume ? `${s.soundVolume}%` : 'Muted'}
          onChange={(e) => updateSettings({ soundVolume: Number(e.target.value) })}
        />
        <span className="mono small">{s.soundVolume ? `${s.soundVolume}%` : 'off'}</span>
      </label>

      <div className="qs-row">
        <span className="qs-label">Wallpaper</span>
        <select className="input small" value={s.wallpaper} onChange={(e) => updateSettings({ wallpaper: e.target.value as WallpaperId })} aria-label="Wallpaper">
          {Object.entries(WALLPAPERS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <dl className="qs-facts">
        <div>
          <dt>Network</dt>
          <dd>
            {net.online ? 'Online' : 'Offline'}
            {net.type ? ` · ${net.type}${net.downlink ? `, ~${net.downlink} Mb/s` : ''}` : ''} <Badge kind="LIVE" title="navigator.onLine / Network Information API" />
          </dd>
        </div>
        <div>
          <dt>Battery</dt>
          <dd>
            {battery === 'unsupported' ? (
              <>
                Not exposed by this browser <Badge kind="UNAVAILABLE" />
              </>
            ) : battery ? (
              <>
                {Math.round(battery.level * 100)}%{battery.charging ? ' · charging' : ''} <Badge kind="LIVE" />
              </>
            ) : (
              'Reading…'
            )}
          </dd>
        </div>
        <div>
          <dt>Site storage</dt>
          <dd>
            {storage ? (
              <>
                {mb(storage.usage)} of {mb(storage.quota)} <Badge kind="LIVE" title="navigator.storage.estimate()" />
              </>
            ) : (
              <>
                Unknown <Badge kind="UNAVAILABLE" />
              </>
            )}
          </dd>
        </div>
      </dl>
      <button
        className="btn small ghost qs-more"
        onClick={() => {
          onClose();
          onOpenSettings();
        }}
      >
        <Icon.sliders size={14} /> All settings
      </button>
    </div>
  );
}
