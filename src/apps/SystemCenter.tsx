import { useEffect, useState } from 'react';
import { AppProps } from './types';
import { useSignal, useStore } from '../core/store';
import { runtime } from '../core/system';
import { wm } from '../core/windows';
import { events } from '../core/events';
import { APPS } from '../core/apps';
import { diagnosticsStore, runDiagnostics } from '../core/diagnostics';
import { getServices } from '../core/services';
import { BUILD_NAME, CHANNEL, CODENAME, VERSION } from '../core/version';
import { formatBytes, formatDuration } from '../terminal/commands';
import { AppTile, Icon, PyxisMark } from '../shell/icons';
import { Badge, StatusDot, useNow } from '../shell/ui';

export const LIMITATIONS = [
  'Runs entirely inside the browser; the Lunar Core microkernel is not booted.',
  'Files live in browser storage (IndexedDB), not on the host filesystem.',
  'The terminal executes only built-in psh commands — never host shell commands.',
  'Hardware values are limited to what the browser exposes; other values are simulated.',
  'Astral Intelligence is a local rule-based assistant, not a language model.',
  'Simulated services, processes, consensus and Aegis policy model PyxisOS; they do not control the host.',
  'Pyxis Browser uses your browser engine in sandboxed frames; sites that forbid embedding open in a real tab.',
];

const STATUS_DOT = { pass: 'ok', warn: 'warn', fail: 'err', skip: 'muted' } as const;

export function SystemCenterApp(_: AppProps) {
  const now = useNow(1000);
  const report = useStore(diagnosticsStore);
  const log = useStore(events.store);
  const persistence = useStore(runtime.persistence);
  const { windows } = useStore(wm.store);
  const fs = useStore(runtime.fsInstance);
  useSignal(fs.changed);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    await runDiagnostics();
    setRunning(false);
  };

  useEffect(() => {
    if (!diagnosticsStore.get()) void run();
  }, []);

  const { files, dirs } = fs.counts();
  const services = getServices();
  const recent = log.slice(-8).reverse();
  void now;

  return (
    <div className="app-scroll sysc">
      <section className="sysc-hero">
        <div className="sysc-mark">
          <PyxisMark size={48} />
        </div>
        <div className="sysc-id">
          <div className="eyebrow">
            {CODENAME} <span className="accent-text">//</span> {CHANNEL}
          </div>
          <h1>PyxisOS</h1>
          <div className="muted mono small">
            VERSION {VERSION} · {BUILD_NAME} · browser simulation
          </div>
        </div>
        <div className="sysc-hero-actions">
          <button className="btn primary" onClick={() => void run()} disabled={running}>
            <Icon.refresh size={14} /> {running ? 'Running…' : 'Run diagnostics'}
          </button>
          <button className="btn" onClick={() => wm.open('terminal')}>
            <Icon.play size={14} /> Terminal
          </button>
        </div>
      </section>

      <section className="tiles">
        <div className="tile">
          <span className="tile-label">
            Uptime <Badge kind="LIVE" />
          </span>
          <span className="tile-value mono">{formatDuration(runtime.uptimeMs())}</span>
          <span className="tile-sub">Boot #{runtime.bootCount} in this browser</span>
        </div>
        <div className="tile">
          <span className="tile-label">Applications</span>
          <span className="tile-value mono">{APPS.length}</span>
          <span className="tile-sub">{windows.length} window(s) open</span>
        </div>
        <div className="tile">
          <span className="tile-label">Virtual filesystem</span>
          <span className="tile-value mono">{formatBytes(fs.totalBytes())}</span>
          <span className="tile-sub">
            {files} files · {dirs} folders
          </span>
        </div>
        <div className="tile">
          <span className="tile-label">Persistence</span>
          <span className="tile-value mono">{persistence.backend}</span>
          <span className="tile-sub">
            {persistence.lastError ? `Error: ${persistence.lastError}` : persistence.lastSaveAt ? `Saved ${new Date(persistence.lastSaveAt).toLocaleTimeString()}` : 'No changes saved yet'}
          </span>
        </div>
        <div className="tile">
          <span className="tile-label">Events</span>
          <span className="tile-value mono">{events.total}</span>
          <span className="tile-sub">recorded this session</span>
        </div>
      </section>

      <div className="sysc-grid">
        <section className="card">
          <header className="card-head">
            <h2>Diagnostics</h2>
            {report && (
              <span className="muted small">
                {report.summary.pass} pass · {report.summary.warn} warn · {report.summary.fail} fail · {report.summary.skip} skip
              </span>
            )}
          </header>
          {!report && <p className="muted small">Running checks…</p>}
          {report && (
            <ul className="check-list">
              {report.results.map((r) => (
                <li key={r.id} title={`${r.durationMs.toFixed(1)} ms`}>
                  <StatusDot status={STATUS_DOT[r.status]} />
                  <span className="check-name">{r.name}</span>
                  <span className="check-detail muted">{r.detail}</span>
                </li>
              ))}
            </ul>
          )}
          {report && <div className="card-foot muted small">Last run {new Date(report.ranAt).toLocaleTimeString()} · all checks executed in this browser</div>}
        </section>

        <section className="card">
          <header className="card-head">
            <h2>Services</h2>
          </header>
          <ul className="svc-list">
            {services.map((s) => (
              <li key={s.id}>
                <StatusDot status={s.status} />
                <span className="svc-name">{s.name}</span>
                <span className="svc-state muted">{s.state}</span>
                {s.kind !== 'LIVE' && <Badge kind={s.kind} />}
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <header className="card-head">
            <h2>Recent events</h2>
            <button className="btn small ghost" onClick={() => wm.open('events')}>
              Open journal
            </button>
          </header>
          <ul className="event-mini">
            {recent.map((e) => (
              <li key={e.id} className={`ev-${e.level}`}>
                <span className="mono muted">{new Date(e.time).toLocaleTimeString()}</span>
                <span className="ev-src mono">{e.source}</span>
                <span className="truncate">{e.message}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <header className="card-head">
            <h2>Architecture</h2>
            <button className="btn small ghost" onClick={() => wm.open('architecture')}>
              Explore
            </button>
          </header>
          <ul className="arch-mini">
            <li>
              <span>Desktop environment</span> <Badge kind="IMPLEMENTED" title="Implemented in this web build" />
            </li>
            <li>
              <span>Pyxis CLI (psh simulation)</span> <Badge kind="SIMULATED" />
            </li>
            <li>
              <span>Lunar Core microkernel</span> <Badge kind="UNAVAILABLE" title="Developed natively, not part of the web build" />
            </li>
            <li>
              <span>Astral Consensus Engine</span> <Badge kind="PLANNED" />
            </li>
            <li>
              <span>Aegis integration</span> <Badge kind="PLANNED" />
            </li>
          </ul>
        </section>

        <section className="card span-2">
          <header className="card-head">
            <h2>Known limitations</h2>
          </header>
          <ul className="limits">
            {LIMITATIONS.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>

        <section className="card span-2">
          <header className="card-head">
            <h2>System tools</h2>
          </header>
          <div className="tool-grid">
            {(['monitor', 'files', 'settings', 'astral', 'architecture', 'about'] as const).map((id) => {
              const a = APPS.find((x) => x.id === id)!;
              return (
                <button key={id} className="tool" onClick={() => wm.open(id)}>
                  <AppTile id={id} size={32} />
                  <span>
                    <strong>{a.name}</strong>
                    <span className="muted small">{a.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
