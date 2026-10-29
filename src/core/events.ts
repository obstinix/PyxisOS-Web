import { Store } from './store';

export type EventLevel = 'info' | 'warn' | 'error' | 'success';

export interface SystemEvent {
  id: number;
  time: number;
  source: string;
  level: EventLevel;
  message: string;
  /** True when the event describes simulated behaviour (e.g. a simulated service). */
  simulated?: boolean;
  /** Optional structured details shown in the journal's detail view. */
  data?: Record<string, string | number | boolean>;
}

export interface LogOptions {
  simulated?: boolean;
  data?: SystemEvent['data'];
}

const MAX_EVENTS = 500;

/**
 * System event journal. Records real operations performed inside the
 * simulation (app launches, filesystem writes, settings changes...).
 */
class EventLog {
  readonly store = new Store<SystemEvent[]>([]);
  private nextId = 1;
  private counts: Record<string, number> = {};

  log(source: string, message: string, level: EventLevel = 'info', opts: LogOptions = {}): SystemEvent {
    const event: SystemEvent = { id: this.nextId++, time: Date.now(), source, level, message };
    if (opts.simulated) event.simulated = true;
    if (opts.data) event.data = opts.data;
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

  get(id: number): SystemEvent | undefined {
    return this.all.find((e) => e.id === id);
  }

  countsBySource(): Record<string, number> {
    return { ...this.counts };
  }

  clear(): void {
    this.store.set([]);
  }
}

export const events = new EventLog();

/** Plain-text export of journal entries (used by the journal and terminal). */
export function formatEvents(list: SystemEvent[]): string {
  return list
    .map((e) => {
      const t = new Date(e.time).toISOString();
      const tag = e.simulated ? ' [SIMULATED]' : '';
      const data = e.data ? ' ' + JSON.stringify(e.data) : '';
      return `${t} ${e.level.toUpperCase().padEnd(7)} ${e.source.padEnd(12)} ${e.message}${tag}${data}`;
    })
    .join('\n');
}
