import { Store } from './store';
import { events } from './events';
import { wm } from './windows';
import { runtime } from './system';

/**
 * Metric provenance:
 *  - LIVE: measured from the browser at runtime.
 *  - SIMULATED: produced by the simulation model, not a host measurement.
 *  - UNAVAILABLE: the browser does not expose this value.
 */
export type Provenance = 'LIVE' | 'SIMULATED' | 'UNAVAILABLE';

export interface Sample {
  t: number;
  fps: number | null;
  frameMs: number | null;
  loopLagMs: number;
  heapMb: number | null;
  windows: number;
  events: number;
  vfsKb: number;
  simLoad: number;
}

export interface StaticInfo {
  logicalCores: number | null;
  deviceMemoryGb: number | null;
  userAgent: string;
  platform: string;
  language: string;
  screen: string;
  pixelRatio: number;
  online: boolean;
  storageQuotaMb: number | null;
  storageUsageMb: number | null;
}

const HISTORY = 60;

export function readStaticInfo(): StaticInfo {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const n = nav as (Navigator & { deviceMemory?: number; userAgentData?: { platform?: string } }) | undefined;
  return {
    logicalCores: n?.hardwareConcurrency ?? null,
    deviceMemoryGb: n?.deviceMemory ?? null,
    userAgent: n?.userAgent ?? 'unknown',
    platform: n?.userAgentData?.platform || n?.platform || 'unknown',
    language: n?.language ?? 'unknown',
    screen: typeof screen !== 'undefined' ? `${screen.width}×${screen.height}` : 'unknown',
    pixelRatio: typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1,
    online: n?.onLine ?? true,
    storageQuotaMb: null,
    storageUsageMb: null,
  };
}

function heapMb(): number | null {
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return mem ? mem.usedJSHeapSize / 1048576 : null;
}

/**
 * Samples runtime metrics once per second while at least one consumer is
 * subscribed. Sampling stops automatically when the last monitor closes so
 * no background timers run unnecessarily.
 */
class MetricsSampler {
  readonly samples = new Store<Sample[]>([]);
  readonly info = new Store<StaticInfo>(readStaticInfo());
  private consumers = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private raf = 0;
  private frames = 0;
  private frameStart = 0;
  private lastTick = 0;
  private lastEvents = 0;

  acquire(): () => void {
    this.consumers++;
    if (this.consumers === 1) this.start();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.consumers--;
      if (this.consumers === 0) this.stop();
    };
  }

  get active(): boolean {
    return this.timer !== null;
  }

  private start(): void {
    this.info.set(readStaticInfo());
    void this.refreshStorageEstimate();
    this.frameStart = performance.now();
    this.frames = 0;
    this.lastTick = performance.now();
    this.lastEvents = events.total;
    const loop = () => {
      this.frames++;
      this.raf = requestAnimationFrame(loop);
    };
    if (typeof requestAnimationFrame !== 'undefined') this.raf = requestAnimationFrame(loop);
    this.timer = setInterval(() => this.tick(), 1000);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.raf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private async refreshStorageEstimate(): Promise<void> {
    try {
      const est = await navigator.storage?.estimate?.();
      if (est) {
        this.info.set({
          ...this.info.get(),
          storageQuotaMb: est.quota != null ? est.quota / 1048576 : null,
          storageUsageMb: est.usage != null ? est.usage / 1048576 : null,
        });
      }
    } catch {
      /* not supported */
    }
  }

  private tick(): void {
    const now = performance.now();
    const elapsed = now - this.frameStart;
    const fps = this.raf && elapsed > 0 ? (this.frames * 1000) / elapsed : null;
    // Event-loop lag: how late this 1000 ms interval fired.
    const lag = Math.max(0, now - this.lastTick - 1000);
    this.lastTick = now;
    this.frames = 0;
    this.frameStart = now;
    const evCount = events.total;
    const eventRate = evCount - this.lastEvents;
    this.lastEvents = evCount;
    const winCount = wm.windows.length;
    // Simulated scheduler load derived from real activity (windows, events, lag).
    const simLoad = Math.min(100, 4 + winCount * 6 + eventRate * 3 + Math.min(lag, 200) / 4);
    const sample: Sample = {
      t: Date.now(),
      fps: fps != null ? Math.round(fps) : null,
      frameMs: fps ? 1000 / fps : null,
      loopLagMs: Math.round(lag),
      heapMb: heapMb(),
      windows: winCount,
      events: evCount,
      vfsKb: runtime.fs.totalBytes() / 1024,
      simLoad,
    };
    this.samples.set((s) => [...s.slice(-(HISTORY - 1)), sample]);
  }
}

export const metrics = new MetricsSampler();
