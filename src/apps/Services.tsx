import { useState } from 'react';
import { AppProps } from './types';
import { useStore } from '../core/store';
import {
  dependents,
  failService,
  getDef,
  getServices,
  isRunning,
  restartService,
  SERVICE_DEFS,
  serviceConfig,
  serviceRuntime,
  setServiceEnabled,
  startService,
  stopService,
} from '../core/services';
import { request } from '../core/aegis';
import { events } from '../core/events';
import { runtime } from '../core/system';
import { Icon } from '../shell/icons';
import { Badge, confirmDialog, StatusDot, timeAgo, useNow } from '../shell/ui';

/** Service Manager: live subsystems (read-only) and simulated PyxisOS daemons (controllable). */
export function ServicesApp(_: AppProps) {
  const run = useStore(serviceRuntime);
  const cfg = useStore(serviceConfig);
  useStore(events.store);
  useStore(runtime.persistence);
  const now = useNow(5000);
  const [selected, setSelected] = useState('pyxis-netd');
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const services = getServices();
  const def = getDef(selected)!;
  const info = services.find((s) => s.id === selected)!;
  const r = run[selected];

  const act = async (label: string, fn: () => string | void, needsConfirm?: string) => {
    const rec = await request('system', 'services.control', `Service Manager: ${label} ${def.id}`);
    if (rec.decision === 'deny') {
      setMessage({ text: `Permission denied: ${rec.reason}`, ok: false });
      return;
    }
    if (needsConfirm && !(await confirmDialog(`${label} ${def.name}?`, { message: needsConfirm, confirmLabel: label, danger: true }))) return;
    try {
      const out = fn();
      setMessage({ text: out || `${label} ${def.name}: done`, ok: true });
    } catch (e) {
      setMessage({ text: (e as Error).message, ok: false });
    }
  };

  const running = dependents(selected).filter((d) => isRunning(d.id));
  const missingDeps = def.deps.filter((d) => !isRunning(d));
  const history = events.all.filter((e) => e.source === 'services' && e.data?.service === selected).slice(-8).reverse();

  return (
    <div className="services-app">
      <div className="split">
        <div className="app-scroll split-list">
          <table className="table">
            <thead>
              <tr>
                <th>Service</th>
                <th>State</th>
                <th>Startup</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => {
                const d = getDef(s.id)!;
                return (
                  <tr key={s.id} className={selected === s.id ? 'row-focus' : ''} tabIndex={0} aria-selected={selected === s.id} onClick={() => setSelected(s.id)} onKeyDown={(e) => e.key === 'Enter' && setSelected(s.id)}>
                    <td>
                      <StatusDot status={s.status} /> <span className="mono">{s.id}</span>
                    </td>
                    <td className="small">{s.state}</td>
                    <td className="small">{d.controllable ? (cfg[s.id]?.enabled ? 'enabled' : 'disabled') : '—'}</td>
                    <td>
                      <Badge kind={s.kind} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <section className="split-detail" aria-label="Service details">
          <div className="row gap-2">
            <h3 className="mono">{def.id}</h3>
            <Badge kind={def.kind} />
          </div>
          <p>{def.description}</p>
          <dl className="kv">
            <dt>State</dt>
            <dd>{info.state}</dd>
            {r && (
              <>
                <dt>Since</dt>
                <dd>{timeAgo(r.since, now)}</dd>
                <dt>Restarts</dt>
                <dd>{r.restarts}</dd>
              </>
            )}
            <dt>Requires</dt>
            <dd>{def.deps.length ? def.deps.map((d) => `${d}${isRunning(d) ? '' : ' (not running)'}`).join(', ') : 'nothing'}</dd>
            <dt>Required by</dt>
            <dd>{dependents(def.id).map((d) => d.id).join(', ') || 'nothing'}</dd>
            {def.affects && (
              <>
                <dt>Effect in demo</dt>
                <dd>{def.affects}</dd>
              </>
            )}
          </dl>
          {def.controllable ? (
            <>
              <div className="row gap-2 wrap">
                <button
                  className="btn small"
                  disabled={isRunning(def.id)}
                  onClick={() =>
                    void act(
                      'Start',
                      () => {
                        const started = startService(def.id, { cascade: true, actor: 'service-manager' });
                        return `Started ${started.join(', ')}`;
                      },
                      undefined,
                    )
                  }
                >
                  <Icon.play size={13} /> Start{missingDeps.length ? ' with dependencies' : ''}
                </button>
                <button
                  className="btn small"
                  disabled={!isRunning(def.id) && r?.state !== 'failed'}
                  onClick={() =>
                    void act(
                      'Stop',
                      () => `Stopped ${stopService(def.id, { cascade: true, actor: 'service-manager' }).join(', ')}`,
                      running.length ? `${running.map((d) => d.id).join(', ')} depend${running.length === 1 ? 's' : ''} on it and will be stopped too.` : undefined,
                    )
                  }
                >
                  <Icon.stop size={13} /> Stop
                </button>
                <button className="btn small" onClick={() => void act('Restart', () => restartService(def.id, { actor: 'service-manager' }))}>
                  <Icon.refresh size={13} /> Restart
                </button>
                <label className="check small">
                  <input type="checkbox" checked={!!cfg[def.id]?.enabled} onChange={(e) => void act(e.target.checked ? 'Enable' : 'Disable', () => setServiceEnabled(def.id, e.target.checked, 'service-manager'))} /> Start at boot
                </label>
                <button
                  className="btn small ghost danger-text"
                  disabled={!isRunning(def.id)}
                  onClick={() =>
                    void act('Simulate failure of', () => failService(def.id, 'simulated crash (injected from Service Manager)', 'service-manager'), 'This injects a simulated crash for testing diagnostics and event correlation. Dependent services fail too. Nothing on your computer is affected.')
                  }
                >
                  <Icon.alert size={13} /> Inject failure
                </button>
              </div>
              <p className="muted small">Actions change the simulation model and are recorded in the System Journal. No operating-system process is started or stopped.</p>
            </>
          ) : (
            <p className="muted small">{def.kind === 'LIVE' ? 'This is a real subsystem of the web demo; its state is shown live but it cannot be stopped from here.' : 'Not available in the browser build.'}</p>
          )}
          {message && (
            <div className={`banner ${message.ok ? '' : 'banner-err'} small`} role="status">
              {message.text}
            </div>
          )}
          {history.length > 0 && (
            <>
              <h4 className="section-title">Recent events</h4>
              <ul className="plain-list small">
                {history.map((e) => (
                  <li key={e.id}>
                    <span className="mono muted">{new Date(e.time).toLocaleTimeString()}</span> {e.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
      <div className="statusbar small">
        {SERVICE_DEFS.filter((d) => d.controllable && isRunning(d.id)).length} of {SERVICE_DEFS.filter((d) => d.controllable).length} simulated services running · control requires Aegis capability services.control
      </div>
    </div>
  );
}
