import { Store } from './store';

export type EventLevel = 'info' | 'warn' | 'error' | 'success';

export interface SystemEvent {
  id: number;
  time: number;
  source: string;
  level: EventLevel;
  message: string;
}

const MAX_EVENTS = 300;

/**
 * System event journal. Records real operations performed inside the
 * simulation (app launches, filesystem writes, settings changes...).
 */
class EventLog {
  readonly store = new Store<SystemEvent[]>([]);
  private nextId = 1;
  private counts: Record<string, number> = {};

  log(source: string, message: string, level: EventLevel = 'info'): SystemEvent {
    const event: SystemEvent = { id: this.nextId++, time: Date.now(), source, level, message };
    this.counts[source] = (this.counts[source] ?? 0) + 1;
    this.store.set((prev) => {
      const next = prev.length >= MAX_EVENTS ? prev.slice(prev.length - MAX_EVENTS + 1) : prev.slice();
      next.push(event);
      return next;
    });
    return event;
  }

  get all(): SystemEvent[] {
    return this.store.get();
  }

  get total(): number {
    return this.nextId - 1;
  }

  countsBySource(): Record<string, number> {
    return { ...this.counts };
  }

  clear(): void {
    this.store.set([]);
  }
}

export const events = new EventLog();
