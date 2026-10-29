import { Store } from './store';

/**
 * Registry of versioned, persisted application state (favourites, browser
 * tabs, service configuration...). Each store is saved under its own storage
 * key as `{ v, data }`. The runtime loads every registered store during boot
 * and saves them with the rest of the session.
 */
export interface PersistedSpec<T> {
  key: string;
  version: number;
  store: Store<T>;
  defaults: () => T;
  /** Validate and, if needed, migrate data stored by `fromVersion`. Throw if unusable. */
  load: (raw: unknown, fromVersion: number) => T;
}

export type LoadOutcome = 'loaded' | 'defaults' | 'migrated' | 'invalid' | 'newer';

export interface LoadStatus {
  key: string;
  outcome: LoadOutcome;
  detail: string;
}

const specs: PersistedSpec<unknown>[] = [];
export const loadStatus = new Store<LoadStatus[]>([]);

let lateLoader: ((spec: PersistedSpec<unknown>) => void) | null = null;

/** Set by the runtime after boot so stores registered later are still loaded. */
export function setLateLoader(fn: ((spec: PersistedSpec<unknown>) => void) | null): void {
  lateLoader = fn;
}

export function persisted<T>(spec: Omit<PersistedSpec<T>, 'store'>): Store<T> {
  const store = new Store<T>(spec.defaults());
  const full = { ...spec, store } as PersistedSpec<unknown>;
  specs.push(full);
  lateLoader?.(full);
  return store;
}

export function persistedSpecs(): PersistedSpec<unknown>[] {
  return specs;
}

export interface Envelope {
  v: number;
  data: unknown;
}

function isEnvelope(raw: unknown): raw is Envelope {
  return !!raw && typeof raw === 'object' && typeof (raw as Envelope).v === 'number' && 'data' in (raw as object);
}

/**
 * Decode a stored envelope. Returns the value to use and what happened.
 * `backup` is true when the raw value should be preserved before it is
 * replaced (invalid data, a migration, or data written by a newer version).
 */
export function decode<T>(spec: PersistedSpec<T>, raw: unknown): { value: T; status: LoadStatus; backup: boolean } {
  const st = (outcome: LoadOutcome, detail: string): LoadStatus => ({ key: spec.key, outcome, detail });
  if (raw === undefined || raw === null) return { value: spec.defaults(), status: st('defaults', 'No saved data'), backup: false };
  if (!isEnvelope(raw)) return { value: spec.defaults(), status: st('invalid', 'Unrecognised format — defaults used'), backup: true };
  try {
    if (raw.v > spec.version) {
      return { value: spec.load(raw.data, raw.v), status: st('newer', `Saved by schema v${raw.v}; loaded best-effort as v${spec.version}`), backup: true };
    }
    const value = spec.load(raw.data, raw.v);
    if (raw.v < spec.version) return { value, status: st('migrated', `Migrated v${raw.v} → v${spec.version}`), backup: true };
    return { value, status: st('loaded', `Schema v${spec.version}`), backup: false };
  } catch (e) {
    return { value: spec.defaults(), status: st('invalid', `Rejected: ${e instanceof Error ? e.message : String(e)}`), backup: true };
  }
}

export function encode<T>(spec: PersistedSpec<T>): Envelope {
  return { v: spec.version, data: spec.store.get() };
}

/** Small validation helpers shared by persisted stores. */
export function asArray(v: unknown, max = 500): unknown[] {
  return Array.isArray(v) ? v.slice(0, max) : [];
}

export function asString(v: unknown, max = 2000): string | null {
  return typeof v === 'string' ? v.slice(0, max) : null;
}

export function asObject(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('expected an object');
  return v as Record<string, unknown>;
}
