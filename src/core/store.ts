import { useSyncExternalStore } from 'react';

/**
 * Minimal observable store. Every shared subsystem (filesystem, windows,
 * settings, events) exposes one of these so that all apps read a single
 * source of truth and re-render when it changes.
 */
export class Store<T> {
  private listeners = new Set<() => void>();

  constructor(private state: T) {}

  get(): T {
    return this.state;
  }

  set(next: T | ((prev: T) => T)): void {
    const value = typeof next === 'function' ? (next as (prev: T) => T)(this.state) : next;
    if (Object.is(value, this.state)) return;
    this.state = value;
    this.listeners.forEach((l) => l());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get listenerCount(): number {
    return this.listeners.size;
  }
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, () => store.get(), () => store.get());
}

/** Subscribe to a store that only exposes a version counter. */
export class Signal {
  private version = 0;
  private listeners = new Set<() => void>();

  emit(): void {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  get value(): number {
    return this.version;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get listenerCount(): number {
    return this.listeners.size;
  }
}

export function useSignal(signal: Signal): number {
  return useSyncExternalStore(signal.subscribe, () => signal.value, () => signal.value);
}
