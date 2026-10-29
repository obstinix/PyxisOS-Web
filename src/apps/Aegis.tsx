import { useState } from 'react';
import { AppProps } from './types';
import { useStore } from '../core/store';
import { APPS, AppId } from '../core/apps';
import { ALL_CAPABILITIES, Capability, CAPABILITIES } from '../core/capabilities';
import { audit, clearAudit, declared, policy, PolicyRule, request, ruleFor, setRule } from '../core/aegis';
import { isRunning, serviceRuntime } from '../core/services';
import { wm } from '../core/windows';
import { Badge, confirmDialog, EmptyState, timeAgo, useNow } from '../shell/ui';

type Tab = 'apps' | 'audit' | 'test' | 'about';

/** Aegis Security Center: capability declarations, policy overrides and the audit log. */
export function AegisApp(_: AppProps) {
  const [tab, setTab] = useState<Tab>('apps');
  useStore(policy);
  useStore(serviceRuntime);
  const daemon = isRunning('aegis-policyd');
  return (
    <div className="aegis">
      <div className="toolbar wrap">
        <div className="seg small" role="tablist" aria-label="Aegis views">
          {(
            [
              ['apps', 'App permissions'],
              ['audit', 'Audit log'],
              ['test', 'Request simulator'],
              ['about', 'Security model'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : undefined} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <span className="toolbar-spacer" />
        <span className="small">
          aegis-policyd: <strong>{daemon ? 'running' : 'stopped — failing closed'}</strong>
        </span>
        <Badge kind="SIMULATED" title="Application-level policy inside PyxisOS-Web, not kernel isolation" />
      </div>
      {!daemon && (
        <div className="banner banner-warn small">
          The policy daemon is stopped, so every app capability request is denied.{' '}
          <button className="linklike" onClick={() => wm.open('services')}>
            Start it in Service Manager
          </button>
        </div>
      )}
      <div className="app-scroll pad">
        {tab === 'apps' && <AppPermissions />}
        {tab === 'audit' && <AuditLog />}
        {tab === 'test' && <Simulator />}
        {tab === 'about' && <Model />}
      </div>
    </div>
  );
}

function AppPermissions() {
  const [app, setApp] = useState<AppId>('astral');
  const apps = APPS.filter((a) => a.capabilities.length > 0);
  return (
    <div className="aegis-perms">
      <nav className="settings-nav" aria-label="Applications">
        {apps.map((a) => (
          <button key={a.id} className={`side-item${app === a.id ? ' active' : ''}`} onClick={() => setApp(a.id)}>
            {a.name} <span className="muted small">{a.capabilities.length}</span>
          </button>
        ))}
      </nav>
      <table className="table">
        <thead>
          <tr>
            <th>Capability</th>
            <th>Declared</th>
            <th>Risk</th>
            <th>Policy</th>
          </tr>
        </thead>
        <tbody>
          {ALL_CAPABILITIES.map((c) => {
            const isDeclared = declared(app, c);
            const rule = ruleFor(app, c);
            return (
              <tr key={c}>
                <td>
                  <span className="mono">{c}</span>
                  <div className="muted small">{CAPABILITIES[c].description}</div>
                </td>
                <td>{isDeclared ? 'yes' : <span className="muted">no</span>}</td>
                <td className={`risk-${CAPABILITIES[c].risk}`}>{CAPABILITIES[c].risk}</td>
                <td>
                  {isDeclared ? (
                    <select
                      className="select"
                      aria-label={`Policy for ${c}`}
                      value={rule === 'declared' ? 'default' : rule}
                      onChange={async (e) => {
                        const v = e.target.value;
                        if (v === 'allow' && CAPABILITIES[c].risk === 'high' && !(await confirmDialog(`Always allow ${c}?`, { message: 'This is a high-risk capability. The app will no longer need your approval for it.', confirmLabel: 'Always allow', danger: true }))) return;
                        setRule(app, c, v === 'default' ? null : (v as PolicyRule));
                      }}
                    >
                      <option value="default">Default (allow, declared)</option>
                      <option value="allow">Always allow</option>
                      <option value="ask">Ask every time</option>
                      <option value="deny">Deny</option>
                    </select>
                  ) : (
                    <span className="muted small">denied — not declared</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AuditLog() {
  const log = useStore(audit);
  const now = useNow(15000);
  const [onlyDenied, setOnlyDenied] = useState(false);
  const shown = log.filter((r) => !onlyDenied || r.decision === 'deny');
  return (
    <>
      <div className="row gap-2">
        <label className="check small">
          <input type="checkbox" checked={onlyDenied} onChange={(e) => setOnlyDenied(e.target.checked)} /> Only denials
        </label>
        <span className="toolbar-spacer" />
        <button
          className="btn small ghost"
          disabled={!log.length}
          onClick={async () => {
            if (await confirmDialog('Clear the audit log?', { message: `${log.length} records will be removed from this browser.`, confirmLabel: 'Clear', danger: true })) clearAudit();
          }}
        >
          Clear log
        </button>
      </div>
      {shown.length === 0 ? (
        <EmptyState title="No audit records">Capability requests appear here as apps make them.</EmptyState>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Subject</th>
              <th>Capability</th>
              <th>Decision</th>
              <th>Basis</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className={r.decision === 'deny' ? 'ev-warn' : ''}>
                <td className="nowrap small muted">{timeAgo(r.time, now)}</td>
                <td className="mono">{r.subject}</td>
                <td className="mono">{r.capability}</td>
                <td>
                  <span className={`lvl lvl-${r.decision === 'allow' ? 'success' : 'warn'}`}>{r.decision}</span>
                </td>
                <td className="small">{r.basis}</td>
                <td className="small">{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Simulator() {
  const [app, setApp] = useState<AppId>('about');
  const [cap, setCap] = useState<Capability>('fs.write');
  const [result, setResult] = useState<string | null>(null);
  return (
    <div className="guide-form">
      <p className="muted small">Send a capability request through the broker exactly as an app would. The decision and its basis are recorded in the audit log.</p>
      <div className="row gap-2 wrap">
        <select className="select" value={app} onChange={(e) => setApp(e.target.value as AppId)} aria-label="Requesting app">
          {APPS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select className="select" value={cap} onChange={(e) => setCap(e.target.value as Capability)} aria-label="Capability">
          {ALL_CAPABILITIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button
          className="btn primary small"
          onClick={async () => {
            const r = await request(app, cap, 'Request simulator');
            setResult(`${r.decision.toUpperCase()} (${r.basis}) — ${r.reason}`);
          }}
        >
          Send request
        </button>
      </div>
      {result && (
        <p className="note" role="status">
          {result}
        </p>
      )}
    </div>
  );
}

function Model() {
  return (
    <div className="prose">
      <h3>What Aegis is in PyxisOS</h3>
      <p>
        In the native PyxisOS project, Aegis is a <strong>planned</strong> capability-based security layer: unforgeable capability tokens with rights such as READ, WRITE, MAP_PHYSICAL, DEVICE_IO and DELEGATE, where a delegated token can never carry more rights than its parent (
        <span className="mono">native/aegis/src/capability.rs</span>). It is not implemented as a running hypervisor.
      </p>
      <h3>What this Security Center does</h3>
      <ul className="plain-list">
        <li>Each app declares the capabilities it needs in the app registry. Undeclared capabilities are always denied, and policy overrides cannot grant them — the same no-escalation idea as token delegation.</li>
        <li>PyxisOS-Web's own code asks the broker before sensitive operations (browser navigation, assistant actions, service control by apps) and records every decision.</li>
        <li>
          If the simulated <span className="mono">aegis-policyd</span> service is stopped, the broker fails closed.
        </li>
      </ul>
      <h3>What it is not</h3>
      <p>
        These checks run inside one web page. They are not kernel isolation, not a sandbox, and not a substitute for the browser's or operating system's security. Actions you take directly in the desktop are recorded as <span className="mono">system / direct</span> and are not blocked.
      </p>
    </div>
  );
}
