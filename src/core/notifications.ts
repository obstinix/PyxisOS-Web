import { Store } from './store';
import { events, EventLevel } from './events';
import { settingsStore } from './settings';

export interface Notification {
  id: number;
  title: string;
  body?: string;
  level: EventLevel;
  time: number;
  read: boolean;
}

let nextId = 1;

class NotificationCenter {
  /** Full history shown in the notification panel. */
  readonly history = new Store<Notification[]>([]);
  /** Transient toasts currently on screen. */
  readonly toasts = new Store<Notification[]>([]);
  private timers = new Map<number, ReturnType<typeof setTimeout>>();

  notify(title: string, body?: string, level: EventLevel = 'info'): Notification {
    const n: Notification = { id: nextId++, title, body, level, time: Date.now(), read: false };
    this.history.set((h) => [n, ...h].slice(0, 50));
    events.log('notify', body ? `${title} — ${body}` : title, level);
    const settings = settingsStore.get();
    if (settings.notifications) {
      this.toasts.set((t) => [...t, n].slice(-4));
      this.timers.set(
        n.id,
        setTimeout(() => this.dismissToast(n.id), settings.notificationDurationMs),
      );
    }
    return n;
  }

  dismissToast(id: number): void {
    const t = this.timers.get(id);
    if (t) clearTimeout(t);
    this.timers.delete(id);
    this.toasts.set((list) => list.filter((n) => n.id !== id));
  }

  markAllRead(): void {
    this.history.set((h) => (h.some((n) => !n.read) ? h.map((n) => ({ ...n, read: true })) : h));
  }

  clear(): void {
    this.history.set([]);
  }

  get unread(): number {
    return this.history.get().filter((n) => !n.read).length;
  }
}

export const notifications = new NotificationCenter();
