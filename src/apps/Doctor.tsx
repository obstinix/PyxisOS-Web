import { useEffect, useState } from 'react';
import { AppProps } from './types';
import { useStore } from '../core/store';
import { CheckResult, diagnosticsStore, formatReport, runDiagnostics } from '../core/diagnostics';
import { getAction, runAction } from '../core/actions';
import { runtime } from '../core/system';
import { HOME } from '../core/path';
import { wm } from '../core/windows';
import { AppId, getApp } from '../core/apps';
import { notifications } from '../core/notifications';
import { Icon } from '../shell/icons';
import { Badge, downloadText, EmptyState, StatusDot } from '../shell/ui';

const TONE = { pass: 'ok', warn: 'warn', fail: 'err', skip: 'muted' } as const;

/** System Doctor: explainable, re-runnable diagnostics with remediation and export. */
export function DoctorApp(_: AppProps) {
  const report = useStore(diagnosticsStore);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'problems'>('all');

  const run = async () => {
    setBusy(true);
    try {
      await runDiagnostics();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!report) void run();
  }, []);

  useEffect(() => {
    if (report && !selected) setSelected((report.results.find((r) => r.status === 'fail' || r.status === 'warn') ?? report.results[0])?.id ?? null);
  }, [report, selected]);

  const results = (report?.results ?? []).filter((r) => filter === 'all' || r.status === 'warn' || r.status === 'fail');
  const sel = report?.results.find((r) => r.id === selected);

  const saveToFiles = () => {
    if (!report) return;
    const path = `${HOME}/Documents/${runtime.fs.uniqueName(`${HOME}/Documents`, `diagnostics-${new Date(report.ranAt).toISOString().slice(0, 10)}.txt`)}`;
    try {
      runtime.fs.writeFile(path, formatReport(report));
      notifications.notify('Report saved', path, 'success', 'doctor');
    } catch (e) {
      notifications.notify('Could not save report', (e as Error).message, 'error', 'doctor');
    }
  };

  return (
    <div className="doctor">
      <div className="toolbar wrap">
        <button className="btn primary small" onClick={() => void run()} disabled={busy}>
          <Icon.refresh size={14} /> {busy ? 'Running…' : 'Run checks again'}
        </button>
        <div className="seg small" role="radiogroup" aria-label="Filter checks">
          <button role="radio" aria-checked={filter === 'all'} className={filter === 'all' ? 'active' : undefined} onClick={() => setFilter('all')}>
            All
          </button>
          <button role="radio" aria-checked={filter === 'problems'} className={filter === 'problems' ? 'active' : undefined} onClick={() => setFilter('problems')}>
            Problems
          </button>
        </div>
        {report && (
          <span className="small muted">
            {report.summary.pass} pass · {report.summary.warn} warn · {report.summary.fail} fail · {report.summary.skip} skip — {new Date(report.ranAt).toLocaleTimeString()}
          </span>
        )}
        <span className="toolbar-spacer" />
        <button className="btn small" onClick={saveToFiles} disabled={!report}>
          <Icon.save size={14} /> Save to Documents
        </button>
        <button className="btn small" onClick={() => report && downloadText('pyxisos-diagnostics.txt', formatReport(report))} disabled={!report}>
          <Icon.download size={14} /> Export
        </button>
      </div>
      <div className="split">
        <div className="app-scroll split-list" role="listbox" aria-label="Checks">
          {results.map((r) => (
            <button key={r.id} role="option" aria-selected={selected === r.id} className={`check-row${selected === r.id ? ' active' : ''}`} onClick={() => setSelected(r.id)}>
              <StatusDot status={TONE[r.status]} />
              <span className="check-name">{r.name}</span>
              <span className={`lvl lvl-${r.status === 'fail' ? 'error' : r.status === 'warn' ? 'warn' : r.status === 'pass' ? 'success' : 'info'}`}>{r.status}</span>
            </button>
          ))}
          {report && !results.length && <EmptyState icon={<Icon.check size={24} />} title="No problems">Every check passed or was skipped.</EmptyState>}
          {!report && <div className="muted pad">Running checks…</div>}
        </div>
        <section className="split-detail doctor-detail" aria-label="Check explanation">
          {sel ? <Explain r={sel} onRerun={run} /> : <EmptyState title="Select a check" />}
        </section>
      </div>
      <div className="statusbar small">Checks execute in your browser against the web demo. They do not test hardware or a native kernel.</div>
    </div>
  );
}

function Explain({ r, onRerun }: { r: CheckResult; onRerun: () => Promise<void> }) {
  const [outcome, setOutcome] = useState<string | null>(null);
  const action = r.explain.actionId ? getAction(r.explain.actionId) : undefined;
  useEffect(() => setOutcome(null), [r.id]);
  const remediate = async () => {
    if (!action) return;
    const res = await runAction(action.id, r.explain.actionArg, 'system');
    setOutcome(res.message);
    if (res.ok) await onRerun();
  };
  return (
    <div className="explain">
      <div className="row gap-2">
        <h3>{r.name}</h3>
        {r.simulated ? <Badge kind="SIMULATED" title="Inspects the simulation model" /> : <Badge kind="LIVE" title="Inspects a real subsystem of the web demo" />}
      </div>
      <dl className="kv">
        <dt>Result</dt>
        <dd>
          <strong>{r.status.toUpperCase()}</strong> · severity {r.severity} · {r.durationMs.toFixed(1)} ms
        </dd>
        <dt>Evidence</dt>
        <dd className="mono">{r.detail}</dd>
        <dt>What was checked</dt>
        <dd>{r.explain.what}</dd>
        <dt>Why it matters</dt>
        <dd>{r.explain.why}</dd>
        <dt>Condition</dt>
        <dd>{r.explain.condition}</dd>
        <dt>Remediation</dt>
        <dd>{r.status === 'pass' ? 'Nothing to do.' : r.explain.remediation}</dd>
      </dl>
      <div className="row gap-2 wrap">
        {action && (r.status === 'warn' || r.status === 'fail') && (
          <button className="btn primary small" onClick={() => void remediate()}>
            {action.title}
            {r.explain.actionArg ? `: ${r.explain.actionArg}` : ''}
          </button>
        )}
        {r.explain.app && (
          <button className="btn small" onClick={() => wm.open(r.explain.app as AppId)}>
            Open {getApp(r.explain.app)?.name}
          </button>
        )}
        <button className="btn small ghost" onClick={() => wm.open('events', { level: '', source: r.category === 'services' ? 'services' : 'diagnostics' })}>
          View related journal events
        </button>
      </div>
      {outcome && (
        <p className="note" role="status">
          {outcome}
        </p>
      )}
      {action && (r.status === 'warn' || r.status === 'fail') && (
        <p className="muted small">The fix is an allowlisted action you trigger directly; it is recorded in the Aegis audit log{action.destructive ? ' and asks for confirmation first' : ''}.</p>
      )}
    </div>
  );
}
