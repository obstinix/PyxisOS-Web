import { Component, ErrorInfo, ReactNode, memo, useCallback, useEffect, useRef, PointerEvent as RPointerEvent, KeyboardEvent } from 'react';
import { WindowState, wm, Bounds } from '../core/windows';
import { getApp } from '../core/apps';
import { events } from '../core/events';
import { AppGlyph, Icon } from './icons';
import { APP_COMPONENTS } from '../apps';

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

class AppErrorBoundary extends Component<{ win: WindowState; children: ReactNode }, { error: Error | null; key: number }> {
  state = { error: null as Error | null, key: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    events.log('wm', `${this.props.win.title} crashed: ${error.message}`, 'error');
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-crash" role="alert">
          <Icon.alert size={28} />
          <h3>{this.props.win.title} stopped responding</h3>
          <p className="mono">{this.state.error.message}</p>
          <div className="row gap-2">
            <button className="btn" onClick={() => this.setState((s) => ({ error: null, key: s.key + 1 }))}>
              Reload app
            </button>
            <button className="btn ghost" onClick={() => wm.close(this.props.win.id)}>
              Close window
            </button>
          </div>
        </div>
      );
    }
    return <div key={this.state.key} className="app-host">{this.props.children}</div>;
  }
}

/** App content is memoised so dragging/focus changes do not re-render it. */
const AppContent = memo(
  function AppContent({ win }: { win: WindowState }) {
    const Comp = APP_COMPONENTS[win.appId];
    return <Comp win={win} />;
  },
  (a, b) => a.win.id === b.win.id && a.win.props === b.win.props,
);

/** Below this workspace width every window is presented maximised. */
export const COMPACT_WIDTH = 700;

export function Window({ win, focused, compact }: { win: WindowState; focused: boolean; compact: boolean }) {
  const maximized = win.maximized || compact;
  const ref = useRef<HTMLElement>(null);
  const meta = getApp(win.appId)!;
  const drag = useRef<{ mode: 'move' | Edge; startX: number; startY: number; start: Bounds; current: Bounds } | null>(null);

  const apply = (b: Bounds) => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = `translate(${b.x}px, ${b.y}px)`;
    el.style.width = `${b.w}px`;
    el.style.height = `${b.h}px`;
  };

  const begin = (mode: 'move' | Edge) => (e: RPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    if (mode === 'move' && (e.target as HTMLElement).closest('button')) return;
    wm.focus(win.id);
    if (compact || (maximized && mode !== 'move')) return;
    e.preventDefault();
    let start = win.bounds;
    if (maximized && mode === 'move') {
      // Un-maximise under the cursor, keeping the grab point proportional.
      const ratio = (e.clientX - (ref.current?.getBoundingClientRect().left ?? 0)) / (ref.current?.offsetWidth || 1);
      const parent = ref.current?.parentElement?.getBoundingClientRect();
      const localX = e.clientX - (parent?.left ?? 0);
      start = { ...win.bounds, x: localX - win.bounds.w * ratio, y: 0 };
      wm.setBounds(win.id, start);
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, startX: e.clientX, startY: e.clientY, start, current: start };
    document.body.classList.add(mode === 'move' ? 'is-dragging' : 'is-resizing');
  };

  const onMove = (e: RPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const { minSize } = meta;
    const s = d.start;
    let b: Bounds;
    if (d.mode === 'move') {
      const vp = wm.state.viewport;
      b = {
        ...s,
        x: Math.min(Math.max(s.x + dx, 48 - s.w), vp.w - 48),
        y: Math.min(Math.max(s.y + dy, 0), vp.h - 38),
      };
    } else {
      b = { ...s };
      if (d.mode.includes('e')) b.w = Math.max(minSize.w, s.w + dx);
      if (d.mode.includes('s')) b.h = Math.max(minSize.h, s.h + dy);
      if (d.mode.includes('w')) {
        const w = Math.max(minSize.w, s.w - dx);
        b.x = s.x + (s.w - w);
        b.w = w;
      }
      if (d.mode.includes('n')) {
        const h = Math.max(minSize.h, s.h - dy);
        b.y = Math.max(0, s.y + (s.h - h));
        b.h = s.y + s.h - b.y;
      }
    }
    d.current = b;
    apply(b);
  };

  const end = (e: RPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    document.body.classList.remove('is-dragging', 'is-resizing');
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    wm.setBounds(win.id, d.current);
    // Snap to the left/right half or maximise when released at the edge.
    if (d.mode === 'move') {
      const vp = wm.state.viewport;
      const parent = ref.current?.parentElement?.getBoundingClientRect();
      const px = e.clientX - (parent?.left ?? 0);
      const py = e.clientY - (parent?.top ?? 0);
      if (py <= 2) wm.toggleMaximize(win.id);
      else if (px <= 2) wm.setBounds(win.id, { x: 0, y: 0, w: vp.w / 2, h: vp.h });
      else if (px >= vp.w - 2) wm.setBounds(win.id, { x: vp.w / 2, y: 0, w: vp.w / 2, h: vp.h });
    }
  };

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && !e.ctrlKey) {
        const vp = wm.state.viewport;
        const map: Record<string, () => void> = {
          ArrowLeft: () => wm.setBounds(win.id, { x: 0, y: 0, w: vp.w / 2, h: vp.h }),
          ArrowRight: () => wm.setBounds(win.id, { x: vp.w / 2, y: 0, w: vp.w / 2, h: vp.h }),
          ArrowUp: () => wm.toggleMaximize(win.id),
          ArrowDown: () => wm.minimize(win.id),
        };
        const fn = map[e.key];
        if (fn) {
          e.preventDefault();
          fn();
        }
      }
    },
    [win.id],
  );

  // Move keyboard focus into a window when it becomes the focused window
  // (e.g. opened from the terminal or dock) so typing reaches it.
  useEffect(() => {
    const el = ref.current;
    if (!focused || win.minimized || !el || el.contains(document.activeElement)) return;
    const target =
      el.querySelector<HTMLElement>('[data-autofocus]:not([disabled])') ??
      el.querySelector<HTMLElement>('.window-body textarea, .window-body input:not([type="hidden"]):not([type="file"]):not([disabled])') ??
      el;
    target.focus({ preventScroll: true });
  }, [focused, win.minimized]);

  const { x, y, w, h } = win.bounds;
  const style = maximized
    ? { zIndex: win.z }
    : { zIndex: win.z, transform: `translate(${x}px, ${y}px)`, width: w, height: h };

  return (
    <section
      ref={ref}
      className={`window${focused ? ' focused' : ''}${maximized ? ' maximized' : ''}${win.minimized ? ' minimized' : ''}`}
      style={style}
      role="dialog"
      aria-label={win.title}
      aria-hidden={win.minimized || undefined}
      data-app={win.appId}
      data-window-id={win.id}
      tabIndex={-1}
      onPointerDownCapture={() => !focused && wm.focus(win.id)}
      onFocusCapture={() => !focused && wm.focus(win.id)}
      onKeyDown={onKeyDown}
    >
      <header
        className="window-titlebar"
        onPointerDown={begin('move')}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerCancel={end}
        onDoubleClick={(e) => !compact && !(e.target as HTMLElement).closest('button') && wm.toggleMaximize(win.id)}
      >
        <span className="window-icon">
          <AppGlyph id={win.appId} size={15} />
        </span>
        <span className="window-title">{win.title}</span>
        <div className="window-controls">
          <button className="wc" aria-label="Minimize" title="Minimize (Alt+Shift+↓)" onClick={() => wm.minimize(win.id)}>
            <Icon.minimize size={14} />
          </button>
          {!compact && (
            <button
              className="wc"
              aria-label={maximized ? 'Restore' : 'Maximize'}
              title={maximized ? 'Restore (Alt+Shift+↑)' : 'Maximize (Alt+Shift+↑)'}
              onClick={() => wm.toggleMaximize(win.id)}
            >
              {maximized ? <Icon.restore size={14} /> : <Icon.maximize size={14} />}
            </button>
          )}
          <button className="wc close" aria-label="Close" title="Close (Alt+W)" onClick={() => wm.close(win.id)}>
            <Icon.close size={14} />
          </button>
        </div>
      </header>
      <div className="window-body">
        <AppErrorBoundary win={win}>
          <AppContent win={win} />
        </AppErrorBoundary>
      </div>
      {!maximized &&
        EDGES.map((edge) => (
          <div
            key={edge}
            className={`rz rz-${edge}`}
            onPointerDown={begin(edge)}
            onPointerMove={onMove}
            onPointerUp={end}
            onPointerCancel={end}
            aria-hidden="true"
          />
        ))}
    </section>
  );
}
