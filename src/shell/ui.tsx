import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Store, useStore } from '../core/store';

// ---------------------------------------------------------------- badges

export type BadgeKind = 'LIVE' | 'SIMULATED' | 'UNAVAILABLE' | 'NOT IMPLEMENTED' | 'PLANNED' | 'IMPLEMENTED';

export function Badge({ kind, title }: { kind: BadgeKind; title?: string }) {
  return (
    <span className={`badge badge-${kind.toLowerCase().replace(' ', '-')}`} title={title}>
      {kind}
    </span>
  );
}

export function StatusDot({ status }: { status: 'ok' | 'warn' | 'err' | 'muted' }) {
  return <span className={`dot dot-${status}`} aria-hidden="true" />;
}

// ---------------------------------------------------------------- context menu

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onSelect?: () => void;
}
export type MenuEntry = MenuItem | 'separator';

interface MenuState {
  x: number;
  y: number;
  items: MenuEntry[];
}

const menuStore = new Store<MenuState | null>(null);

export function openContextMenu(x: number, y: number, items: MenuEntry[]): void {
  menuStore.set({ x, y, items });
}

export function closeContextMenu(): void {
  menuStore.set(null);
}

export function ContextMenuHost() {
  const menu = useStore(menuStore);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({
      x: Math.min(menu.x, window.innerWidth - r.width - 6),
      y: Math.min(menu.y, window.innerHeight - r.height - 6),
    });
    const first = ref.current.querySelector<HTMLButtonElement>('button:not(:disabled)');
    first?.focus();
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e.type === 'pointerdown' && ref.current?.contains(e.target as Node)) return;
      closeContextMenu();
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', close, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', close, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

  if (!menu) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      style={{ left: pos.x || menu.x, top: pos.y || menu.y }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((item, i) =>
        item === 'separator' ? (
          <div key={i} className="menu-sep" role="separator" />
        ) : (
          <button
            key={i}
            role="menuitem"
            className={`menu-item${item.danger ? ' danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              closeContextMenu();
              item.onSelect?.();
            }}
          >
            <span className="menu-icon">{item.icon}</span>
            <span className="menu-label">{item.label}</span>
            {item.shortcut && <kbd>{item.shortcut}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}

// ---------------------------------------------------------------- dialogs

interface DialogState {
  kind: 'prompt' | 'confirm';
  title: string;
  message?: string;
  value: string;
  confirmLabel: string;
  danger?: boolean;
  validate?: (v: string) => string | null;
  resolve: (v: string | boolean | null) => void;
}

const dialogStore = new Store<DialogState | null>(null);

export function promptDialog(
  title: string,
  opts: { value?: string; message?: string; confirmLabel?: string; validate?: (v: string) => string | null } = {},
): Promise<string | null> {
  return new Promise((resolve) => {
    dialogStore.get()?.resolve(null);
    dialogStore.set({
      kind: 'prompt',
      title,
      message: opts.message,
      value: opts.value ?? '',
      confirmLabel: opts.confirmLabel ?? 'OK',
      validate: opts.validate,
      resolve: (v) => resolve(v as string | null),
    });
  });
}

export function confirmDialog(
  title: string,
  opts: { message?: string; confirmLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    dialogStore.get()?.resolve(null);
    dialogStore.set({
      kind: 'confirm',
      title,
      message: opts.message,
      value: '',
      confirmLabel: opts.confirmLabel ?? 'Confirm',
      danger: opts.danger,
      resolve: (v) => resolve(v === true),
    });
  });
}

export function DialogHost() {
  const dialog = useStore(dialogStore);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<Element | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useFocusTrap(boxRef, !!dialog);

  useEffect(() => {
    if (!dialog) return;
    previousFocus.current = document.activeElement;
    setValue(dialog.value);
    requestAnimationFrame(() => {
      if (dialog.kind === 'prompt') {
        const input = inputRef.current;
        input?.focus();
        // Select the stem of file names so typing replaces the name, not the extension.
        const dot = dialog.value.lastIndexOf('.');
        input?.setSelectionRange(0, dot > 0 ? dot : dialog.value.length);
      } else confirmRef.current?.focus();
    });
  }, [dialog]);

  if (!dialog) return null;
  const error = dialog.kind === 'prompt' && dialog.validate ? dialog.validate(value) : null;
  const finish = (result: string | boolean | null) => {
    dialogStore.set(null);
    dialog.resolve(result);
    (previousFocus.current as HTMLElement | null)?.focus?.();
  };
  const submit = () => {
    if (dialog.kind === 'prompt') {
      if (error || !value.trim()) return;
      finish(value.trim());
    } else finish(true);
  };

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && finish(dialog.kind === 'confirm' ? false : null)}>
      <div
        ref={boxRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            finish(dialog.kind === 'confirm' ? false : null);
          }
        }}
      >
        <h2 id="dialog-title">{dialog.title}</h2>
        {dialog.message && <p className="dialog-message" style={{ whiteSpace: 'pre-line' }}>{dialog.message}</p>}
        {dialog.kind === 'prompt' && (
          <>
            <input
              ref={inputRef}
              className="input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              aria-invalid={!!error}
              aria-describedby={error ? 'dialog-error' : undefined}
              spellCheck={false}
            />
            <div id="dialog-error" className="dialog-error" aria-live="polite">
              {value.trim() ? error : ''}
            </div>
          </>
        )}
        <div className="dialog-actions">
          <button className="btn ghost" onClick={() => finish(dialog.kind === 'confirm' ? false : null)}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            className={`btn ${dialog.danger ? 'danger' : 'primary'}`}
            onClick={submit}
            disabled={dialog.kind === 'prompt' && (!!error || !value.trim())}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- misc

/** Re-render on an interval while mounted (used for clocks and uptime). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon}
      <strong>{title}</strong>
      {children && <span>{children}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- focus & files

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keep Tab / Shift+Tab inside `ref` while mounted and restore focus to the
 * previously focused element on unmount (for modal dialogs and overlays).
 */
export function useFocusTrap(ref: React.RefObject<HTMLElement>, active = true): void {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !el.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [ref, active]);
}

/** Offer text to the user as a downloaded file (generated locally, nothing is uploaded). */
export function downloadText(filename: string, text: string, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function timeAgo(t: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(t).toLocaleDateString();
}
