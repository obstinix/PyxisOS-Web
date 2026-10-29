import { useMemo, useState } from 'react';
import { AppProps } from './types';
import { useStore } from '../core/store';
import { events } from '../core/events';
import { correlate, CORRELATION_RULES } from '../core/correlation';
import { wm } from '../core/windows';
import { Icon } from '../shell/icons';
import { EmptyState, StatusDot } from '../shell/ui';

/** Event Correlation: deterministic grouping of journal events into incidents. */
export function CorrelationApp(_: AppProps) {
  const log = useStore(events.store);
  const incidents = useMemo(() => correlate(log), [log]);
  const [selected, setSelected] = useState<string | null>(null);
  const sel = incidents.find((i) => i.id === selected) ?? incidents[0];

  return (
    <div className="correlation">
      <div className="split">
        <div className="app-scroll split-list">
          {incidents.length === 0 && (
            <EmptyState icon={<Icon.check size={26} />} title="No related problems found">
              Incidents appear when warnings or errors match a rule below. To try it, inject a failure in the Service Manager.
            </EmptyState>
          )}
          {incidents.map((inc) => (
            <button key={inc.id} className={`check-row${sel?.id === inc.id ? ' active' : ''}`} onClick={() => setSelected(inc.id)}>
              <StatusDot status={inc.severity === 'error' ? 'err' : inc.severity === 'warn' ? 'warn' : 'ok'} />
              <span className="check-name">{inc.title}</span>
              <span className={`conf conf-${inc.confidence}`}>{inc.confidence}</span>
            </button>
          ))}
          <div className="pad">
            <h4 className="section-title">Rules</h4>
            <ul className="plain-list small">
              {CORRELATION_RULES.map((r) => (
                <li key={r.id}>
                  <span className="mono">{r.id}</span> ({r.confidence}) — {r.description}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <section className="split-detail" aria-label="Incident timeline">
          {sel ? (
            <>
              <h3>{sel.title}</h3>
              <dl className="kv">
                <dt>Rule</dt>
                <dd className="mono">{sel.rule}</dd>
                <dt>Confidence</dt>
                <dd>{sel.confidence}</dd>
                <dt>Span</dt>
                <dd>
                  {new Date(sel.firstAt).toLocaleTimeString()} – {new Date(sel.lastAt).toLocaleTimeString()} ({((sel.lastAt - sel.firstAt) / 1000).toFixed(1)} s)
                </dd>
                {sel.possibleCause && (
                  <>
                    <dt>Possible cause</dt>
                    <dd>{sel.possibleCause}</dd>
                  </>
                )}
                <dt>Why grouped</dt>
                <dd>{sel.explanation}</dd>
              </dl>
              <p className="muted small">Correlation shows that events are related by an explicit rule; it does not prove causation unless the evidence names the cause.</p>
              <h4 className="section-title">Timeline</h4>
              <ol className="incident-timeline">
                {sel.events.map((e) => (
                  <li key={e.id} className={`ev-${e.level}`}>
                    <span className="mono small muted">+{((e.time - sel.firstAt) / 1000).toFixed(2)} s</span>
                    <span className="mono small">{e.source}</span>
                    <span>{e.message}</span>
                    {e.data && <span className="mono small muted">{Object.entries(e.data).map(([k, v]) => `${k}=${v}`).join(' ')}</span>}
                  </li>
                ))}
              </ol>
              <button className="btn small" onClick={() => wm.open('events', { level: 'problems', source: sel.events[0].source })}>
                Open in System Journal
              </button>
            </>
          ) : (
            <p className="muted">Select an incident.</p>
          )}
        </section>
      </div>
    </div>
  );
}
