import { useEffect, useRef, useState } from 'react';
import { useStore } from '../core/store';
import { runtime } from '../core/system';
import { settingsStore, updateSettings } from '../core/settings';
import { BUILD_NAME, CHANNEL, CODENAME, VERSION } from '../core/version';
import { Icon, PyxisMark } from './icons';
import { useNow } from './ui';

const STAGE_MARK: Record<string, string> = {
  pending: '··',
  running: '>>',
  done: 'OK',
  warn: '!!',
  failed: 'XX',
};

export function BootScreen() {
  const stages = useStore(runtime.stages);
  const done = stages.filter((s) => s.status !== 'pending' && s.status !== 'running').length;
  const pct = stages.length ? Math.round((done / stages.length) * 100) : 0;
  return (
    <div className="boot" role="status" aria-live="polite" aria-label="Starting PyxisOS">
      <div className="boot-inner">
        <div className="boot-mark">
          <PyxisMark size={44} />
        </div>
        <div className="boot-title">
          {CODENAME} <span className="accent">//</span> {CHANNEL}
        </div>
        <div className="boot-version mono">VERSION {VERSION}</div>
        <div className="boot-bar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </div>
        <ol className="boot-log mono">
          {stages.map((s) => (
            <li key={s.id} className={`boot-stage ${s.status}`}>
              <span className="boot-flag">[{STAGE_MARK[s.status]}]</span>
              <span className="boot-label">{s.label}</span>
              {s.detail && <span className="boot-detail">— {s.detail}</span>}
              {s.durationMs !== undefined && <span className="boot-time">{s.durationMs.toFixed(1)}ms</span>}
            </li>
          ))}
        </ol>
        <div className="boot-foot mono">{BUILD_NAME} · browser simulation · no native kernel is started</div>
      </div>
    </div>
  );
}

export function LoginScreen() {
  const settings = useStore(settingsStore);
  const now = useNow(settings.clockSeconds ? 1000 : 10000);
  const [entering, setEntering] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(settings.displayName);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => buttonRef.current?.focus(), []);

  const enter = async () => {
    if (entering) return;
    setEntering(true);
    await runtime.enterDesktop();
  };

  return (
    <div className="login">
      <div className="wallpaper" aria-hidden="true" />
      <div className="login-clock">
        <div className="login-time">
          {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !settings.clock24h })}
        </div>
        <div className="login-date">{new Date(now).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
      </div>
      <div className="login-card">
        <div className="login-avatar" aria-hidden="true">
          {settings.displayName.slice(0, 1).toUpperCase()}
        </div>
        {editing ? (
          <form
            className="login-edit"
            onSubmit={(e) => {
              e.preventDefault();
              updateSettings({ displayName: name });
              setEditing(false);
            }}
          >
            <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Display name" autoFocus />
            <button className="btn small" type="submit">
              Save
            </button>
          </form>
        ) : (
          <button className="login-name" onClick={() => setEditing(true)} title="Change display name">
            {settings.displayName}
          </button>
        )}
        <div className="login-sub">Local demonstration profile · no password required</div>
        <button ref={buttonRef} className="btn primary login-enter" onClick={enter} disabled={entering}>
          {entering ? 'Starting session…' : 'Enter desktop'}
          <Icon.arrowRight size={15} />
        </button>
      </div>
      <div className="login-foot">
        <span className="mono">
          {CODENAME} // {CHANNEL} · {VERSION}
        </span>
        <span className="login-actions">
          <button className="btn ghost small" onClick={() => void runtime.restart()}>
            <Icon.refresh size={14} /> Restart
          </button>
          <button className="btn ghost small" onClick={() => void runtime.shutdown()}>
            <Icon.power size={14} /> Shut down
          </button>
        </span>
      </div>
    </div>
  );
}

export function ShutdownScreen() {
  return (
    <div className="shutdown">
      <PyxisMark size={36} />
      <p>PyxisOS has shut down. Your files and settings were saved to browser storage.</p>
      <button className="btn" onClick={() => location.reload()} autoFocus>
        <Icon.power size={14} /> Power on
      </button>
    </div>
  );
}

export function FailureScreen() {
  return (
    <div className="shutdown failure" role="alert">
      <Icon.alert size={32} />
      <h1>Startup failed</h1>
      <p className="mono">{runtime.failure ?? 'Unknown error'}</p>
      <p>You can retry, or erase stored PyxisOS data and start fresh.</p>
      <div className="row gap-2">
        <button className="btn" onClick={() => location.reload()} autoFocus>
          Retry
        </button>
        <button className="btn danger" onClick={() => void runtime.factoryReset()}>
          Reset stored data
        </button>
      </div>
    </div>
  );
}
