import { useEffect, useState } from 'react';
import { AppProps } from './types';
import { useStore } from '../core/store';
import { metrics, Sample } from '../core/metrics';
import { wm } from '../core/windows';
import { getApp } from '../core/apps';
import { events } from '../core/events';
import { runtime } from '../core/system';
import { formatBytes, formatDuration } from '../terminal/commands';
import { AppGlyph } from '../shell/icons';
import { Badge, BadgeKind } from '../shell/ui';

function Chart({
  samples,
  pick,
  max,
  label,
  unit,
  kind,
  format = (v) => v.toFixed(0),
}: {
  samples: Sample[];
  pick: (s: Sample) => number | null;
  max?: number;
  label: string;
  unit: string;
  kind: BadgeKind;
  format?: (v: number) => string;
}) {
  const values = samples.map(pick);
  const available = values.some((v) => v !== null);
  const nums = values.filter((v): v is number => v !== null);
  const top = max ?? Math.max(1, ...nums) * 1.2;
  const W = 300;
  const H = 72;
  const n = 60;
  const pts = values.map((v, i) => {
    const x = W - (values.length - 1 - i) * (W / (n - 1));
    const y = H - ((v ?? 0) / top) * (H - 4) - 2;
    return [x, Math.max(2, Math.min(H - 2, y))] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const area = pts.length ? `${line}L${pts[pts.length - 1][0]},${H}L${pts[0][0]},${H}Z` : '';
  const latest = nums[nums.length - 1];

  return (
    <figure className="chart">
      <figcaption>
        <span>{label}</span>
        <Badge kind={available ? kind : 'UNAVAILABLE'} />
      </figcaption>
      <div className="chart-value mono">
        {available && latest !== undefined ? (
          <>
            {format(latest)}
            <small> {unit}</small>
          </>
        ) : (
          <span className="muted">{available ? '…' : 'not exposed by this browser'}</span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${label} history`}>
        <path d={`M0,${H / 2}H${W}`} className="chart-grid" />
        {available && pts.length > 1 && (
          <>
            <path d={area} className="chart-area" />
            <path d={line} className="chart-line" />
          </>
        )}
      </svg>
    </figure>
  );
}

export function MonitorApp(_: AppProps) {
  const samples = useStore(metrics.samples);
  const info = useStore(metrics.info);
  const { windows, focusedId } = useStore(wm.store);
  const persistence = useStore(runtime.persistence);
  const [tab, setTab] = useState<'performance' | 'tasks' | 'environment'>('performance');

  useEffect(() => metrics.acquire(), []);

  const counts = events.countsBySource();

  return (
    <div className="monitor">
      <div className="seg" role="tablist" aria-label="Monitor views">
        {(['performance', 'tasks', 'environment'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
        <span className="seg-note muted small">Sampling 1×/s while open · last 60 s</span>
      </div>

      {tab === 'performance' && (
        <div className="app-scroll">
          <div className="chart-grid-wrap">
            <Chart samples={samples} pick={(s) => s.fps} max={Math.max(60, ...samples.map((s) => s.fps ?? 0))} label="Frame rate" unit="fps" kind="LIVE" />
            <Chart samples={samples} pick={(s) => s.loopLagMs} label="Event-loop lag" unit="ms" kind="LIVE" />
            <Chart samples={samples} pick={(s) => s.heapMb} label="JS heap used" unit="MiB" kind="LIVE" format={(v) => v.toFixed(1)} />
            <Chart samples={samples} pick={(s) => s.simLoad} max={100} label="Scheduler load" unit="%" kind="SIMULATED" />
          </div>
          <p className="muted small note">
            Frame rate, event-loop lag and heap usage are measured from this browser tab. Scheduler load is a simulated figure derived
            from window count, event rate and lag — it is not a host CPU reading.
          </p>
          <div className="tiles compact">
            <div className="tile">
              <span className="tile-label">Session uptime</span>
              <span className="tile-value mono">{formatDuration(runtime.uptimeMs())}</span>
            </div>
            <div className="tile">
              <span className="tile-label">Events recorded</span>
              <span className="tile-value mono">{events.total}</span>
            </div>
            <div className="tile">
              <span className="tile-label">VFS size</span>
              <span className="tile-value mono">{formatBytes(runtime.fs.totalBytes())}</span>
            </div>
            <div className="tile">
              <span className="tile-label">Autosaves</span>
              <span className="tile-value mono">{persistence.saves}</span>
            </div>
          </div>
        </div>
      )}

      {tab === 'tasks' && (
        <div className="app-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Application</th>
                <th>Window</th>
                <th>State</th>
                <th>Running for</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {windows.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No applications running.
                  </td>
                </tr>
              )}
              {[...windows]
                .sort((a, b) => a.openedAt - b.openedAt)
                .map((w) => (
                  <tr key={w.id} className={w.id === focusedId ? 'row-focus' : ''}>
                    <td>
                      <span className="row gap-2">
                        <AppGlyph id={w.appId} size={15} /> {getApp(w.appId)?.name}
                      </span>
                    </td>
                    <td className="truncate" style={{ maxWidth: 220 }}>
                      {w.title}
                    </td>
                    <td>{w.minimized ? 'minimized' : w.id === focusedId ? 'focused' : w.maximized ? 'maximized' : 'open'}</td>
                    <td className="mono">{formatDuration(Date.now() - w.openedAt)}</td>
                    <td className="right">
                      <button className="btn small ghost" onClick={() => wm.focus(w.id)}>
                        Show
                      </button>
                      <button className="btn small ghost danger-text" onClick={() => wm.close(w.id)}>
                        End
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <h3 className="section-title">Event sources</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Events</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .map(([src, n]) => (
                  <tr key={src}>
                    <td className="mono">{src}</td>
                    <td className="mono">{n}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'environment' && (
        <div className="app-scroll">
          <table className="table kv-table">
            <tbody>
              <EnvRow label="Logical processors" value={info.logicalCores != null ? String(info.logicalCores) : null} hint="navigator.hardwareConcurrency" />
              <EnvRow label="Device memory" value={info.deviceMemoryGb != null ? `~${info.deviceMemoryGb} GiB (browser-rounded)` : null} hint="navigator.deviceMemory" />
              <EnvRow label="Screen" value={`${info.screen} @ ${info.pixelRatio}x`} />
              <EnvRow label="Platform" value={info.platform} />
              <EnvRow label="Language" value={info.language} />
              <EnvRow label="Network" value={info.online ? 'online' : 'offline'} hint="navigator.onLine" />
              <EnvRow
                label="Origin storage used"
                value={info.storageUsageMb != null ? `${info.storageUsageMb.toFixed(2)} MiB of ${info.storageQuotaMb?.toFixed(0)} MiB quota` : null}
                hint="navigator.storage.estimate()"
              />
              <EnvRow label="Persistence backend" value={persistence.backend} />
              <tr>
                <th>Kernel</th>
                <td>
                  lunar-core 0.1.0-sim <Badge kind="SIMULATED" />
                </td>
              </tr>
              <tr>
                <th>Physical CPU / RAM usage</th>
                <td>
                  Browsers do not expose host utilisation <Badge kind="UNAVAILABLE" />
                </td>
              </tr>
              <tr>
                <th>User agent</th>
                <td className="mono small break">{info.userAgent}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EnvRow({ label, value, hint }: { label: string; value: string | null; hint?: string }) {
  return (
    <tr>
      <th>{label}</th>
      <td>
        {value ?? <span className="muted">not exposed by this browser</span>} <Badge kind={value ? 'LIVE' : 'UNAVAILABLE'} title={hint} />
      </td>
    </tr>
  );
}
