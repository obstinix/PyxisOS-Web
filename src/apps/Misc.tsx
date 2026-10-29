import { Fragment, useEffect, useMemo, useState } from 'react';
import { AppProps } from './types';
import { useStore } from '../core/store';
import { events, EventLevel, formatEvents } from '../core/events';
import { Badge, copyText, downloadText } from '../shell/ui';
import { BUILD_DATE, BUILD_NAME, CHANNEL, CODENAME, LICENSE, REPO_URL, SIM_KERNEL, VERSION } from '../core/version';
import { LIMITATIONS } from './SystemCenter';
import { Icon, PyxisMark } from '../shell/icons';

export function EventsApp({ win }: AppProps) {
  const log = useStore(events.store);
  const initialLevel = win.props.level === 'problems' ? 'problems' : 'all';
  const [level, setLevel] = useState<EventLevel | 'all' | 'problems'>(initialLevel);
  const [source, setSource] = useState(typeof win.props.source === 'string' && win.props.source ? win.props.source : 'all');
  const [kind, setKind] = useState<'all' | 'actual' | 'simulated'>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  // Re-apply filters when another app opens the journal with new ones.
  useEffect(() => {
    if (win.props.level !== undefined) setLevel(win.props.level === 'problems' ? 'problems' : 'all');
    if (win.props.source !== undefined) setSource(typeof win.props.source === 'string' && win.props.source ? win.props.source : 'all');
  }, [win.props]);

  const sources = useMemo(() => [...new Set(log.map((e) => e.source))].sort(), [log]);
  const q = query.toLowerCase();
  const filtered = log
    .filter(
      (e) =>
        (level === 'all' || (level === 'problems' ? e.level === 'warn' || e.level === 'error' : e.level === level)) &&
        (source === 'all' || e.source === source) &&
        (kind === 'all' || (kind === 'simulated') === !!e.simulated) &&
        (!q || e.message.toLowerCase().includes(q) || e.source.includes(q) || JSON.stringify(e.data ?? {}).toLowerCase().includes(q)),
    )
    .slice()
    .reverse();
  const sel = selected !== null ? log.find((e) => e.id === selected) : undefined;

  const copy = async () => {
    setCopied(await copyText(formatEvents(filtered.slice().reverse())));
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="events-app">
      <div className="toolbar wrap">
        <select className="select" value={level} onChange={(e) => setLevel(e.target.value as EventLevel | 'all' | 'problems')} aria-label="Filter by severity">
          <option value="all">All severities</option>
          <option value="problems">Warnings + errors</option>
          <option value="info">Info</option>
          <option value="success">Success</option>
          <option value="warn">Warning</option>
          <option value="error">Error</option>
        </select>
        <select className="select" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Filter by component">
          <option value="all">All components</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value as 'all' | 'actual' | 'simulated')} aria-label="Actual or simulated">
          <option value="all">Actual + simulated</option>
          <option value="actual">Actual events only</option>
          <option value="simulated">Simulated events only</option>
        </select>
        <div className="search-field">
          <Icon.search size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search messages and details" aria-label="Search journal" />
        </div>
        <span className="toolbar-spacer" />
        <button className="btn small" onClick={() => void copy()} disabled={!filtered.length}>
          <Icon.copy size={14} /> {copied ? 'Copied' : 'Copy'}
        </button>
        <button className="btn small" onClick={() => downloadText('pyxisos-journal.log', formatEvents(filtered.slice().reverse()) + '\n')} disabled={!filtered.length}>
          <Icon.download size={14} /> Export
        </button>
      </div>
      <div className="split">
        <div className="app-scroll split-list">
          <table className="table events-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Severity</th>
                <th>Component</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr
                  key={e.id}
                  className={`ev-${e.level}${selected === e.id ? ' row-focus' : ''}`}
                  tabIndex={0}
                  aria-selected={selected === e.id}
                  onClick={() => setSelected(e.id)}
                  onKeyDown={(k) => k.key === 'Enter' && setSelected(e.id)}
                >
                  <td className="mono muted nowrap">{new Date(e.time).toLocaleTimeString()}</td>
                  <td>
                    <span className={`lvl lvl-${e.level}`}>{e.level}</span>
                  </td>
                  <td className="mono">{e.source}</td>
                  <td>
                    {e.message} {e.simulated && <Badge kind="SIMULATED" />}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    No events match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {sel && (
          <aside className="split-detail" aria-label="Event details">
            <div className="row gap-2">
              <strong>Event #{sel.id}</strong>
              <span className="toolbar-spacer" />
              <button className="wc" aria-label="Close details" onClick={() => setSelected(null)}>
                <Icon.close size={13} />
              </button>
            </div>
            <dl className="kv">
              <dt>Time</dt>
              <dd className="mono">{new Date(sel.time).toISOString()}</dd>
              <dt>Severity</dt>
              <dd>{sel.level}</dd>
              <dt>Component</dt>
              <dd className="mono">{sel.source}</dd>
              <dt>Nature</dt>
              <dd>{sel.simulated ? 'Simulated — describes the PyxisOS model, not a real host operation' : 'Actual — recorded by a real operation of the web demo'}</dd>
              <dt>Message</dt>
              <dd>{sel.message}</dd>
              {sel.data &&
                Object.entries(sel.data).map(([k, v]) => (
                  <Fragment key={k}>
                    <dt>{k}</dt>
                    <dd className="mono">{String(v)}</dd>
                  </Fragment>
                ))}
            </dl>
          </aside>
        )}
      </div>
      <div className="statusbar small">
        <span>
          {filtered.length} of {log.length} shown · {events.total} recorded this session (most recent 500 kept)
        </span>
      </div>
    </div>
  );
}

export function AboutApp(_: AppProps) {
  return (
    <div className="app-scroll about">
      <div className="about-head">
        <PyxisMark size={56} />
        <div>
          <div className="eyebrow">
            {CODENAME} // {CHANNEL}
          </div>
          <h1>PyxisOS</h1>
          <div className="mono muted">VERSION {VERSION}</div>
        </div>
      </div>
      <p>
        {BUILD_NAME} is a browser-based simulation of the PyxisOS desktop. It demonstrates the desktop experience and system concepts
        while the native operating system continues development.
      </p>
      <dl className="kv">
        <dt>Build</dt>
        <dd>
          {BUILD_NAME} {VERSION} ({BUILD_DATE})
        </dd>
        <dt>Kernel</dt>
        <dd>
          {SIM_KERNEL.name} {SIM_KERNEL.release} — simulation label, not a running kernel
        </dd>
        <dt>License</dt>
        <dd>{LICENSE} — GNU Affero General Public License v3.0</dd>
        <dt>Source</dt>
        <dd>
          <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
            {REPO_URL.replace('https://', '')}
          </a>
        </dd>
        <dt>Fonts</dt>
        <dd>IBM Plex Sans and IBM Plex Mono (SIL Open Font License 1.1), bundled locally</dd>
        <dt>Inspiration</dt>
        <dd>
          Desktop concepts inspired by{' '}
          <a href="https://github.com/nautilus-os/NautilusOS" target="_blank" rel="noreferrer noopener">
            NautilusOS
          </a>{' '}
          (AGPL-3.0). See the README for provenance.
        </dd>
      </dl>
      <h3>Simulation boundaries</h3>
      <ul className="limits">
        {LIMITATIONS.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p className="muted small">No analytics or tracking. The only network requests are the pages and search APIs you load in Pyxis Browser.</p>
    </div>
  );
}
