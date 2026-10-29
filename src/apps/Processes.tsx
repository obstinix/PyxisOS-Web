import { useMemo, useState } from 'react';
import { AppProps } from './types';
import { useStore } from '../core/store';
import { wm } from '../core/windows';
import { serviceRuntime } from '../core/services';
import { endProcess, listProcesses, ProcInfo } from '../core/processes';
import { browserState } from '../core/browser';
import { Icon } from '../shell/icons';
import { Badge, confirmDialog, useNow } from '../shell/ui';

type SortKey = 'pid' | 'name' | 'cpu' | 'memKiB' | 'state';

/** Process Explorer: tree of demo processes. Resource figures are simulated estimates. */
export function ProcessesApp(_: AppProps) {
  useStore(wm.store);
  useStore(serviceRuntime);
  useStore(browserState);
  const now = useNow(2000);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'pid', dir: 1 });
  const [tree, setTree] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const procs = listProcesses(now);

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    const match = (p: ProcInfo) => !q || p.name.toLowerCase().includes(q) || String(p.pid) === q || p.detail.toLowerCase().includes(q);
    const cmp = (a: ProcInfo, b: ProcInfo) => {
      const va = a[sort.key];
      const vb = b[sort.key];
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * sort.dir;
    };
    if (!tree || q) return procs.filter(match).sort(cmp).map((p) => ({ p, depth: 0 }));
    const out: { p: ProcInfo; depth: number }[] = [];
    const walk = (ppid: number, depth: number) => {
      procs
        .filter((p) => p.ppid === ppid)
        .sort(cmp)
        .forEach((p) => {
          out.push({ p, depth });
          walk(p.pid, depth + 1);
        });
    };
    walk(0, 0);
    return out;
  }, [procs, query, sort, tree]);

  const sel = procs.find((p) => p.pid === selected);
  const header = (key: SortKey, label: string) => (
    <th aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button className="th-sort" onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : 1 }))}>
        {label} {sort.key === key ? (sort.dir === 1 ? '▲' : '▼') : ''}
      </button>
    </th>
  );

  const end = async (p: ProcInfo) => {
    if (!(await confirmDialog(`End ${p.name} (PID ${p.pid})?`, { message: p.windowId ? 'The window closes. Apps with unsaved changes will ask first.' : 'The simulated service stops (and services that depend on it).', confirmLabel: 'End process', danger: true }))) return;
    setMessage(endProcess(p.pid).message);
  };

  return (
    <div className="processes-app">
      <div className="toolbar wrap">
        <div className="search-field">
          <Icon.search size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by name or PID" aria-label="Filter processes" />
        </div>
        <label className="check small">
          <input type="checkbox" checked={tree} onChange={(e) => setTree(e.target.checked)} /> Tree view
        </label>
        <span className="toolbar-spacer" />
        <span className="small muted">{procs.length} processes</span>
        <Badge kind="SIMULATED" title="CPU and memory are deterministic estimates, not host measurements" />
      </div>
      <div className="split">
        <div className="app-scroll split-list">
          <table className="table proc-table">
            <thead>
              <tr>
                {header('pid', 'PID')}
                {header('name', 'Name')}
                {header('state', 'State')}
                {header('cpu', 'CPU %')}
                {header('memKiB', 'Memory')}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, depth }) => (
                <tr key={p.pid} className={selected === p.pid ? 'row-focus' : ''} tabIndex={0} aria-selected={selected === p.pid} onClick={() => setSelected(p.pid)} onKeyDown={(e) => e.key === 'Enter' && setSelected(p.pid)}>
                  <td className="mono">{p.pid}</td>
                  <td>
                    <span style={{ paddingLeft: depth * 14 }} className="mono">
                      {depth > 0 && <span className="muted">└ </span>}
                      {p.name}
                    </span>
                  </td>
                  <td className={`small proc-${p.state}`}>{p.state}</td>
                  <td className="mono right">{p.cpu.toFixed(1)}</td>
                  <td className="mono right">{(p.memKiB / 1024).toFixed(1)} MiB</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section className="split-detail" aria-label="Process details">
          {sel ? (
            <>
              <div className="row gap-2">
                <h3 className="mono">{sel.name}</h3>
                <Badge kind={sel.kind} title={sel.kind === 'LIVE' ? 'A real object in the web demo' : 'Modelled process'} />
              </div>
              <dl className="kv">
                <dt>PID / parent</dt>
                <dd className="mono">
                  {sel.pid} / {sel.ppid}
                </dd>
                <dt>Type</dt>
                <dd>{sel.type}</dd>
                <dt>State</dt>
                <dd>{sel.state}</dd>
                <dt>Detail</dt>
                <dd>{sel.detail}</dd>
                <dt>Started</dt>
                <dd>{sel.started ? new Date(sel.started).toLocaleTimeString() : 'at boot'}</dd>
                <dt>Resources</dt>
                <dd>
                  {sel.cpu.toFixed(1)}% CPU, {(sel.memKiB / 1024).toFixed(1)} MiB — simulated estimate
                </dd>
                <dt>Children</dt>
                <dd>{procs.filter((p) => p.ppid === sel.pid).map((p) => `${p.name} (${p.pid})`).join(', ') || 'none'}</dd>
              </dl>
              <div className="row gap-2">
                {sel.windowId && (
                  <button className="btn small" onClick={() => wm.focus(sel.windowId!)}>
                    Show window
                  </button>
                )}
                <button className="btn small danger" onClick={() => void end(sel)} disabled={sel.type === 'kernel' || sel.type === 'shell' || sel.type === 'tab'}>
                  End process
                </button>
              </div>
              {message && (
                <p className="note small" role="status">
                  {message}
                </p>
              )}
            </>
          ) : (
            <p className="muted">Select a process. Windows and browser tabs are real objects in this web app; kernel and daemon entries model PyxisOS. No host processes are listed or controlled.</p>
          )}
        </section>
      </div>
    </div>
  );
}
