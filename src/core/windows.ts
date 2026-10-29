import { Store } from './store';
import { APPS, AppId, getApp } from './apps';
import { events } from './events';

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WindowState {
  id: string;
  appId: AppId;
  title: string;
  bounds: Bounds;
  z: number;
  minimized: boolean;
  maximized: boolean;
  /** Arbitrary launch arguments, e.g. `{ path }` for the editor. */
  props: Record<string, unknown>;
  openedAt: number;
}

export interface WindowManagerState {
  windows: WindowState[];
  focusedId: string | null;
  viewport: { w: number; h: number };
}

/** Pixels of a window title bar that must stay reachable inside the viewport. */
const GRAB_MARGIN = 48;
const TITLEBAR = 38;

export function clampBounds(b: Bounds, viewport: { w: number; h: number }, min: { w: number; h: number }): Bounds {
  const w = Math.max(Math.min(b.w, viewport.w), Math.min(min.w, viewport.w));
  const h = Math.max(Math.min(b.h, viewport.h), Math.min(min.h, viewport.h));
  const x = Math.min(Math.max(b.x, GRAB_MARGIN - w), viewport.w - GRAB_MARGIN);
  const y = Math.min(Math.max(b.y, 0), viewport.h - TITLEBAR);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

let seq = 0;

export class WindowManager {
  readonly store = new Store<WindowManagerState>({ windows: [], focusedId: null, viewport: { w: 1280, h: 720 } });
  private zTop = 10;
  /** Optional per-window guards; returning false cancels a close (e.g. unsaved changes). */
  private closeGuards = new Map<string, () => boolean>();

  get state(): WindowManagerState {
    return this.store.get();
  }

  get windows(): WindowState[] {
    return this.state.windows;
  }

  setViewport(w: number, h: number): void {
    this.store.set((s) => ({
      ...s,
      viewport: { w, h },
      windows: s.windows.map((win) => {
        const meta = getApp(win.appId)!;
        return { ...win, bounds: clampBounds(win.bounds, { w, h }, meta.minSize) };
      }),
    }));
  }

  private update(id: string, fn: (w: WindowState) => WindowState): void {
    this.store.set((s) => ({ ...s, windows: s.windows.map((w) => (w.id === id ? fn(w) : w)) }));
  }

  get(id: string): WindowState | undefined {
    return this.windows.find((w) => w.id === id);
  }

  open(appId: AppId, props: Record<string, unknown> = {}): WindowState {
    const meta = getApp(appId);
    if (!meta) throw new Error(`Unknown application: ${appId}`);
    if (meta.singleton) {
      const existing = this.windows.find((w) => w.appId === appId);
      if (existing) {
        if (Object.keys(props).length) this.update(existing.id, (w) => ({ ...w, props: { ...w.props, ...props } }));
        this.focus(existing.id);
        return this.get(existing.id)!;
      }
    }
    const { viewport } = this.state;
    const n = this.windows.length % 8;
    const w = Math.min(meta.defaultSize.w, viewport.w - 24);
    const h = Math.min(meta.defaultSize.h, viewport.h - 24);
    const bounds = clampBounds(
      {
        x: Math.max(12, (viewport.w - w) / 2 - 90 + n * 28),
        y: Math.max(12, (viewport.h - h) / 2 - 50 + n * 26),
        w,
        h,
      },
      viewport,
      meta.minSize,
    );
    const win: WindowState = {
      id: `win-${++seq}-${Date.now().toString(36)}`,
      appId,
      title: meta.name,
      bounds,
      z: ++this.zTop,
      minimized: false,
      maximized: viewport.w < 700,
      props,
      openedAt: Date.now(),
    };
    this.store.set((s) => ({ ...s, windows: [...s.windows, win], focusedId: win.id }));
    events.log('wm', `Opened ${meta.name}`);
    return win;
  }

  setCloseGuard(id: string, guard: (() => boolean) | null): void {
    if (guard) this.closeGuards.set(id, guard);
    else this.closeGuards.delete(id);
  }

  /** Close a window. Returns false if a close guard vetoed it. */
  close(id: string, force = false): boolean {
    const win = this.get(id);
    if (!win) return true;
    const guard = this.closeGuards.get(id);
    if (!force && guard && guard() === false) return false;
    this.closeGuards.delete(id);
    this.store.set((s) => {
      const windows = s.windows.filter((w) => w.id !== id);
      return { ...s, windows, focusedId: s.focusedId === id ? topVisible(windows) : s.focusedId };
    });
    events.log('wm', `Closed ${win.title}`);
    return true;
  }

  closeAll(): void {
    this.closeGuards.clear();
    this.store.set((s) => ({ ...s, windows: [], focusedId: null }));
  }

  focus(id: string): void {
    const win = this.get(id);
    if (!win) return;
    if (this.state.focusedId === id && !win.minimized && win.z === this.zTop) return;
    const z = ++this.zTop;
    this.update(id, (w) => ({ ...w, z, minimized: false }));
    this.store.set((s) => ({ ...s, focusedId: id }));
  }

  minimize(id: string): void {
    this.update(id, (w) => ({ ...w, minimized: true }));
    this.store.set((s) => ({ ...s, focusedId: s.focusedId === id ? topVisible(s.windows) : s.focusedId }));
  }

  /** Taskbar behaviour: focus if hidden or behind, minimise if already focused. */
  toggleFromTaskbar(id: string): void {
    const win = this.get(id);
    if (!win) return;
    if (!win.minimized && this.state.focusedId === id) this.minimize(id);
    else this.focus(id);
  }

  toggleMaximize(id: string): void {
    this.update(id, (w) => ({ ...w, maximized: !w.maximized }));
    this.focus(id);
  }

  setBounds(id: string, bounds: Bounds): void {
    const win = this.get(id);
    if (!win) return;
    const meta = getApp(win.appId)!;
    this.update(id, (w) => ({ ...w, maximized: false, bounds: clampBounds(bounds, this.state.viewport, meta.minSize) }));
  }

  setTitle(id: string, title: string): void {
    this.update(id, (w) => (w.title === title ? w : { ...w, title }));
  }

  /** Cycle focus between visible windows (Alt+` style). */
  cycle(): void {
    const visible = this.windows.filter((w) => !w.minimized).sort((a, b) => a.z - b.z);
    if (visible.length < 2) {
      const only = this.windows[0];
      if (only) this.focus(only.id);
      return;
    }
    this.focus(visible[0].id);
  }

  /** Serializable layout used for session restore. */
  snapshot(): { appId: AppId; bounds: Bounds; maximized: boolean; props: Record<string, unknown> }[] {
    return [...this.windows]
      .sort((a, b) => a.z - b.z)
      .filter((w) => APPS.some((a) => a.id === w.appId))
      .map((w) => ({ appId: w.appId, bounds: w.bounds, maximized: w.maximized, props: w.props }));
  }

  restore(layout: unknown): number {
    if (!Array.isArray(layout)) return 0;
    let restored = 0;
    for (const item of layout.slice(0, 12)) {
      if (!item || typeof item !== 'object') continue;
      const { appId, bounds, maximized, props } = item as Record<string, unknown>;
      if (typeof appId !== 'string' || !getApp(appId)) continue;
      const safeProps = props && typeof props === 'object' ? (props as Record<string, unknown>) : {};
      const win = this.open(appId as AppId, safeProps);
      if (isBounds(bounds)) this.setBounds(win.id, bounds);
      if (maximized === true) this.update(win.id, (w) => ({ ...w, maximized: true }));
      restored++;
    }
    return restored;
  }
}

function isBounds(b: unknown): b is Bounds {
  if (!b || typeof b !== 'object') return false;
  const r = b as Record<string, unknown>;
  return ['x', 'y', 'w', 'h'].every((k) => typeof r[k] === 'number' && Number.isFinite(r[k]));
}

function topVisible(windows: WindowState[]): string | null {
  const visible = windows.filter((w) => !w.minimized);
  if (!visible.length) return null;
  return visible.reduce((a, b) => (b.z > a.z ? b : a)).id;
}

export const wm = new WindowManager();
