import { useState } from 'react';
import { AppProps } from './types';
import { useStore } from '../core/store';
import { activity } from '../core/intents';
import { audit } from '../core/aegis';
import { getAction } from '../core/actions';
import { wm } from '../core/windows';
import { Badge, confirmDialog, EmptyState, timeAgo, useNow } from '../shell/ui';

/** Assistant Activity & Permissions dashboard: what the assistant proposed, what ran and under which permission. */
export function ActivityApp(_: AppProps) {
  const log = useStore(activity);
  const auditLog = useStore(audit);
  const now = useNow(15000);
  const [status, setStatus] = useState<'all' | 'proposed' | 'completed' | 'refused'>('all');
  const shown = log.filter((r) => status === 'all' || (status === 'refused' ? ['denied', 'cancelled', 'failed', 'dismissed'].includes(r.status) : r.status === status));
  const counts = {
    proposed: log.length,
    completed: log.filter((r) => r.status === 'completed').length,
    denied: log.filter((r) => r.status === 'denied').length,
    pending: log.filter((r) => r.status === 'proposed').length,
  };
  const assistantAudit = auditLog.filter((a) => a.subject === 'astral');

  return (
    <div className="activity-app">
      <div className="tiles">
        <div className="tile">
          <div className="tile-label">Proposed actions</div>
          <div className="tile-value">{counts.proposed}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Completed</div>
          <div className="tile-value">{counts.completed}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Denied by Aegis</div>
          <div className="tile-value">{counts.denied}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Awaiting approval</div>
          <div className="tile-value">{counts.pending}</div>
        </div>
      </div>
      <div className="toolbar wrap">
        <div className="seg small" role="radiogroup" aria-label="Filter">
          {(['all', 'proposed', 'completed', 'refused'] as const).map((s) => (
            <button key={s} role="radio" aria-checked={status === s} className={status === s ? 'active' : undefined} onClick={() => setStatus(s)}>
              {s === 'all' ? 'All' : s === 'proposed' ? 'Proposed only' : s === 'completed' ? 'Completed' : 'Denied / cancelled'}
            </button>
          ))}
        </div>
        <span className="toolbar-spacer" />
        <button className="btn small" onClick={() => wm.open('astral')}>
          Open assistant
        </button>
        <button
          className="btn small ghost"
          disabled={!log.length}
          onClick={async () => {
            if (await confirmDialog('Clear assistant activity?', { message: `${log.length} records stored in this browser will be removed. The Aegis audit log is kept.`, confirmLabel: 'Clear', danger: true })) activity.set([]);
          }}
        >
          Clear
        </button>
      </div>
      <div className="app-scroll">
        {shown.length === 0 ? (
          <EmptyState title="No assistant activity">Ask Astral Intelligence to do something, e.g. “open the system monitor”. Proposed and completed actions are listed here.</EmptyState>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>You asked</th>
                <th>Proposed action</th>
                <th>Capability</th>
                <th>Status</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const auditRec = r.auditId ? auditLog.find((a) => a.id === r.auditId) : undefined;
                return (
                  <tr key={r.id}>
                    <td className="nowrap small muted">{timeAgo(r.time, now)}</td>
                    <td>“{r.input}”</td>
                    <td>
                      {getAction(r.actionId)?.title ?? r.actionId}
                      {r.arg ? ` — ${r.arg}` : ''}
                      <div className="muted small">pattern: {r.pattern}</div>
                    </td>
                    <td className="mono small">
                      {r.capability ?? '—'}
                      {r.destructive && <div className="danger-text">destructive</div>}
                    </td>
                    <td>
                      <span className={`lvl lvl-${r.status === 'completed' ? 'success' : r.status === 'proposed' ? 'info' : 'warn'}`}>{r.status}</span>
                    </td>
                    <td className="small">
                      {r.outcome ?? '—'}
                      {auditRec && <div className="muted">Aegis: {auditRec.decision} ({auditRec.basis})</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="pad">
          <h4 className="section-title">Assistant permission history</h4>
          {assistantAudit.length === 0 ? (
            <p className="muted small">No capability requests by the assistant yet.</p>
          ) : (
            <ul className="plain-list small">
              {assistantAudit.slice(0, 20).map((a) => (
                <li key={a.id}>
                  <span className="mono muted">{new Date(a.time).toLocaleTimeString()}</span> {a.capability} → <strong>{a.decision}</strong> ({a.basis})
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">
            <Badge kind="SIMULATED" /> The assistant is a deterministic, rule-based parser. Actions come from a fixed allowlist and run with app-level Aegis checks — not operating-system security.
          </p>
        </div>
      </div>
    </div>
  );
}
