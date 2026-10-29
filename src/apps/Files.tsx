import { useEffect, useMemo, useRef, useState } from 'react';
import { AppProps } from './types';
import { useSignal, useStore, Store } from '../core/store';
import { runtime } from '../core/system';
import { wm } from '../core/windows';
import { notifications } from '../core/notifications';
import { HOME, basename, dirname, displayPath, extname, joinPath, splitPath, validateName } from '../core/path';
import { Entry, MAX_FILE_BYTES } from '../core/vfs';
import { formatBytes } from '../terminal/commands';
import { Icon } from '../shell/icons';
import { EmptyState, MenuEntry, confirmDialog, openContextMenu, promptDialog } from '../shell/ui';

/** Clipboard shared by all Files windows. */
const clipboard = new Store<{ mode: 'copy' | 'cut'; paths: string[] } | null>(null);

const PLACES = [
  { label: 'Home', path: HOME, icon: <Icon.home size={15} /> },
  { label: 'Desktop', path: `${HOME}/Desktop`, icon: <Icon.folder size={15} /> },
  { label: 'Documents', path: `${HOME}/Documents`, icon: <Icon.folder size={15} /> },
  { label: 'Projects', path: `${HOME}/Projects`, icon: <Icon.folder size={15} /> },
  { label: 'Downloads', path: `${HOME}/Downloads`, icon: <Icon.folder size={15} /> },
  { label: 'System', path: '/system', icon: <Icon.storage size={15} /> },
  { label: 'tmp', path: '/tmp', icon: <Icon.folder size={15} /> },
];

const TEXT_EXT = new Set(['txt', 'md', 'json', 'js', 'ts', 'tsx', 'css', 'html', 'csv', 'log', 'sh', 'py', 'yml', 'yaml', 'toml', 'xml', 'ini', '']);

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function fmtDate(t: number): string {
  return new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function FilesApp({ win }: AppProps) {
  const fs = useStore(runtime.fsInstance);
  useSignal(fs.changed);
  const clip = useStore(clipboard);
  const initial = typeof win.props.path === 'string' ? win.props.path : HOME;
  const [cwd, setCwd] = useState(() => (fs.isDir(initial) ? initial : dirname(initial)));
  const [back, setBack] = useState<string[]>([]);
  const [forward, setForward] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(fs.isFile(initial) ? [initial] : []));
  const [query, setQuery] = useState('');
  const [searchContent, setSearchContent] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const anchor = useRef<string | null>(null);

  // Follow launch arguments when an existing window is asked to show a path.
  useEffect(() => {
    const p = win.props.path;
    if (typeof p !== 'string' || !fs.exists(p)) return;
    navigate(fs.isDir(p) ? p : dirname(p));
    if (fs.isFile(p)) setSelected(new Set([p]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.props]);

  // If the current directory disappears (e.g. removed from a terminal), walk up.
  useEffect(() => {
    if (!fs.isDir(cwd)) {
      let p = cwd;
      while (p !== '/' && !fs.isDir(p)) p = dirname(p);
      setCwd(p);
    }
  });

  useEffect(() => {
    wm.setTitle(win.id, `Files — ${displayPath(cwd)}`);
  }, [cwd, win.id]);

  let entries: Entry[] = [];
  let listError: string | null = null;
  try {
    entries = query.trim() ? fs.search(query.trim(), cwd, { content: searchContent }) : fs.isDir(cwd) ? fs.list(cwd) : [];
  } catch (e) {
    listError = errMsg(e);
  }
  const existingSelection = [...selected].filter((p) => fs.exists(p));
  const single = existingSelection.length === 1 ? fs.stat(existingSelection[0]) : null;
  const readonlyDir = fs.isReadonly(cwd);

  const navigate = (path: string) => {
    if (path === cwd) return;
    setBack((b) => [...b, cwd].slice(-50));
    setForward([]);
    setCwd(path);
    setSelected(new Set());
    setQuery('');
  };

  const goBack = () => {
    const prev = back[back.length - 1];
    if (!prev) return;
    setBack((b) => b.slice(0, -1));
    setForward((f) => [cwd, ...f]);
    setCwd(prev);
    setSelected(new Set());
  };
  const goForward = () => {
    const next = forward[0];
    if (!next) return;
    setForward((f) => f.slice(1));
    setBack((b) => [...b, cwd]);
    setCwd(next);
    setSelected(new Set());
  };

  const open = (e: Entry) => {
    if (e.type === 'dir') navigate(e.path);
    else wm.open('editor', { path: e.path });
  };

  const guard = (label: string, fn: () => void) => {
    try {
      fn();
    } catch (e) {
      notifications.notify(label, errMsg(e), 'error');
    }
  };

  const newFile = async () => {
    const name = await promptDialog('New file', {
      value: fs.uniqueName(cwd, 'untitled.txt'),
      confirmLabel: 'Create',
      validate: (v) => validateName(v.trim()) ?? (fs.exists(joinPath(cwd, v.trim())) ? 'An item with this name already exists' : null),
    });
    if (!name) return;
    guard('Could not create file', () => {
      fs.writeFile(joinPath(cwd, name), '');
      setSelected(new Set([joinPath(cwd, name)]));
    });
  };

  const newFolder = async () => {
    const name = await promptDialog('New folder', {
      value: fs.uniqueName(cwd, 'New folder'),
      confirmLabel: 'Create',
      validate: (v) => validateName(v.trim()) ?? (fs.exists(joinPath(cwd, v.trim())) ? 'An item with this name already exists' : null),
    });
    if (!name) return;
    guard('Could not create folder', () => {
      fs.mkdir(joinPath(cwd, name));
      setSelected(new Set([joinPath(cwd, name)]));
    });
  };

  const rename = async (e: Entry) => {
    const name = await promptDialog(`Rename ${e.type === 'dir' ? 'folder' : 'file'}`, {
      value: e.name,
      confirmLabel: 'Rename',
      validate: (v) => {
        const t = v.trim();
        return validateName(t) ?? (t !== e.name && fs.exists(joinPath(dirname(e.path), t)) ? 'An item with this name already exists' : null);
      },
    });
    if (!name || name === e.name) return;
    guard('Could not rename', () => {
      const target = fs.rename(e.path, name);
      setSelected(new Set([target]));
    });
  };

  const remove = async (paths: string[]) => {
    if (!paths.length) return;
    const label = paths.length === 1 ? `“${basename(paths[0])}”` : `${paths.length} items`;
    const ok = await confirmDialog(`Delete ${label}?`, {
      message: 'Deleted items are removed from the virtual filesystem. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    for (const p of paths) guard(`Could not delete ${basename(p)}`, () => fs.remove(p, { recursive: true }));
    setSelected(new Set());
  };

  const paste = () => {
    if (!clip) return;
    const pasted: string[] = [];
    for (const src of clip.paths) {
      if (!fs.exists(src)) continue;
      guard(`Could not ${clip.mode === 'cut' ? 'move' : 'copy'} ${basename(src)}`, () => {
        if (clip.mode === 'cut') {
          pasted.push(fs.move(src, cwd));
        } else {
          const target = dirname(src) === cwd ? joinPath(cwd, fs.uniqueName(cwd, basename(src))) : cwd;
          pasted.push(fs.copy(src, target, { recursive: true }));
        }
      });
    }
    if (clip.mode === 'cut') clipboard.set(null);
    setSelected(new Set(pasted));
  };

  const duplicate = (e: Entry) =>
    guard('Could not duplicate', () => {
      const target = joinPath(dirname(e.path), fs.uniqueName(dirname(e.path), e.name));
      setSelected(new Set([fs.copy(e.path, target, { recursive: true })]));
    });

  const exportFile = (e: Entry) => {
    const blob = new Blob([fs.readFile(e.path)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = e.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importFiles = async (files: FileList | null) => {
    if (!files) return;
    let count = 0;
    for (const f of Array.from(files)) {
      if (f.size > MAX_FILE_BYTES) {
        notifications.notify('Import skipped', `${f.name} is larger than ${formatBytes(MAX_FILE_BYTES)}`, 'warn');
        continue;
      }
      const text = await f.text();
      if (text.includes('\u0000')) {
        notifications.notify('Import skipped', `${f.name} looks like a binary file; only text files are supported`, 'warn');
        continue;
      }
      guard(`Could not import ${f.name}`, () => {
        fs.writeFile(joinPath(cwd, fs.uniqueName(cwd, f.name)), text);
        count++;
      });
    }
    if (count) notifications.notify('Import complete', `${count} file(s) imported into ${displayPath(cwd)}`, 'success');
    if (importRef.current) importRef.current.value = '';
  };

  const select = (e: Entry, ev: React.MouseEvent | React.KeyboardEvent) => {
    if (ev.ctrlKey || ev.metaKey) {
      setSelected((s) => {
        const n = new Set(s);
        n.has(e.path) ? n.delete(e.path) : n.add(e.path);
        return n;
      });
      anchor.current = e.path;
    } else if (ev.shiftKey && anchor.current) {
      const a = entries.findIndex((x) => x.path === anchor.current);
      const b = entries.findIndex((x) => x.path === e.path);
      if (a >= 0 && b >= 0) setSelected(new Set(entries.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.path)));
    } else {
      setSelected(new Set([e.path]));
      anchor.current = e.path;
    }
  };

  const itemMenu = (e: Entry, x: number, y: number) => {
    const paths = selected.has(e.path) ? existingSelection : [e.path];
    if (!selected.has(e.path)) setSelected(new Set([e.path]));
    const ro = fs.isReadonly(e.path) || paths.some((p) => fs.stat(p).readonly);
    const items: MenuEntry[] = [
      { label: 'Open', icon: e.type === 'dir' ? <Icon.folder size={14} /> : <Icon.fileText size={14} />, shortcut: 'Enter', onSelect: () => open(e) },
      ...(e.type === 'dir' ? [{ label: 'Open in Terminal', icon: <Icon.play size={14} />, onSelect: () => wm.open('terminal') }] : []),
      'separator',
      { label: 'Copy', icon: <Icon.copy size={14} />, shortcut: 'Ctrl+C', onSelect: () => clipboard.set({ mode: 'copy', paths }) },
      { label: 'Cut', icon: <Icon.cut size={14} />, shortcut: 'Ctrl+X', disabled: ro, onSelect: () => clipboard.set({ mode: 'cut', paths }) },
      { label: 'Duplicate', icon: <Icon.copy size={14} />, disabled: paths.length !== 1 || fs.isReadonly(dirname(e.path)), onSelect: () => duplicate(e) },
      { label: 'Rename…', icon: <Icon.rename size={14} />, shortcut: 'F2', disabled: ro || paths.length !== 1, onSelect: () => void rename(e) },
      ...(e.type === 'file' ? [{ label: 'Export to device', icon: <Icon.download size={14} />, onSelect: () => exportFile(e) }] : []),
      'separator',
      { label: paths.length > 1 ? `Delete ${paths.length} items` : 'Delete', icon: <Icon.trash size={14} />, shortcut: 'Del', danger: true, disabled: ro, onSelect: () => void remove(paths) },
    ];
    openContextMenu(x, y, items);
  };

  const backgroundMenu = (x: number, y: number) => {
    setSelected(new Set());
    openContextMenu(x, y, [
      { label: 'New file…', icon: <Icon.filePlus size={14} />, disabled: readonlyDir, onSelect: () => void newFile() },
      { label: 'New folder…', icon: <Icon.folderPlus size={14} />, disabled: readonlyDir, onSelect: () => void newFolder() },
      'separator',
      {
        label: clip ? `Paste ${clip.paths.length} item(s)` : 'Paste',
        icon: <Icon.paste size={14} />,
        shortcut: 'Ctrl+V',
        disabled: !clip || readonlyDir,
        onSelect: paste,
      },
      { label: 'Import from device…', icon: <Icon.upload size={14} />, disabled: readonlyDir, onSelect: () => importRef.current?.click() },
    ]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const sel = existingSelection;
    const idx = entries.findIndex((x) => x.path === sel[sel.length - 1]);
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault();
      const next = entries[Math.min(entries.length - 1, Math.max(0, idx + (k === 'ArrowDown' ? 1 : -1)))];
      if (next) {
        select(next, e);
        listRef.current?.querySelector(`[data-path="${CSS.escape(next.path)}"]`)?.scrollIntoView({ block: 'nearest' });
      }
    } else if (k === 'Enter' && single) {
      open(single);
    } else if (k === 'Backspace' || (k === 'ArrowUp' && e.altKey)) {
      e.preventDefault();
      if (cwd !== '/') navigate(dirname(cwd));
    } else if (k === 'Delete' && sel.length) {
      void remove(sel);
    } else if (k === 'F2' && single) {
      e.preventDefault();
      void rename(single);
    } else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'c' && sel.length) {
      clipboard.set({ mode: 'copy', paths: sel });
    } else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'x' && sel.length) {
      clipboard.set({ mode: 'cut', paths: sel });
    } else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'v') {
      paste();
    } else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'a') {
      e.preventDefault();
      setSelected(new Set(entries.map((x) => x.path)));
    }
  };

  const crumbs = useMemo(() => {
    const parts = splitPath(cwd);
    return [{ label: '/', path: '/' }, ...parts.map((p, i) => ({ label: p, path: '/' + parts.slice(0, i + 1).join('/') }))];
  }, [cwd]);

  const preview = single && single.type === 'file' ? fs.readFile(single.path) : null;
  const previewable = single && TEXT_EXT.has(extname(single.name));

  return (
    <div className="files" onKeyDown={onKeyDown}>
      <aside className="files-side" aria-label="Places">
        <div className="side-label">Places</div>
        {PLACES.map((p) => (
          <button key={p.path} className={`side-item${cwd === p.path ? ' active' : ''}`} onClick={() => navigate(p.path)}>
            {p.icon}
            <span>{p.label}</span>
          </button>
        ))}
        <div className="side-foot muted small">
          Virtual filesystem · {formatBytes(fs.totalBytes())}
          <br />
          Stored in browser ({runtime.storage.kind})
        </div>
      </aside>
      <section className="files-main">
        <div className="toolbar">
          <button className="icon-btn" onClick={goBack} disabled={!back.length} aria-label="Back" title="Back">
            <Icon.arrowLeft size={16} />
          </button>
          <button className="icon-btn" onClick={goForward} disabled={!forward.length} aria-label="Forward" title="Forward">
            <Icon.arrowRight size={16} />
          </button>
          <button className="icon-btn" onClick={() => navigate(dirname(cwd))} disabled={cwd === '/'} aria-label="Up one level" title="Up (Backspace)">
            <Icon.arrowUp size={16} />
          </button>
          <nav className="crumbs" aria-label="Path">
            {crumbs.map((c, i) => (
              <span key={c.path}>
                {i > 1 && <span className="crumb-sep">/</span>}
                <button className="crumb" onClick={() => navigate(c.path)} aria-current={c.path === cwd ? 'page' : undefined}>
                  {c.label}
                </button>
              </span>
            ))}
          </nav>
          <div className="search-field">
            <Icon.search size={14} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${basename(cwd) || '/'}`} aria-label="Search files" spellCheck={false} />
            <label className="search-opt" title="Also match file contents">
              <input type="checkbox" checked={searchContent} onChange={(e) => setSearchContent(e.target.checked)} />
              content
            </label>
          </div>
          <button className="icon-btn" onClick={() => void newFile()} disabled={readonlyDir} aria-label="New file" title={readonlyDir ? 'Read-only location' : 'New file'}>
            <Icon.filePlus size={16} />
          </button>
          <button className="icon-btn" onClick={() => void newFolder()} disabled={readonlyDir} aria-label="New folder" title={readonlyDir ? 'Read-only location' : 'New folder'}>
            <Icon.folderPlus size={16} />
          </button>
          <button className="icon-btn" onClick={() => importRef.current?.click()} disabled={readonlyDir} aria-label="Import files" title="Import text files from your device">
            <Icon.upload size={16} />
          </button>
          <input ref={importRef} type="file" multiple hidden onChange={(e) => void importFiles(e.target.files)} />
        </div>
        <div className="files-body">
          <div
            className="file-list"
            ref={listRef}
            tabIndex={0}
            data-autofocus
            role="grid"
            aria-label={`Contents of ${displayPath(cwd)}`}
            aria-multiselectable="true"
            onContextMenu={(e) => {
              if ((e.target as HTMLElement).closest('.file-row')) return;
              e.preventDefault();
              backgroundMenu(e.clientX, e.clientY);
            }}
            onClick={(e) => e.target === e.currentTarget && setSelected(new Set())}
          >
            <div className="file-row head" role="row">
              <span role="columnheader">Name</span>
              <span role="columnheader">Size</span>
              <span role="columnheader">Modified</span>
            </div>
            {listError && <EmptyState title="Cannot open this location">{listError}</EmptyState>}
            {!listError && entries.length === 0 && (
              <EmptyState icon={<Icon.folder size={26} />} title={query ? 'No matches' : 'This folder is empty'}>
                {query ? `Nothing in ${displayPath(cwd)} matches “${query}”.` : readonlyDir ? 'This location is read-only.' : 'Right-click to create a file or folder.'}
              </EmptyState>
            )}
            {entries.map((e) => {
              const isSel = selected.has(e.path);
              const isCut = clip?.mode === 'cut' && clip.paths.includes(e.path);
              return (
                <div
                  key={e.path}
                  data-path={e.path}
                  role="row"
                  aria-selected={isSel}
                  className={`file-row${isSel ? ' selected' : ''}${isCut ? ' cut' : ''}`}
                  onClick={(ev) => select(e, ev)}
                  onDoubleClick={() => open(e)}
                  onContextMenu={(ev) => {
                    ev.preventDefault();
                    itemMenu(e, ev.clientX, ev.clientY);
                  }}
                >
                  <span className="file-name" role="gridcell">
                    {e.type === 'dir' ? <Icon.folder size={16} className="fi-dir" /> : <Icon.fileText size={16} className="fi-file" />}
                    <span className="truncate">{query ? displayPath(e.path) : e.name}</span>
                    {e.readonly && <span className="ro-tag" title="Read-only">ro</span>}
                  </span>
                  <span className="mono muted" role="gridcell">
                    {e.type === 'dir' ? `${e.size} items` : formatBytes(e.size)}
                  </span>
                  <span className="muted" role="gridcell">
                    {fmtDate(e.mtime)}
                  </span>
                </div>
              );
            })}
          </div>
          <aside className="files-preview" aria-label="Details">
            {single ? (
              <>
                <div className="preview-head">
                  {single.type === 'dir' ? <Icon.folder size={22} /> : <Icon.fileText size={22} />}
                  <div>
                    <strong className="break">{single.name}</strong>
                    <div className="muted small mono break">{displayPath(single.path)}</div>
                  </div>
                </div>
                <dl className="kv small">
                  <dt>Type</dt>
                  <dd>{single.type === 'dir' ? 'Folder' : extname(single.name).toUpperCase() || 'Text'} </dd>
                  <dt>Size</dt>
                  <dd>{single.type === 'dir' ? `${single.size} items` : formatBytes(single.size)}</dd>
                  <dt>Modified</dt>
                  <dd>{new Date(single.mtime).toLocaleString()}</dd>
                  <dt>Access</dt>
                  <dd>{single.readonly ? 'Read-only' : 'Read & write'}</dd>
                </dl>
                {single.type === 'file' && (
                  <>
                    <div className="row gap-2">
                      <button className="btn small primary" onClick={() => open(single)}>
                        {single.readonly ? 'View' : 'Edit'}
                      </button>
                      <button className="btn small" onClick={() => exportFile(single)}>
                        Export
                      </button>
                    </div>
                    {previewable && preview !== null ? (
                      <pre className="preview-text">{preview.slice(0, 4000) || '(empty file)'}</pre>
                    ) : (
                      <p className="muted small">No preview for this file type.</p>
                    )}
                  </>
                )}
                {single.type === 'dir' && (
                  <button className="btn small" onClick={() => open(single)}>
                    Open folder
                  </button>
                )}
              </>
            ) : existingSelection.length > 1 ? (
              <EmptyState title={`${existingSelection.length} items selected`}>Right-click for actions.</EmptyState>
            ) : (
              <EmptyState icon={<Icon.fileText size={24} />} title="No selection">
                Select a file to preview it.
              </EmptyState>
            )}
          </aside>
        </div>
        <div className="statusbar small">
          <span>
            {entries.length} item{entries.length === 1 ? '' : 's'}
            {existingSelection.length ? ` · ${existingSelection.length} selected` : ''}
          </span>
          {clip && (
            <span className="muted">
              Clipboard: {clip.paths.length} item(s) to {clip.mode === 'cut' ? 'move' : 'copy'}
            </span>
          )}
          {readonlyDir && <span className="muted">Read-only location</span>}
        </div>
      </section>
    </div>
  );
}
