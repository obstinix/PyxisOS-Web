import { useMemo, useState } from 'react';
import { AppProps } from './types';
import { useStore } from '../core/store';
import { events, EventLevel } from '../core/events';
import { BUILD_DATE, BUILD_NAME, CHANNEL, CODENAME, LICENSE, REPO_URL, SIM_KERNEL, VERSION } from '../core/version';
import { LIMITATIONS } from './SystemCenter';
import { Icon, PyxisMark } from '../shell/icons';

export function EventsApp(_: AppProps) {
  const log = useStore(events.store);
  const [level, setLevel] = useState<EventLevel | 'all'>('all');
  const [source, setSource] = useState('all');
  const [query, setQuery] = useState('');
  const sources = useMemo(() => [...new Set(log.map((e) => e.source))].sort(), [log]);
  const filtered = log
    .filter((e) => (level === 'all' || e.level === level) && (source === 'all' || e.source === source) && (!query || e.message.toLowerCase().includes(query.toLowerCase())))
    .slice()
    .reverse();

  const exportLog = () => {
    const text = log.map((e) => `${new Date(e.time).toISOString()} [${e.level}] ${e.source}: ${e.message}`).join('\n');
    const url = URL.createObjectURL(new Blob([text + '\n'], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pyxisos-events.log';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="events-app">
      <div className="toolbar">
        <select className="select" value={level} onChange={(e) => setLevel(e.target.value as EventLevel | 'all')} aria-label="Filter by level">
          <option value="all">All levels</option>
          <option value="info">Info</option>
          <option value="success">Success</option>
          <option value="warn">Warning</option>
          <option value="error">Error</option>
        </select>
        <select className="select" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Filter by source">
          <option value="all">All sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="search-field">
          <Icon.search size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter messages" aria-label="Filter messages" />
        </div>
        <span className="toolbar-spacer" />
        <button className="btn small" onClick={exportLog}>
          <Icon.download size={14} /> Export
        </button>
      </div>
      <div className="app-scroll">
        <table className="table events-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Level</th>
              <th>Source</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className={`ev-${e.level}`}>
                <td className="mono muted nowrap">{new Date(e.time).toLocaleTimeString()}</td>
                <td>
                  <span className={`lvl lvl-${e.level}`}>{e.level}</span>
                </td>
                <td className="mono">{e.source}</td>
                <td>{e.message}</td>
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
      <div className="statusbar small">
        <span>
          {filtered.length} of {log.length} shown · {events.total} recorded this session (most recent 300 kept)
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
      <p className="muted small">No analytics, tracking or remote requests are made by this application.</p>
    </div>
  );
}
