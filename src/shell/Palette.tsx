import { useEffect, useMemo, useRef, useState } from 'react';
import { ACTIONS, getAction, runAction } from '../core/actions';
import { bestScore } from '../core/fuzzy';
import { runtime } from '../core/system';
import { displayPath, HOME } from '../core/path';
import { wm } from '../core/windows';
import { parseIntent } from '../core/intents';
import { notifications } from '../core/notifications';
import { AppTile, Icon } from './icons';
import { useFocusTrap } from './ui';

type Item =
  | { kind: 'action'; id: string; title: string; subtitle: string; category: string; arg?: string }
  | { kind: 'file'; path: string; title: string; subtitle: string; dir: boolean };

/**
 * Keyboard-driven command palette (Ctrl+K). Lists allowlisted actions,
 * applications and files; typed sentences are matched against the same
 * deterministic intent patterns as the assistant ("open the monitor").
 */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useFocusTrap(boxRef);

  useEffect(() => inputRef.current?.focus(), []);

  const items: Item[] = useMemo(() => {
    const q = query.trim();
    const actions = ACTIONS.map((a) => ({ a, score: q ? bestScore(q, [a.title, a.id, ...a.keywords, a.description]) : 1 }))
      .filter((x) => x.score >= 20)
      .sort((x, y) => y.score - x.score)
      .slice(0, q ? 12 : 40)
      .map<Item>(({ a }) => ({ kind: 'action', id: a.id, title: a.title, subtitle: a.description, category: a.category }));
    const out: Item[] = [];
    const intent = q.split(' ').length > 1 ? parseIntent(q) : null;
    if (intent) {
      const a = getAction(intent.actionId)!;
      out.push({ kind: 'action', id: a.id, arg: intent.arg, title: `${a.title}${intent.arg ? ` — ${intent.arg}` : ''}`, subtitle: `Understood as “${intent.pattern}”`, category: 'Suggested' });
    }
    out.push(...actions.filter((x) => !(intent && x.kind === 'action' && x.id === intent.actionId && !intent.arg)));
    if (q.length >= 2) {
      for (const e of runtime.fs.search(q, HOME, { limit: 6 })) out.push({ kind: 'file', path: e.path, title: e.name, subtitle: displayPath(e.path), dir: e.type === 'dir' });
    }
    return out;
  }, [query]);

  useEffect(() => {
    setActive(0);
    setError(null);
  }, [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = async (item: Item | undefined) => {
    if (!item) return;
    if (item.kind === 'file') {
      wm.open(item.dir ? 'files' : 'editor', { path: item.path });
      onClose();
      return;
    }
    const action = getAction(item.id)!;
    let arg = item.arg;
    if (action.arg && !arg) {
      // Use the query remainder as the argument, e.g. "Search the web pyxis os".
      const words = query.trim().split(/\s+/);
      arg = words.length > 1 ? words.slice(1).join(' ') : undefined;
      if (!arg && action.id !== 'wallpaper.set') {
        setError(`“${action.title}” needs a ${action.arg}. Type it after the command, e.g. “${action.keywords[0]} …”.`);
        return;
      }
    }
    onClose();
    const result = await runAction(action.id, arg, 'system');
    if (!result.ok || action.category !== 'Applications') notifications.notify(action.title, result.message, result.ok ? 'success' : result.status === 'cancelled' ? 'info' : 'error', 'palette');
  };

  return (
    <div className="launcher-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={boxRef} className="launcher palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="launcher-search">
          <Icon.command size={16} />
          <input
            ref={inputRef}
            value={query}
            role="combobox"
            aria-expanded="true"
            placeholder="Type a command, app, file or sentence…"
            aria-label="Command, app, file or sentence"
            aria-controls="palette-results"
            aria-activedescendant={items[active] ? `palette-item-${active}` : undefined}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter') void choose(items[active]);
            }}
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>
        {error && (
          <div className="palette-error" role="alert">
            {error}
          </div>
        )}
        <div className="launcher-results" id="palette-results" role="listbox" ref={listRef}>
          {items.map((it, i) => {
            const prev = items[i - 1];
            const group = it.kind === 'file' ? 'Files' : it.category;
            const prevGroup = prev ? (prev.kind === 'file' ? 'Files' : prev.category) : null;
            const appId = it.kind === 'action' && it.id.startsWith('open:') ? it.id.slice(5) : null;
            return (
              <div key={`${it.kind}-${it.kind === 'file' ? it.path : it.id + (it.arg ?? '')}`}>
                {group !== prevGroup && <div className="launcher-section">{group}</div>}
                <button
                  id={`palette-item-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  className={`launcher-item${i === active ? ' active' : ''}`}
                  onPointerMove={() => setActive(i)}
                  onClick={() => void choose(it)}
                  tabIndex={-1}
                >
                  {appId ? (
                    <AppTile id={appId as never} size={30} />
                  ) : (
                    <span className="file-tile">{it.kind === 'file' ? it.dir ? <Icon.folder size={16} /> : <Icon.fileText size={16} /> : <Icon.command size={15} />}</span>
                  )}
                  <span className="launcher-text">
                    <strong>{it.title}</strong>
                    <span>{it.subtitle}</span>
                  </span>
                </button>
              </div>
            );
          })}
          {items.length === 0 && <div className="launcher-empty">Nothing matches “{query}”. Commands only run from the allowlist shown here.</div>}
        </div>
        <div className="launcher-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate · <kbd>Enter</kbd> run
          </span>
          <span>
            <kbd>Ctrl</kbd>+<kbd>K</kbd> palette · <kbd>Alt</kbd>+<kbd>Space</kbd> launcher
          </span>
        </div>
      </div>
    </div>
  );
}
