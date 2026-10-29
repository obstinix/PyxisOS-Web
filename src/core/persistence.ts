/**
 * Persistence layer. Values are stored in IndexedDB when available (suitable
 * for larger virtual filesystems), falling back to localStorage and finally to
 * memory so the desktop still boots in private windows or locked-down browsers.
 */
export interface KeyValueStore {
  readonly kind: 'indexeddb' | 'localstorage' | 'memory';
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

const PREFIX = 'pyxis:';
const DB_NAME = 'pyxisos-web';
const STORE_NAME = 'kv';

export class MemoryStore implements KeyValueStore {
  readonly kind = 'memory' as const;
  private data = new Map<string, unknown>();
  async get<T>(key: string) {
    return structuredClone(this.data.get(key)) as T | undefined;
  }
  async set<T>(key: string, value: T) {
    this.data.set(key, structuredClone(value));
  }
  async delete(key: string) {
    this.data.delete(key);
  }
  async clear() {
    this.data.clear();
  }
}

export class LocalStorageStore implements KeyValueStore {
  readonly kind = 'localstorage' as const;
  constructor(private storage: Storage) {}
  async get<T>(key: string) {
    const raw = this.storage.getItem(PREFIX + key);
    return raw == null ? undefined : (JSON.parse(raw) as T);
  }
  async set<T>(key: string, value: T) {
    this.storage.setItem(PREFIX + key, JSON.stringify(value));
  }
  async delete(key: string) {
    this.storage.removeItem(PREFIX + key);
  }
  async clear() {
    for (let i = this.storage.length - 1; i >= 0; i--) {
      const k = this.storage.key(i);
      if (k?.startsWith(PREFIX)) this.storage.removeItem(k);
    }
  }
}

export class IndexedDbStore implements KeyValueStore {
  readonly kind = 'indexeddb' as const;
  private constructor(private db: IDBDatabase) {}

  static open(factory: IDBFactory = indexedDB): Promise<IndexedDbStore> {
    return new Promise((resolve, reject) => {
      const req = factory.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
      req.onsuccess = () => resolve(new IndexedDbStore(req.result));
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
      req.onblocked = () => reject(new Error('IndexedDB open blocked'));
    });
  }

  private tx<R>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<R>): Promise<R> {
    return new Promise((resolve, reject) => {
      const t = this.db.transaction(STORE_NAME, mode);
      const req = run(t.objectStore(STORE_NAME));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error ?? new Error('IndexedDB transaction failed'));
      t.onabort = () => reject(t.error ?? new Error('IndexedDB transaction aborted'));
    });
  }

  async get<T>(key: string) {
    return (await this.tx('readonly', (s) => s.get(key))) as T | undefined;
  }
  async set<T>(key: string, value: T) {
    await this.tx('readwrite', (s) => s.put(value, key));
  }
  async delete(key: string) {
    await this.tx('readwrite', (s) => s.delete(key));
  }
  async clear() {
    await this.tx('readwrite', (s) => s.clear());
  }
}

/** Pick the most capable available backend. */
export async function openStorage(): Promise<KeyValueStore> {
  try {
    if (typeof indexedDB !== 'undefined') return await IndexedDbStore.open();
  } catch {
    /* fall through */
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PREFIX + 'probe', '1');
      localStorage.removeItem(PREFIX + 'probe');
      return new LocalStorageStore(localStorage);
    }
  } catch {
    /* fall through */
  }
  return new MemoryStore();
}
