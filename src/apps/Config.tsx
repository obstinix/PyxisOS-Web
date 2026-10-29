import { Fragment, useEffect, useMemo, useState } from 'react';
import { AppProps } from './types';
import { useStore } from '../core/store';
import { CONFIG_FILES, configHistory, getConfig, parseConfig, saveConfig } from '../core/config';
import { settingsStore } from '../core/settings';
import { serviceConfig } from '../core/services';
import { policy } from '../core/aegis';
import { wm } from '../core/windows';
import { Icon } from '../shell/icons';
import { confirmDialog, EmptyState, timeAgo } from '../shell/ui';

/** Tokenise JSON for display-only highlighting (text is rendered as React text, never HTML). */
function highlight(text: string): JSX.Element[] {
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi;
  const out: JSX.Element[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<Fragment key={i++}>{text.slice(last, m.index)}</Fragment>);
    if (m[1]) {
      out.push(
        <span key={i++} className={m[2] ? 'j-key' : 'j-str'}>
          {m[1]}
        </span>,
      );
      if (m[2]) out.push(<Fragment key={i++}>{m[2]}</Fragment>);
    } else if (m[3]) out.push(<span key={i++} className="j-lit">{m[3]}</span>);
    else out.push(<span key={i++} className="j-num">{m[4]}</span>);
    last = m.index + m[0].length;
  }
  out.push(<Fragment key={i++}>{text.slice(last)}</Fragment>);
  return out;
}

/** Configuration Editor: validated edits of real configuration with history and revert. */
export function ConfigApp(_: AppProps) {
  useStore(settingsStore);
  useStore(serviceConfig);
  useStore(policy);
  const history = useStore(configHistory);
  const [fileId, setFileId] = useState(CONFIG_FILES[0].id);
  const file = getConfig(fileId)!;
  const saved = file.read();
  const [text, setText] = useState(saved);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState<number | null>(null);

  // Follow external changes (e.g. Settings app) while there are no local edits.
  useEffect(() => {
    if (!dirty) setText(saved);
  }, [saved, dirty]);

  const check = useMemo(() => parseConfig(file, text), [file, text]);
  const fileHistory = history.filter((h) => h.file === fileId);

  const choose = async (id: string) => {
    if (dirty && !(await confirmDialog('Discard unsaved changes?', { message: `${file.name} has edits that were not saved.`, confirmLabel: 'Discard', danger: true }))) return;
    setFileId(id);
    setText(getConfig(id)!.read());
    setDirty(false);
    setStatus(null);
    setPreview(null);
  };

  const save = async () => {
    if (!check.ok) return;
    if (fileId === 'aegis' && !(await confirmDialog('Apply security policy changes?', { message: 'Aegis policy controls which app-level operations are allowed. Overrides can never grant capabilities an app did not declare.', confirmLabel: 'Apply policy' }))) return;
    const r = saveConfig(fileId, text);
    if (r.ok) {
      setDirty(false);
      setText(file.read());
      setStatus({ ok: true, text: `Saved and applied ${file.name}` });
    } else setStatus({ ok: false, text: r.errors.join('\n') });
  };

  const restore = async (content: string, label: string) => {
    if (!(await confirmDialog(`Restore ${file.name}?`, { message: `Replaces the current contents with the version from ${label}. The current version stays in history.`, confirmLabel: 'Restore' }))) return;
    const r = saveConfig(fileId, content);
    setDirty(false);
    setText(file.read());
    setStatus(r.ok ? { ok: true, text: `Restored ${file.name}` } : { ok: false, text: r.errors.join('\n') });
  };

  const shown = preview !== null ? fileHistory[preview] : undefined;

  return (
    <div className="config-app">
      <div className="split">
        <nav className="settings-nav" aria-label="Configuration files">
          {CONFIG_FILES.map((c) => (
            <button key={c.id} className={`side-item${fileId === c.id ? ' active' : ''}`} aria-current={fileId === c.id ? 'page' : undefined} onClick={() => void choose(c.id)}>
              <Icon.fileText size={14} /> <span className="mono">{c.name}</span>
            </button>
          ))}
          <p className="muted small pad">Read-only mirrors: <span className="mono">/system/config</span></p>
        </nav>
        <div className="config-main">
          <div className="toolbar wrap">
            <strong className="mono">{file.name}</strong>
            {dirty && <span className="dirty-dot" title="Unsaved changes" />}
            <span className="toolbar-spacer" />
            <button className="btn small" onClick={() => (setText(saved), setDirty(false), setStatus(null))} disabled={!dirty}>
              <Icon.undo size={13} /> Revert
            </button>
            <button className="btn primary small" onClick={() => void save()} disabled={!dirty || !check.ok}>
              <Icon.save size={13} /> Save & apply
            </button>
          </div>
          <p className="muted small pad">{file.description}</p>
          <div className="code-edit">
            <pre className="code-hl" aria-hidden="true">
              {highlight(text)}
              {'\n'}
            </pre>
            <textarea
              className="code-input"
              value={text}
              spellCheck={false}
              aria-label={`Edit ${file.name}`}
              aria-invalid={!check.ok}
              aria-describedby="config-validation"
              onChange={(e) => {
                setText(e.target.value);
                setDirty(e.target.value !== saved);
                setStatus(null);
              }}
              onScroll={(e) => {
                const pre = e.currentTarget.previousElementSibling as HTMLElement;
                pre.scrollTop = e.currentTarget.scrollTop;
                pre.scrollLeft = e.currentTarget.scrollLeft;
              }}
              onKeyDown={(e) => {
                if (e.ctrlKey && e.key.toLowerCase() === 's') {
                  e.preventDefault();
                  void save();
                }
              }}
            />
          </div>
          <div id="config-validation" className={`validation ${check.ok ? 'ok' : 'err'}`} role="status" aria-live="polite">
            {check.ok ? '✓ Valid' : check.errors.map((er) => <div key={er}>✗ {er}</div>)}
          </div>
          {status && <div className={`banner small ${status.ok ? '' : 'banner-err'}`} style={{ whiteSpace: 'pre-line' }}>{status.text}</div>}
        </div>
        <aside className="split-detail config-history" aria-label="Change history">
          <h4 className="section-title">Change history</h4>
          {fileHistory.length === 0 && <EmptyState title="No changes yet">Saved changes to {file.name} appear here.</EmptyState>}
          <ul className="plain-list">
            {fileHistory.map((h, i) => (
              <li key={h.time}>
                <button className={`linklike${preview === i ? ' strong' : ''}`} onClick={() => setPreview(preview === i ? null : i)}>
                  {new Date(h.time).toLocaleString()}
                </button>{' '}
                <span className="muted small">{timeAgo(h.time)}</span>
              </li>
            ))}
          </ul>
          {shown && (
            <div className="history-preview">
              <div className="small muted">Before this change:</div>
              <pre className="mono small">{shown.before}</pre>
              <button className="btn small" onClick={() => void restore(shown.before, new Date(shown.time).toLocaleString())}>
                Restore this version
              </button>
            </div>
          )}
          <button className="btn small ghost" onClick={() => wm.open('terminal')}>
            Inspect with <span className="mono">cat /system/config/{file.name}</span>
          </button>
        </aside>
      </div>
    </div>
  );
}
