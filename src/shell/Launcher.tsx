import { useEffect, useMemo, useRef, useState } from 'react';
import { APPS, AppId, AppMeta, CATEGORIES, getApp, searchApps } from '../core/apps';
import { wm } from '../core/windows';
import { useStore } from '../core/store';
import { toggleFavorite, userState } from '../core/userstate';
import { AppTile, Icon } from './icons';
import { openContextMenu, useFocusTrap } from './ui';

type Tab = 'all' | 'favorites' | (typeof CATEGORIES)[number];

/**
 * Application launcher: a searchable grid of every registered app, with
 * favourites, recently used apps and categories. Launching goes through the
 * same window manager as the dock and command palette.
 */
export function Launcher({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [active, setActive] = useState(0);
  const { favorites, recents } = useStore(userState);
  const inputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useFocusTrap(boxRef);

  useEffect(() => inputRef.current?.focus(), []);

  const apps: AppMeta[] = useMemo(() => {
    if (query.trim()) return searchApps(query);
    if (tab === 'favorites') return favorites.map((id) => getApp(id)!).filter(Boolean);
    if (tab === 'all') return [...APPS].sort((a, b) => a.name.localeCompare(b.name));
    return APPS.filter((a) => a.category === tab).sort((a, b) => a.name.localeCompare(b.name));
  }, [query, tab, favorites]);

  useEffect(() => setActive(0), [query, tab]);
  useEffect(() => {
    gridRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const launch = (id: AppId | undefined) => {
    if (!id) return;
    wm.open(id);
    onClose();
  };

  const columns = () => {
    const grid = gridRef.current;
    if (!grid) return 4;
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    return Math.max(1, cols);
  };

  const onKey = (e: React.KeyboardEvent) => {
    const n = apps.length;
    const move = (d: number) => {
      e.preventDefault();
      setActive((a) => Math.min(n - 1, Math.max(0, a + d)));
    };
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    } else if (e.key === 'ArrowRight') move(1);
    else if (e.key === 'ArrowLeft' && (e.target as HTMLElement).tagName !== 'INPUT') move(-1);
    else if (e.key === 'ArrowDown') move(columns());
    else if (e.key === 'ArrowUp') move(-columns());
    else if (e.key === 'Enter') launch(apps[active]?.id);
  };

  const menu = (id: AppId, x: number, y: number) =>
    openContextMenu(x, y, [
      { label: 'Open', icon: <Icon.arrowRight size={14} />, onSelect: () => launch(id) },
      {
        label: favorites.includes(id) ? 'Remove from dock' : 'Pin to dock',
        icon: favorites.includes(id) ? <Icon.starFilled size={14} /> : <Icon.star size={14} />,
        onSelect: () => toggleFavorite(id),
      },
    ]);

  const tabs: Tab[] = ['all', 'favorites', ...CATEGORIES];

  return (
    <div className="launcher-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={boxRef} className="launcher launcher-grid-mode" role="dialog" aria-modal="true" aria-label="Application launcher" onKeyDown={onKey}>
        <div className="launcher-search">
          <Icon.search size={16} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search applications"
            aria-label="Search applications"
            aria-controls="launcher-grid"
            aria-activedescendant={apps[active] ? `launcher-app-${apps[active].id}` : undefined}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>
        {!query && recents.length > 0 && (
          <div className="launcher-recents" aria-label="Recently used">
            <span className="launcher-section">Recent</span>
            {recents.slice(0, 6).map((id) => (
              <button key={id} className="chip" onClick={() => launch(id)} title={getApp(id)?.description}>
                <AppTile id={id} size={20} /> {getApp(id)?.name}
              </button>
            ))}
          </div>
        )}
        {!query && (
          <div className="seg launcher-tabs" role="tablist" aria-label="Categories">
            {tabs.map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : undefined} onClick={() => setTab(t)}>
                {t === 'all' ? 'All' : t === 'favorites' ? 'Favourites' : t}
              </button>
            ))}
          </div>
        )}
        <div className="launcher-grid" id="launcher-grid" role="listbox" aria-label="Applications" ref={gridRef}>
          {apps.map((a, i) => (
            <button
              key={a.id}
              id={`launcher-app-${a.id}`}
              data-index={i}
              role="option"
              aria-selected={i === active}
              className={`launcher-app${i === active ? ' active' : ''}`}
              onClick={() => launch(a.id)}
              onPointerMove={() => setActive(i)}
              onContextMenu={(e) => {
                e.preventDefault();
                menu(a.id, e.clientX, e.clientY);
              }}
              title={a.description}
              tabIndex={-1}
            >
              <AppTile id={a.id} size={44} />
              <span className="launcher-app-name">{a.name}</span>
              {favorites.includes(a.id) && <Icon.starFilled size={11} className="launcher-fav" aria-label="Pinned" />}
            </button>
          ))}
          {apps.length === 0 && (
            <div className="launcher-empty">{query ? `No applications match “${query}”. Try the command palette (Ctrl+K) to search files and actions.` : 'No favourites yet — right-click an app to pin it.'}</div>
          )}
        </div>
        <div className="launcher-foot">
          <span>{apps[active] ? apps[active].description : `${APPS.length} applications`}</span>
          <span>
            <kbd>←↑→↓</kbd> move · <kbd>Enter</kbd> open · right-click to pin
          </span>
        </div>
      </div>
    </div>
  );
}
