import { Store } from './store';
import { events } from './events';
import { runtime } from './system';
import { APPS } from './apps';
import { wm } from './windows';
import { sanitizeSettings, settingsStore } from './settings';
import { HOME } from './path';
import { MAX_TOTAL_BYTES } from './vfs';

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip';

export interface CheckResult {
  id: string;
  name: string;
  category: 'storage' | 'filesystem' | 'desktop' | 'runtime' | 'native';
  status: CheckStatus;
  detail: string;
  durationMs: number;
}

export interface DiagnosticReport {
  ranAt: number;
  results: CheckResult[];
  summary: Record<CheckStatus, number>;
}

interface Check {
  id: string;
  name: string;
  category: CheckResult['category'];
  run: () => Promise<[CheckStatus, string]> | [CheckStatus, string];
}

/** Component ids registered by the UI layer, used to verify the registry. */
let registeredComponents: () => string[] = () => APPS.map((a) => a.id);
export function setComponentRegistryProbe(probe: () => string[]): void {
  registeredComponents = probe;
}

const checks: Check[] = [
  {
    id: 'storage.backend',
    name: 'Persistent storage backend',
    category: 'storage',
    run: () => {
      const kind = runtime.storage.kind;
      if (kind === 'indexeddb') return ['pass', 'IndexedDB available'];
      if (kind === 'localstorage') return ['warn', 'Using localStorage fallback (smaller quota)'];
      return ['warn', 'Memory only — changes will be lost on reload'];
    },
  },
  {
    id: 'storage.roundtrip',
    name: 'Storage write/read round-trip',
    category: 'storage',
    run: async () => {
      const key = 'diag-probe';
      const token = Math.random().toString(36).slice(2);
      await runtime.storage.set(key, token);
      const back = await runtime.storage.get<string>(key);
      await runtime.storage.delete(key);
      return back === token ? ['pass', `Probe value verified on ${runtime.storage.kind}`] : ['fail', 'Read-back mismatch'];
    },
  },
  {
    id: 'storage.autosave',
    name: 'Autosave journal',
    category: 'storage',
    run: () => {
      const p = runtime.persistence.get();
      if (p.lastError) return ['fail', `Last save failed: ${p.lastError}`];
      if (p.lastSaveAt) return ['pass', `${p.saves} saves, last ${new Date(p.lastSaveAt).toLocaleTimeString()}`];
      return ['pass', 'No pending changes have required a save yet'];
    },
  },
  {
    id: 'vfs.layout',
    name: 'Filesystem layout',
    category: 'filesystem',
    run: () => {
      const required = ['/home', HOME, `${HOME}/Documents`, `${HOME}/Projects`, `${HOME}/Downloads`, '/system', '/tmp'];
      const missing = required.filter((p) => !runtime.fs.isDir(p));
      return missing.length ? ['fail', `Missing: ${missing.join(', ')}`] : ['pass', `${required.length} required directories present`];
    },
  },
  {
    id: 'vfs.ops',
    name: 'Filesystem operations',
    category: 'filesystem',
    run: () => {
      const fs = runtime.fs;
      const dir = `/tmp/.diag-${Date.now().toString(36)}`;
      try {
        fs.mkdir(dir);
        fs.writeFile(`${dir}/a`, 'pyxis');
        fs.copy(`${dir}/a`, `${dir}/b`);
        fs.move(`${dir}/b`, `${dir}/c`);
        const ok = fs.readFile(`${dir}/c`) === 'pyxis' && !fs.exists(`${dir}/b`);
        return ok ? ['pass', 'mkdir, write, copy, move and read verified'] : ['fail', 'Content mismatch after copy/move'];
      } catch (e) {
        return ['fail', e instanceof Error ? e.message : String(e)];
      } finally {
        if (fs.exists(dir)) fs.remove(dir, { recursive: true });
      }
    },
  },
  {
    id: 'vfs.protection',
    name: 'System path protection',
    category: 'filesystem',
    run: () => {
      try {
        runtime.fs.writeFile('/system/.diag', 'x');
        runtime.fs.remove('/system/.diag');
        return ['fail', '/system accepted a write'];
      } catch {
        return ['pass', '/system rejected a write as expected'];
      }
    },
  },
  {
    id: 'vfs.quota',
    name: 'Virtual disk usage',
    category: 'filesystem',
    run: () => {
      const used = runtime.fs.totalBytes();
      const pct = (used / MAX_TOTAL_BYTES) * 100;
      const detail = `${(used / 1024).toFixed(1)} KiB of ${MAX_TOTAL_BYTES / 1024 / 1024} MiB (${pct.toFixed(1)}%)`;
      return [pct > 80 ? 'warn' : 'pass', detail];
    },
  },
  {
    id: 'apps.registry',
    name: 'Application registry',
    category: 'desktop',
    run: () => {
      const ids = APPS.map((a) => a.id);
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
      const components = new Set(registeredComponents());
      const missing = ids.filter((id) => !components.has(id));
      if (dupes.length) return ['fail', `Duplicate ids: ${dupes.join(', ')}`];
      if (missing.length) return ['fail', `No UI for: ${missing.join(', ')}`];
      return ['pass', `${ids.length} apps registered, all with UI components`];
    },
  },
  {
    id: 'wm.state',
    name: 'Window manager state',
    category: 'desktop',
    run: () => {
      const wins = wm.windows;
      const zs = wins.map((w) => w.z);
      if (new Set(zs).size !== zs.length) return ['fail', 'Duplicate stacking order detected'];
      const { viewport } = wm.state;
      const lost = wins.filter((w) => w.bounds.x > viewport.w - 20 || w.bounds.y > viewport.h - 20 || w.bounds.y < 0);
      if (lost.length) return ['warn', `${lost.length} window(s) partly outside the workspace`];
      return ['pass', `${wins.length} window(s), stacking consistent`];
    },
  },
  {
    id: 'settings.valid',
    name: 'Settings integrity',
    category: 'desktop',
    run: () => {
      const s = settingsStore.get();
      const clean = sanitizeSettings(s);
      return JSON.stringify(clean) === JSON.stringify(s) ? ['pass', 'All preferences valid'] : ['warn', 'Invalid preferences were normalised'];
    },
  },
  {
    id: 'events.journal',
    name: 'Event journal',
    category: 'runtime',
    run: () => {
      const before = events.total;
      events.log('diagnostics', 'Journal probe');
      return events.total === before + 1 ? ['pass', `${events.total} events recorded this session`] : ['fail', 'Journal did not record probe'];
    },
  },
  {
    id: 'runtime.apis',
    name: 'Browser API support',
    category: 'runtime',
    run: () => {
      const apis: [string, boolean][] = [
        ['IndexedDB', typeof indexedDB !== 'undefined'],
        ['ResizeObserver', typeof ResizeObserver !== 'undefined'],
        ['structuredClone', typeof structuredClone !== 'undefined'],
        ['Clipboard', typeof navigator !== 'undefined' && !!navigator.clipboard],
      ];
      const missing = apis.filter(([, ok]) => !ok).map(([n]) => n);
      return missing.length ? ['warn', `Unavailable: ${missing.join(', ')}`] : ['pass', 'All optional APIs available'];
    },
  },
  {
    id: 'runtime.network',
    name: 'Network status',
    category: 'runtime',
    run: () =>
      typeof navigator !== 'undefined' && navigator.onLine === false
        ? ['warn', 'Browser reports offline — desktop continues to work locally']
        : ['pass', 'Browser reports online (no network access is required)'],
  },
  {
    id: 'native.kernel',
    name: 'Lunar Core kernel link',
    category: 'native',
    run: () => ['skip', 'Not available in the browser build — native kernel is not connected'],
  },
];

export const diagnosticsStore = new Store<DiagnosticReport | null>(null);
let running: Promise<DiagnosticReport> | null = null;

export function listChecks(): { id: string; name: string; category: string }[] {
  return checks.map(({ id, name, category }) => ({ id, name, category }));
}

/** Execute every check and publish the report. Concurrent calls share one run. */
export function runDiagnostics(): Promise<DiagnosticReport> {
  if (running) return running;
  running = (async () => {
    const results: CheckResult[] = [];
    for (const c of checks) {
      const t0 = performance.now();
      let status: CheckStatus;
      let detail: string;
      try {
        [status, detail] = await c.run();
      } catch (e) {
        status = 'fail';
        detail = e instanceof Error ? e.message : String(e);
      }
      results.push({ id: c.id, name: c.name, category: c.category, status, detail, durationMs: performance.now() - t0 });
    }
    const summary: Record<CheckStatus, number> = { pass: 0, warn: 0, fail: 0, skip: 0 };
    results.forEach((r) => summary[r.status]++);
    const report = { ranAt: Date.now(), results, summary };
    diagnosticsStore.set(report);
    events.log(
      'diagnostics',
      `Diagnostics: ${summary.pass} passed, ${summary.warn} warnings, ${summary.fail} failed, ${summary.skip} skipped`,
      summary.fail ? 'error' : summary.warn ? 'warn' : 'success',
    );
    return report;
  })().finally(() => {
    running = null;
  });
  return running;
}
