import { useEffect, useRef, useState } from 'react';
import { AppProps } from './types';
import { useSignal, useStore } from '../core/store';
import { runtime } from '../core/system';
import { wm } from '../core/windows';
import { notifications } from '../core/notifications';
import { HOME, basename, dirname, displayPath, joinPath, resolvePath, validateName } from '../core/path';
import { Icon } from '../shell/icons';
import { EmptyState, confirmDialog, promptDialog } from '../shell/ui';

interface Doc {
  key: number;
  path: string | null;
  content: string;
  /** Content as last loaded from or saved to the filesystem. */
  saved: string;
  /** File mtime when last synchronised. */
  mtime: number;
  readonly: boolean;
  /** Set when the file changed on disk while this document had edits. */
  conflict: boolean;
}

let docKey = 1;

function loadDoc(path: string): Doc {
  const fs = runtime.fs;
  const content = fs.readFile(path);
  const st = fs.stat(path);
  return { key: docKey++, path, content, saved: content, mtime: st.mtime, readonly: st.readonly, conflict: false };
}

export function EditorApp({ win }: AppProps) {
  const fs = useStore(runtime.fsInstance);
  const fsVersion = useSignal(fs.changed);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const textRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const docsRef = useRef(docs);
  docsRef.current = docs;

  const doc = docs.find((d) => d.key === active) ?? null;
  const dirty = (d: Doc) => d.content !== d.saved;
  const anyDirty = docs.some(dirty);

  const openPath = (path: string) => {
    const existing = docsRef.current.find((d) => d.path === path);
    if (existing) {
      setActive(existing.key);
      return;
    }
    try {
      const d = loadDoc(path);
      setDocs((ds) => [...ds, d]);
      setActive(d.key);
    } catch (e) {
      notifications.notify('Cannot open file', (e as Error).message, 'error');
    }
  };

  // Open the file passed as a launch argument (also when re-targeted later).
  useEffect(() => {
    const p = win.props.path;
    if (typeof p === 'string') openPath(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.props]);

  // Keep documents in sync with filesystem changes made elsewhere (terminal, file manager).
  useEffect(() => {
    setDocs((ds) => {
      let changed = false;
      const next = ds.map((d) => {
        if (!d.path) return d;
        if (!fs.isFile(d.path)) {
          if (d.conflict) return d;
          changed = true;
          return { ...d, conflict: true };
        }
        const disk = fs.readFile(d.path);
        if (disk === d.saved) return d;
        const st = fs.stat(d.path);
        changed = true;
        if (!dirty(d)) return { ...d, content: disk, saved: disk, mtime: st.mtime, conflict: false };
        if (d.conflict) return d;
        return { ...d, conflict: true, mtime: st.mtime };
      });
      return changed ? next : ds;
    });
  }, [fsVersion, fs]);

  useEffect(() => {
    const name = doc ? (doc.path ? basename(doc.path) : 'Untitled') : 'Text Editor';
    wm.setTitle(win.id, doc ? `${dirty(doc) ? '● ' : ''}${name} — Text Editor` : 'Text Editor');
  }, [doc?.path, doc && dirty(doc), win.id]);

  // Guard window close and page unload while there are unsaved edits.
  useEffect(() => {
    wm.setCloseGuard(win.id, () => {
      if (!docsRef.current.some(dirty)) return true;
      void confirmDialog('Discard unsaved changes?', {
        message: 'One or more documents have edits that have not been saved.',
        confirmLabel: 'Discard and close',
        danger: true,
      }).then((ok) => ok && wm.close(win.id, true));
      return false;
    });
    return () => wm.setCloseGuard(win.id, null);
  }, [win.id]);

  useEffect(() => {
    if (!anyDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [anyDirty]);

  const update = (key: number, patch: Partial<Doc>) => setDocs((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const saveAs = async (d: Doc): Promise<boolean> => {
    const suggested = d.path ?? joinPath(`${HOME}/Documents`, fs.uniqueName(`${HOME}/Documents`, 'untitled.txt'));
    const answer = await promptDialog('Save as', {
      value: displayPath(suggested),
      message: 'Path in the virtual filesystem. ~ is your home directory.',
      confirmLabel: 'Save',
      validate: (v) => {
        const p = resolvePath(v.trim(), HOME);
        if (!fs.isDir(dirname(p))) return 'Folder does not exist';
        if (fs.isDir(p)) return 'A folder with this name exists';
        if (fs.isReadonly(p)) return 'Location is read-only';
        return validateName(basename(p));
      },
    });
    if (!answer) return false;
    const path = resolvePath(answer, HOME);
    if (path !== d.path && fs.exists(path)) {
      const ok = await confirmDialog(`Replace ${basename(path)}?`, { message: 'A file with this name already exists.', confirmLabel: 'Replace', danger: true });
      if (!ok) return false;
    }
    return write(d, path);
  };

  const write = (d: Doc, path: string): boolean => {
    try {
      fs.writeFile(path, d.content);
      update(d.key, { path, saved: d.content, mtime: fs.stat(path).mtime, conflict: false, readonly: false });
      return true;
    } catch (e) {
      notifications.notify('Save failed', (e as Error).message, 'error');
      return false;
    }
  };

  const save = async (d: Doc | null) => {
    if (!d) return;
    if (!d.path || d.readonly) {
      await saveAs(d);
      return;
    }
    if (d.conflict) {
      const ok = await confirmDialog('File changed on disk', {
        message: `${displayPath(d.path)} was modified or removed outside the editor. Overwrite it with your version?`,
        confirmLabel: 'Overwrite',
        danger: true,
      });
      if (!ok) return;
    }
    write(d, d.path);
  };

  const newDoc = () => {
    const d: Doc = { key: docKey++, path: null, content: '', saved: '', mtime: 0, readonly: false, conflict: false };
    setDocs((ds) => [...ds, d]);
    setActive(d.key);
  };

  const closeDoc = async (d: Doc) => {
    if (dirty(d)) {
      const ok = await confirmDialog(`Close ${d.path ? basename(d.path) : 'Untitled'}?`, {
        message: 'Your unsaved changes will be lost.',
        confirmLabel: 'Discard',
        danger: true,
      });
      if (!ok) return;
    }
    const idx = docsRef.current.findIndex((x) => x.key === d.key);
    const rest = docsRef.current.filter((x) => x.key !== d.key);
    setDocs(rest);
    if (active === d.key) setActive(rest[Math.min(idx, rest.length - 1)]?.key ?? null);
  };

  const reload = (d: Doc) => {
    if (!d.path || !fs.exists(d.path)) return;
    const fresh = fs.readFile(d.path);
    update(d.key, { content: fresh, saved: fresh, mtime: fs.stat(d.path).mtime, conflict: false });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!doc) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (e.shiftKey) void saveAs(doc);
      else void save(doc);
    } else if (e.key === 'Tab' && !mod && !e.altKey) {
      e.preventDefault();
      const ta = e.currentTarget;
      const { selectionStart: s, selectionEnd: en } = ta;
      const next = doc.content.slice(0, s) + '  ' + doc.content.slice(en);
      update(doc.key, { content: next });
      requestAnimationFrame(() => ta.setSelectionRange(s + 2, s + 2));
    }
  };

  const onRootKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.altKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      newDoc();
    }
  };

  const trackCursor = () => {
    const ta = textRef.current;
    if (!ta) return;
    const before = ta.value.slice(0, ta.selectionStart);
    const line = before.split('\n').length;
    setCursor({ line, col: ta.selectionStart - before.lastIndexOf('\n') });
  };

  const lineCount = doc ? doc.content.split('\n').length : 0;

  return (
    <div className="editor" onKeyDown={onRootKeyDown}>
      <div className="toolbar">
        <button className="btn small" onClick={newDoc} title="New document (Ctrl+Alt+N)">
          <Icon.filePlus size={14} /> New
        </button>
        <button className="btn small" onClick={() => wm.open('files', { path: doc?.path ? dirname(doc.path) : HOME })} title="Browse files to open">
          <Icon.folder size={14} /> Open…
        </button>
        <button className="btn small primary" onClick={() => void save(doc)} disabled={!doc || (!dirty(doc) && !!doc.path && !doc.conflict)} title="Save (Ctrl+S)">
          <Icon.save size={14} /> Save
        </button>
        <button className="btn small" onClick={() => doc && void saveAs(doc)} disabled={!doc} title="Save as (Ctrl+Shift+S)">
          Save as…
        </button>
        <span className="toolbar-spacer" />
        {doc?.path && <span className="mono muted small truncate" title={doc.path}>{displayPath(doc.path)}</span>}
      </div>
      {docs.length > 0 && (
        <div className="tabs" role="tablist" aria-label="Open documents">
          {docs.map((d) => (
            <div key={d.key} className={`tab${d.key === active ? ' active' : ''}`} role="presentation">
              <button role="tab" aria-selected={d.key === active} className="tab-label" onClick={() => setActive(d.key)} title={d.path ?? 'Unsaved document'}>
                {dirty(d) && <span className="dirty-dot" aria-label="Unsaved changes" />}
                {d.path ? basename(d.path) : 'Untitled'}
              </button>
              <button className="tab-close" aria-label={`Close ${d.path ? basename(d.path) : 'Untitled'}`} onClick={() => void closeDoc(d)}>
                <Icon.close size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      {doc?.conflict && (
        <div className="banner warn" role="alert">
          <Icon.alert size={15} />
          <span>{doc.path && fs.exists(doc.path) ? 'This file was changed outside the editor.' : 'This file was moved or deleted outside the editor.'}</span>
          {doc.path && fs.exists(doc.path) && (
            <button className="btn small" onClick={() => reload(doc)}>
              Reload from disk
            </button>
          )}
          <button className="btn small" onClick={() => void save(doc)}>
            Keep my version
          </button>
        </div>
      )}
      {doc?.readonly && (
        <div className="banner" role="note">
          <Icon.lock size={15} /> Read-only system file. Use “Save as” to keep an editable copy.
        </div>
      )}
      {doc ? (
        <div className="editor-area">
          <div className="gutter mono" ref={gutterRef} aria-hidden="true">
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i} className={i + 1 === cursor.line ? 'cur' : ''}>
                {i + 1}
              </div>
            ))}
          </div>
          <textarea
            key={doc.key}
            ref={textRef}
            className="editor-text mono"
            value={doc.content}
            readOnly={doc.readonly}
            spellCheck={false}
            autoFocus
            data-autofocus
            aria-label={`Editing ${doc.path ? basename(doc.path) : 'untitled document'}`}
            onChange={(e) => update(doc.key, { content: e.target.value })}
            onKeyDown={onKeyDown}
            onKeyUp={trackCursor}
            onClick={trackCursor}
            onSelect={trackCursor}
            onScroll={(e) => {
              if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
            }}
          />
        </div>
      ) : (
        <EmptyState icon={<Icon.fileText size={28} />} title="No document open">
          <span className="row gap-2" style={{ marginTop: 8 }}>
            <button className="btn small primary" onClick={newDoc}>
              New document
            </button>
            <button className="btn small" onClick={() => wm.open('files', { path: `${HOME}/Documents` })}>
              Browse files
            </button>
          </span>
        </EmptyState>
      )}
      <div className="statusbar small">
        {doc ? (
          <>
            <span>
              Ln {cursor.line}, Col {cursor.col}
            </span>
            <span>{lineCount} lines · {new TextEncoder().encode(doc.content).length} bytes</span>
            <span className={dirty(doc) ? 'accent-text' : 'muted'}>{dirty(doc) ? 'Unsaved changes' : doc.path ? 'Saved' : 'Not saved yet'}</span>
          </>
        ) : (
          <span className="muted">Ctrl+S save · Ctrl+Shift+S save as · Ctrl+Alt+N new</span>
        )}
      </div>
    </div>
  );
}
