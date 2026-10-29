import { KeyValueStore, MemoryStore, openStorage } from './persistence';
import { VirtualFS } from './vfs';
import { events } from './events';
import { DEFAULT_SETTINGS, sanitizeSettings, settingsStore } from './settings';
import { Store } from './store';
import { wm } from './windows';
import { APPS } from './apps';
import { decode, encode, loadStatus, LoadStatus, persistedSpecs, PersistedSpec, setLateLoader } from './persisted';
import { BUILD_DATE, BUILD_NAME, CHANNEL, CODENAME, LICENSE, REPO_URL, SIM_KERNEL, VERSION } from './version';

export interface BootStage {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'warn' | 'failed';
  detail?: string;
  durationMs?: number;
  /** Stage narrates a concept rather than performing real work. */
  simulated?: boolean;
}

export interface BootHook {
  id: string;
  label: string;
  run: () => Promise<string | void>;
}

/** Extra boot stages registered by the composition root (services, diagnostics). */
const bootHooks: BootHook[] = [];
export function registerBootHook(hook: BootHook): void {
  if (!bootHooks.some((h) => h.id === hook.id)) bootHooks.push(hook);
}

export type Phase = 'boot' | 'login' | 'desktop' | 'shutdown' | 'failed';

export interface PersistenceStatus {
  backend: KeyValueStore['kind'] | 'none';
  lastSaveAt: number | null;
  lastError: string | null;
  saves: number;
  pending: boolean;
}

const KEYS = { fs: 'vfs', settings: 'settings', session: 'session', meta: 'meta' } as const;

/**
 * The runtime ties the subsystems together: it owns the storage backend, the
 * virtual filesystem instance, boot sequencing and persistence scheduling.
 */
class Runtime {
  fs = new VirtualFS();
  storage: KeyValueStore = new MemoryStore();
  readonly phase = new Store<Phase>('boot');
  readonly stages = new Store<BootStage[]>([]);
  readonly persistence = new Store<PersistenceStatus>({
    backend: 'none',
    lastSaveAt: null,
    lastError: null,
    saves: 0,
    pending: false,
  });
  /** Changes whenever `fs` is replaced (e.g. after a factory reset). */
  readonly fsInstance = new Store<VirtualFS>(this.fs);
  bootedAt = Date.now();
  desktopAt: number | null = null;
  bootCount = 0;
  failure: string | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribers: (() => void)[] = [];
  private booted = false;
  /**
   * True once every stored record has been loaded. Until then nothing may be
   * written: saving earlier (e.g. when the tab is hidden mid-boot) would
   * overwrite the user's data with defaults.
   */
  private loaded = false;
  private pace = 0;

  uptimeMs(): number {
    return Date.now() - this.bootedAt;
  }

  private setStage(id: string, patch: Partial<BootStage>): void {
    this.stages.set((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  /**
   * Run the boot sequence. Every stage performs real initialisation work; the
   * optional `pace` only adds a short delay so the sequence is legible.
   */
  async boot(opts: { pace?: number; storage?: KeyValueStore } = {}): Promise<void> {
    if (this.booted) return;
    this.booted = true;
    this.bootedAt = Date.now();
    this.pace = opts.pace ?? 0;
    const plan: [string, string, () => Promise<string | void>][] = [
      ['firmware', 'Firmware and bootloader handoff', async () => 'sim:Page load stands in for firmware → bootloader → kernel handoff'],
      ['runtime', 'Initialising Lunar-Pyxis runtime', async () => this.checkRuntime()],
      ['hardware', 'Discovering browser-reported hardware', async () => discoverHardware()],
      ['storage', 'Opening persistent storage', async () => {
        this.storage = opts.storage ?? (await openStorage());
        this.persistence.set((p) => ({ ...p, backend: this.storage.kind }));
        if (this.storage.kind === 'memory') return 'warn:Browser storage unavailable — session will not persist';
        return `Backend: ${this.storage.kind}`;
      }],
      ['settings', 'Restoring settings', async () => {
        const raw = await this.storage.get(KEYS.settings);
        settingsStore.set(sanitizeSettings(raw ?? DEFAULT_SETTINGS));
        return raw ? 'Saved preferences restored' : 'Defaults applied';
      }],
      ['vfs', 'Mounting virtual filesystem', async () => {
        const snapshot = await this.storage.get(KEYS.fs);
        let note = 'Fresh filesystem created';
        let warn = false;
        if (snapshot) {
          try {
            this.fs = VirtualFS.fromSnapshot(snapshot);
            note = 'Filesystem restored from storage';
          } catch {
            this.fs = new VirtualFS();
            note = 'Stored filesystem was invalid — recreated defaults';
            warn = true;
          }
        }
        this.fs.installSystemFiles(systemFiles());
        this.fsInstance.set(this.fs);
        const { files, dirs } = this.fs.counts();
        return `${warn ? 'warn:' : ''}${note} (${files} files, ${dirs} dirs)`;
      }],
      ['state', 'Restoring user state', async () => this.loadPersisted()],
      ['apps', 'Loading application registry', async () => `${APPS.length} applications registered`],
      ...bootHooks.map((h): [string, string, () => Promise<string | void>] => [h.id, h.label, h.run]),
      ['meta', 'Recording session metadata', async () => {
        const meta = ((await this.storage.get<{ bootCount: number }>(KEYS.meta)) ?? { bootCount: 0 });
        this.bootCount = (meta.bootCount ?? 0) + 1;
        await this.storage.set(KEYS.meta, { bootCount: this.bootCount, lastBoot: Date.now() });
        return `Boot #${this.bootCount}`;
      }],
      ['persistence', 'Attaching persistence journal', async () => {
        this.attachPersistence();
        this.loaded = true;
        return 'Autosave enabled';
      }],
      ['desktop', 'Starting desktop environment', async () => 'Ready'],
    ];
    this.stages.set(plan.map(([id, label]) => ({ id, label, status: 'pending', simulated: id === 'firmware' })));
    for (const [id, label, run] of plan) {
      const t0 = performance.now();
      this.setStage(id, { status: 'running' });
      try {
        const result = (await run()) ?? '';
        const warn = result.startsWith('warn:');
        const simulated = result.startsWith('sim:');
        const detail = warn || simulated ? result.slice(result.indexOf(':') + 1) : result;
        this.setStage(id, { status: warn ? 'warn' : 'done', detail, durationMs: performance.now() - t0, simulated });
        events.log('boot', `${label}: ${detail || 'ok'}`, warn ? 'warn' : 'info', { simulated, data: { stage: id } });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.setStage(id, { status: 'failed', detail: message, durationMs: performance.now() - t0 });
        events.log('boot', `${label} failed: ${message}`, 'error', { data: { stage: id } });
        if (id === 'storage' || id === 'vfs' || id === 'settings') {
          // Recover with volatile defaults rather than leaving the user stuck.
          this.storage = new MemoryStore();
          this.persistence.set((p) => ({ ...p, backend: 'memory', lastError: message }));
          if (id === 'vfs') {
            this.fs = new VirtualFS();
            this.fs.installSystemFiles(systemFiles());
            this.fsInstance.set(this.fs);
          }
        } else {
          this.failure = message;
          this.phase.set('failed');
          return;
        }
      }
      if (this.pace) await new Promise((r) => setTimeout(r, this.pace));
    }
    events.log('boot', `Boot complete in ${Math.round(this.uptimeMs())} ms`, 'success');
    this.phase.set('login');
  }

  /** Skip the remaining boot pacing delays (stages still run). */
  skipBootPacing(): void {
    this.pace = 0;
  }

  /** Load every registered persisted store, backing up data that is replaced. */
  private async loadPersisted(): Promise<string> {
    const specs = persistedSpecs();
    const statuses: LoadStatus[] = [];
    for (const spec of specs) statuses.push(await this.loadSpec(spec));
    setLateLoader((spec) => void this.loadSpec(spec).then((st) => loadStatus.set((l) => [...l, st])));
    loadStatus.set(statuses);
    const bad = statuses.filter((st) => st.outcome === 'invalid' || st.outcome === 'newer');
    const migrated = statuses.filter((st) => st.outcome === 'migrated').length;
    const note = `${specs.length} stores${migrated ? `, ${migrated} migrated` : ''}`;
    return bad.length ? `warn:${note}; ${bad.map((b) => `${b.key}: ${b.detail}`).join('; ')}` : note;
  }

  private async loadSpec(spec: PersistedSpec<unknown>): Promise<LoadStatus> {
    let raw: unknown;
    try {
      raw = await this.storage.get(spec.key);
    } catch (e) {
      return { key: spec.key, outcome: 'invalid', detail: `Read failed: ${e instanceof Error ? e.message : String(e)}` };
    }
    const { value, status, backup } = decode(spec, raw);
    if (backup && raw !== undefined) {
      // Keep the original record so a migration never silently destroys data.
      await this.storage.set(`${spec.key}.backup`, { savedAt: Date.now(), raw }).catch(() => undefined);
    }
    spec.store.set(value);
    this.unsubscribers.push(spec.store.subscribe(() => this.scheduleSave()));
    if (status.outcome !== 'loaded' && status.outcome !== 'defaults') events.log('storage', `${spec.key}: ${status.detail}`, 'warn');
    return status;
  }

  private async checkRuntime(): Promise<string> {
    const missing = ['structuredClone', 'Promise', 'TextEncoder'].filter(
      (k) => typeof (globalThis as Record<string, unknown>)[k] === 'undefined',
    );
    if (missing.length) throw new Error(`Browser is missing required APIs: ${missing.join(', ')}`);
    return `${SIM_KERNEL.name} ${SIM_KERNEL.release} (simulated)`;
  }

  private attachPersistence(): void {
    this.unsubscribers.push(
      this.fs.changed.subscribe(() => this.scheduleSave()),
      settingsStore.subscribe(() => this.scheduleSave()),
      wm.store.subscribe(() => this.scheduleSave(1200)),
    );
  }

  scheduleSave(delay = 350): void {
    if (!this.loaded) return;
    this.persistence.set((p) => (p.pending ? p : { ...p, pending: true }));
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.saveNow(), delay);
  }

  async saveNow(): Promise<boolean> {
    if (!this.loaded) return false;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      await this.storage.set(KEYS.fs, this.fs.serialize());
      await this.storage.set(KEYS.settings, settingsStore.get());
      if (this.phase.get() === 'desktop') {
        await this.storage.set(KEYS.session, settingsStore.get().restoreSession ? wm.snapshot() : []);
      }
      if (this.booted) for (const spec of persistedSpecs()) await this.storage.set(spec.key, encode(spec));
      this.persistence.set((p) => ({ ...p, lastSaveAt: Date.now(), lastError: null, saves: p.saves + 1, pending: false }));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.persistence.set((p) => ({ ...p, lastError: message, pending: false }));
      events.log('storage', `Save failed: ${message}`, 'error');
      return false;
    }
  }

  async enterDesktop(): Promise<number> {
    this.phase.set('desktop');
    this.desktopAt = Date.now();
    events.log('session', `${settingsStore.get().displayName} signed in`, 'success');
    let restored = 0;
    if (settingsStore.get().restoreSession) {
      restored = wm.restore(await this.storage.get(KEYS.session));
    }
    if (restored === 0) wm.open('system-center');
    return restored;
  }

  async lock(): Promise<void> {
    await this.saveNow();
    this.phase.set('login');
    events.log('session', 'Session locked');
  }

  /** Save, close all windows and return to the login screen. */
  async logout(): Promise<void> {
    await this.saveNow();
    wm.closeAll();
    this.phase.set('login');
    events.log('session', 'Signed out');
  }

  async shutdown(): Promise<void> {
    await this.saveNow();
    events.log('session', 'Shutdown requested');
    this.phase.set('shutdown');
  }

  /** Simulated restart: persist state, then reload the page to re-run boot. */
  async restart(): Promise<void> {
    await this.saveNow();
    events.log('session', 'Restart requested');
    location.reload();
  }

  /** Erase all persisted data (filesystem, settings, session) and reload. */
  async factoryReset(reload = true): Promise<void> {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    if (this.saveTimer) clearTimeout(this.saveTimer);
    // Stop all saving first, or the reload's pagehide save would rewrite the erased data.
    this.loaded = false;
    await this.storage.clear();
    events.log('session', 'Factory reset performed', 'warn');
    if (reload) location.reload();
  }

  /** Testing hook: reset the singleton to a pristine state. */
  resetForTests(): void {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.booted = false;
    this.loaded = false;
    setLateLoader(null);
    for (const spec of persistedSpecs()) spec.store.set(spec.defaults());
    this.fs = new VirtualFS();
    this.fsInstance.set(this.fs);
    this.storage = new MemoryStore();
    this.phase.set('boot');
    this.stages.set([]);
    wm.closeAll();
  }
}

function discoverHardware(): string {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }) : undefined;
  const cores = nav?.hardwareConcurrency;
  const mem = nav?.deviceMemory;
  const scr = typeof screen !== 'undefined' ? `${screen.width}×${screen.height} display` : 'display size unavailable';
  return [cores ? `${cores} logical CPUs` : 'CPU count unavailable', mem ? `~${mem} GiB memory` : 'memory size unavailable', scr].join(' · ');
}

export function systemFiles(): Record<string, string> {
  return {
    'os-release': [
      `NAME="${BUILD_NAME}"`,
      `VERSION="${VERSION}"`,
      `CODENAME="${CODENAME}"`,
      `CHANNEL="${CHANNEL}"`,
      `BUILD_DATE="${BUILD_DATE}"`,
      `HOME_URL="${REPO_URL}"`,
      `LICENSE="${LICENSE}"`,
    ].join('\n') + '\n',
    'kernel.txt': [
      `${SIM_KERNEL.name} ${SIM_KERNEL.release}  [SIMULATED]`,
      '',
      'The browser build does not boot the Lunar Core microkernel.',
      'Kernel identifiers shown here describe the JavaScript simulation layer.',
      'The native kernel is developed separately as part of the PyxisOS project.',
    ].join('\n') + '\n',
    'README.txt': [
      '/system is generated on every boot and is read-only.',
      'Your files live under /home/pyxis and persist in browser storage.',
      '/tmp is writable and persisted like any other directory in this simulation.',
    ].join('\n') + '\n',
    'apps.txt': APPS.map((a) => `${a.id.padEnd(16)} ${a.name}`).join('\n') + '\n',
  };
}

export const runtime = new Runtime();
