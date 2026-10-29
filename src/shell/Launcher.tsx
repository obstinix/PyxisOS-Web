import { useEffect, useMemo, useRef, useState } from 'react';
import { APPS, AppId, searchApps } from '../core/apps';
import { wm } from '../core/windows';
import { runtime } from '../core/system';
import { displayPath, HOME } from '../core/path';
import { AppTile, Icon } from './icons';

type Result = { kind: 'app'; id: AppId; title: string; subtitle: string } | { kind: 'file'; path: string; title: string; subtitle: string; dir: boolean };

export function Launcher({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const results: Result[] = useMemo(() => {
    const apps: Result[] = searchApps(query).map((a) => ({ kind: 'app', id: a.id, title: a.name, subtitle: a.description }));
    if (!query.trim()) return apps;
    const files: Result[] = runtime.fs
      .search(query.trim(), HOME, { limit: 6 })
      .map((e) => ({ kind: 'file', path: e.path, title: e.name, subtitle: displayPath(e.path), dir: e.type === 'dir' }));
    return [...apps, ...files];
  }, [query]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const launch = (r: Result | undefined) => {
    if (!r) return;
    if (r.kind === 'app') wm.open(r.id);
    else wm.open(r.dir ? 'files' : 'editor', { path: r.path });
    onClose();
  };

  const appCount = results.filter((r) => r.kind === 'app').length;

  return (
    <div className="launcher-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="launcher" role="dialog" aria-modal="true" aria-label="Application launcher">
        <div className="launcher-search">
          <Icon.search size={16} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search applications and files"
            aria-label="Search applications and files"
            aria-controls="launcher-results"
            aria-activedescendant={results[active] ? `launcher-item-${active}` : undefined}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(results.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter') {
                launch(results[active]);
              }
            }}
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="launcher-results" id="launcher-results" role="listbox" ref={listRef}>
          {appCount > 0 && <div className="launcher-section">{query ? 'Applications' : `All applications · ${APPS.length}`}</div>}
          {results.map((r, i) => (
            <div key={r.kind === 'app' ? r.id : r.path}>
              {i === appCount && <div className="launcher-section">Files in home</div>}
              <button
                id={`launcher-item-${i}`}
                data-index={i}
                role="option"
                aria-selected={i === active}
                className={`launcher-item${i === active ? ' active' : ''}`}
                onPointerMove={() => setActive(i)}
                onClick={() => launch(r)}
                tabIndex={-1}
              >
                {r.kind === 'app' ? (
                  <AppTile id={r.id} size={34} />
                ) : (
                  <span className="file-tile">{r.dir ? <Icon.folder size={18} /> : <Icon.fileText size={18} />}</span>
                )}
                <span className="launcher-text">
                  <strong>{r.title}</strong>
                  <span>{r.subtitle}</span>
                </span>
              </button>
            </div>
          ))}
          {results.length === 0 && <div className="launcher-empty">No applications or files match “{query}”.</div>}
        </div>
        <div className="launcher-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate · <kbd>Enter</kbd> open
          </span>
          <span>
            <kbd>Alt</kbd>+<kbd>Space</kbd> or <kbd>Ctrl</kbd>+<kbd>K</kbd> to toggle
          </span>
        </div>
      </div>
    </div>
  );
}
