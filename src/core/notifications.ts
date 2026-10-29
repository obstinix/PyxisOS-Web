import { Store } from './store';
import { events, EventLevel } from './events';
import { settingsStore } from './settings';

export interface Notification {
  id: number;
  title: string;
  body?: string;
  level: EventLevel;
  /** Component that raised the notification, used for grouping. */
  source: string;
  time: number;
  read: boolean;
}

let nextId = 1;

/** Short sine chime via Web Audio; silent when volume is 0 or audio is unavailable. */
function chime(volume: number, level: EventLevel): void {
  if (volume <= 0 || typeof window === 'undefined') return;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  try {
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = level === 'error' ? 330 : level === 'warn' ? 440 : 660;
    gain.gain.setValueAtTime((volume / 100) * 0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
    osc.onended = () => void ctx.close();
  } catch {
    // Autoplay policies may block audio before user interaction; ignore.
  }
}

export class NotificationCenter {
  /** Full history shown in the notification panel. */
  readonly history = new Store<Notification[]>([]);
  /** Transient toasts currently on screen. */
  readonly toasts = new Store<Notification[]>([]);
  private timers = new Map<number, ReturnType<typeof setTimeout>>();

  /** `journal` logs to the event journal; `silent` suppresses toasts and sound (used by self-tests). */
  constructor(
    private journal = true,
    private silent = false,
  ) {}

  notify(title: string, body?: string, level: EventLevel = 'info', source = 'system'): Notification {
    const n: Notification = { id: nextId++, title, body, level, source, time: Date.now(), read: false };
    this.history.set((h) => [n, ...h].slice(0, 100));
    if (this.journal) events.log('notify', body ? `${title} — ${body}` : title, level, { data: { source } });
    const settings = settingsStore.get();
    if (!this.silent && settings.notifications && !settings.dnd) {
      this.toasts.set((t) => [...t, n].slice(-4));
      this.timers.set(
        n.id,
        setTimeout(() => this.dismissToast(n.id), settings.notificationDurationMs),
      );
      chime(settings.soundVolume, level);
    }
    return n;
  }

  dismissToast(id: number): void {
    const t = this.timers.get(id);
    if (t) clearTimeout(t);
    this.timers.delete(id);
    this.toasts.set((list) => list.filter((n) => n.id !== id));
  }

  markRead(id: number, read = true): void {
    this.history.set((h) => h.map((n) => (n.id === id && n.read !== read ? { ...n, read } : n)));
  }

  markAllRead(): void {
    this.history.set((h) => (h.some((n) => !n.read) ? h.map((n) => ({ ...n, read: true })) : h));
  }

  /** Remove one notification from history (and its toast). */
  dismiss(id: number): void {
    this.dismissToast(id);
    this.history.set((h) => h.filter((n) => n.id !== id));
  }

  clear(): void {
    this.history.set([]);
  }

  get unread(): number {
    return this.history.get().filter((n) => !n.read).length;
  }
}

export const notifications = new NotificationCenter();
