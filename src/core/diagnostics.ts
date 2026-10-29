import { Store } from './store';
import { events } from './events';
import { runtime } from './system';
import { APPS } from './apps';
import { wm } from './windows';
import { sanitizeSettings, settingsStore } from './settings';
import { HOME } from './path';
import { MAX_TOTAL_BYTES } from './vfs';
import { loadStatus } from './persisted';
import { isRunning, SERVICE_DEFS, serviceRuntime } from './services';
import { CONFIG_FILES, parseConfig } from './config';

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip';

export type Severity = 'critical' | 'major' | 'minor' | 'info';

/** Explanation shown by the System Doctor for each check. */
export interface Explanation {
  what: string;
  why: string;
  condition: string;
  remediation: string;
  /** Allowlisted action that performs the remediation, if one exists. */
  actionId?: string;
  actionArg?: string;
  /** App that helps investigate or fix the problem. */
  app?: string;
}

export interface CheckResult {
  id: string;
  name: string;
  category: 'storage' | 'filesystem' | 'desktop' | 'runtime' | 'services' | 'native';
  status: CheckStatus;
  detail: string;
  durationMs: number;
  severity: Severity;
  /** True when the check inspects the simulation model rather than a real subsystem. */
  simulated: boolean;
  explain: Explanation;
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
  severity?: Severity;
  simulated?: boolean;
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
    id: 'state.persisted',
    name: 'User state records',
    category: 'storage',
    run: () => {
      const st = loadStatus.get();
      if (!st.length) return ['pass', 'No user state loaded yet (fresh session)'];
      const bad = st.filter((x) => x.outcome === 'invalid' || x.outcome === 'newer');
      const migrated = st.filter((x) => x.outcome === 'migrated');
      if (bad.length) return ['warn', `${bad.map((b) => `${b.key}: ${b.detail}`).join('; ')} (originals kept as *.backup)`];
      return ['pass', `${st.length} records valid${migrated.length ? `, ${migrated.length} migrated` : ''}`];
    },
  },
  {
    id: 'config.valid',
    name: 'Configuration files',
    category: 'desktop',
    run: () => {
      const bad = CONFIG_FILES.map((c) => ({ c, r: parseConfig(c, c.read()) })).filter((x) => !x.r.ok);
      return bad.length ? ['fail', bad.map((b) => `${b.c.name}: ${b.r.errors[0]}`).join('; ')] : ['pass', `${CONFIG_FILES.length} files parse and validate`];
    },
  },
  {
    id: 'services.consistency',
    name: 'Service dependencies',
    category: 'services',
    simulated: true,
    run: () => {
      const run = serviceRuntime.get();
      const failed = SERVICE_DEFS.filter((d) => run[d.id]?.state === 'failed');
      if (failed.length) return ['fail', `Failed: ${failed.map((d) => `${d.id} (${run[d.id].lastError})`).join(', ')}`];
      const broken = SERVICE_DEFS.filter((d) => isRunning(d.id) && d.deps.some((dep) => !isRunning(dep)));
      if (broken.length) return ['fail', `Running without dependencies: ${broken.map((d) => d.id).join(', ')}`];
      const stopped = SERVICE_DEFS.filter((d) => d.controllable && !isRunning(d.id));
      if (stopped.length) return ['warn', `Stopped: ${stopped.map((d) => d.id).join(', ')} — features that depend on them are paused`];
      return ['pass', `${SERVICE_DEFS.filter((d) => d.controllable).length} simulated services running with dependencies satisfied`];
    },
  },
  {
    id: 'aegis.broker',
    name: 'Aegis policy broker',
    category: 'services',
    simulated: true,
    run: () =>
      isRunning('aegis-policyd')
        ? ['pass', 'aegis-policyd running — capability requests are evaluated against policy']
        : ['warn', 'aegis-policyd stopped — the broker is failing closed (all requests denied)'],
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
      results.push({
        id: c.id,
        name: c.name,
        category: c.category,
        status,
        detail,
        durationMs: performance.now() - t0,
        severity: c.severity ?? SEVERITY[c.id] ?? 'minor',
        simulated: !!c.simulated,
        explain: explainFor(c.id, status),
      });
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

const SEVERITY: Record<string, Severity> = {
  'storage.backend': 'major',
  'storage.roundtrip': 'critical',
  'storage.autosave': 'major',
  'vfs.layout': 'critical',
  'vfs.ops': 'critical',
  'vfs.protection': 'major',
  'vfs.quota': 'minor',
  'apps.registry': 'critical',
  'wm.state': 'minor',
  'settings.valid': 'minor',
  'events.journal': 'major',
  'runtime.apis': 'minor',
  'runtime.network': 'info',
  'state.persisted': 'major',
  'config.valid': 'major',
  'services.consistency': 'major',
  'aegis.broker': 'major',
  'native.kernel': 'info',
};

/** What each check does, why it matters and how to fix a failure. */
const EXPLAIN: Record<string, Omit<Explanation, 'actionId' | 'actionArg'> & { fix?: () => { actionId?: string; actionArg?: string } }> = {
  'storage.backend': {
    what: 'Which browser storage API PyxisOS-Web could open at boot.',
    why: 'Without IndexedDB or localStorage nothing you create survives a reload.',
    condition: 'pass if IndexedDB is in use; warn for the localStorage or memory fallbacks.',
    remediation: 'Leave private browsing or allow site data for this site, then restart PyxisOS.',
  },
  'storage.roundtrip': {
    what: 'Writes a random probe value to storage, reads it back and deletes it.',
    why: 'Proves storage is actually writable, not just present.',
    condition: 'pass if the value read back equals the value written.',
    remediation: 'Free browser storage space or clear other site data, then re-run.',
  },
  'storage.autosave': {
    what: 'Status of the most recent automatic save.',
    why: 'A failing autosave means recent changes are only in memory.',
    condition: 'fail if the last save raised an error.',
    remediation: 'Export your profile from Settings → Session & data, then free storage space.',
    app: 'settings',
  },
  'vfs.layout': {
    what: 'Presence of the standard directories (/home/pyxis/Documents, /system, /tmp…).',
    why: 'Apps and the terminal assume these paths exist.',
    condition: 'fail if any required directory is missing.',
    remediation: 'Recreate the missing directory from the terminal (mkdir), or use Self-Test & Recovery.',
    app: 'selftest',
  },
  'vfs.ops': {
    what: 'Creates a scratch directory in /tmp and exercises mkdir, write, copy, move and read.',
    why: 'Confirms the shared filesystem used by Files, Terminal and Editor behaves correctly.',
    condition: 'pass if the moved copy has the original content and the source of the move is gone.',
    remediation: 'Reload the page; if it persists, export your files and reset the filesystem in Self-Test & Recovery.',
    app: 'selftest',
  },
  'vfs.protection': {
    what: 'Attempts a write into the read-only /system tree.',
    why: 'Generated system files must not be modified by apps.',
    condition: 'pass if the write is rejected with EPERM.',
    remediation: 'Report a bug — read-only enforcement is part of the filesystem code.',
  },
  'vfs.quota': {
    what: 'Total size of all files against the 25 MiB virtual disk quota.',
    why: 'Writes fail once the quota is exhausted.',
    condition: 'warn above 80% usage.',
    remediation: 'Delete large files from ~/Downloads or /tmp, or empty the Trash.',
    app: 'files',
  },
  'apps.registry': {
    what: 'Every registered app id is unique and has a UI component.',
    why: 'A registry entry without a component would crash when launched.',
    condition: 'fail on duplicate ids or missing components.',
    remediation: 'Developer fix in src/apps/index.tsx.',
  },
  'wm.state': {
    what: 'Window stacking order and positions.',
    why: 'Duplicate z-order or off-screen windows make windows unreachable.',
    condition: 'warn if a window is outside the workspace; fail on duplicate stacking values.',
    remediation: 'Use the dock to focus the window and press Alt+Shift+↑ to maximise it.',
  },
  'settings.valid': {
    what: 'Every preference value is allowed by the settings schema.',
    why: 'Invalid values are replaced with defaults on load.',
    condition: 'warn if sanitising changes any value.',
    remediation: 'Review preferences in Settings or settings.json in the Configuration Editor.',
    app: 'config',
  },
  'events.journal': {
    what: 'Writes a probe entry to the system journal.',
    why: 'Diagnostics, correlation and the journal viewer rely on it.',
    condition: 'pass if the event count increases by exactly one.',
    remediation: 'Reload the page.',
    app: 'events',
  },
  'runtime.apis': {
    what: 'Optional browser APIs used by the demo (IndexedDB, ResizeObserver, structuredClone, Clipboard).',
    why: 'Missing APIs disable specific features such as copy to clipboard.',
    condition: 'warn if any optional API is missing.',
    remediation: 'Use a current version of Chrome, Edge, Firefox or Safari.',
  },
  'runtime.network': {
    what: 'navigator.onLine as reported by your browser.',
    why: 'Only the Browser app needs the network; everything else works offline.',
    condition: 'warn when offline.',
    remediation: 'Reconnect to use Pyxis Browser; the rest of the desktop is unaffected.',
  },
  'state.persisted': {
    what: 'Validation of stored user state (favourites, browser, services, policy…) at boot.',
    why: 'Corrupted or newer-schema records are replaced by defaults; originals are kept as .backup records.',
    condition: 'warn if any record was invalid or written by a newer schema.',
    remediation: 'Re-apply your preferences; the original data is preserved in storage under <key>.backup.',
    app: 'selftest',
  },
  'config.valid': {
    what: 'Parses and validates every configuration file shown in the Configuration Editor.',
    why: 'Invalid configuration would be rejected when saved.',
    condition: 'fail if any file does not validate.',
    remediation: 'Open the Configuration Editor and revert the file from its history.',
    app: 'config',
  },
  'services.consistency': {
    what: 'State of the simulated PyxisOS services and their declared dependencies.',
    why: 'Stopped or failed services pause the Browser, Astral assistant or consensus visualizer.',
    condition: 'fail if a service failed or runs without its dependencies; warn if a service is stopped.',
    remediation: 'Restart the stopped or failed services (with their dependencies), or start them individually in the Service Manager.',
    app: 'services',
    fix: () => ({ actionId: 'services.recover' }),
  },
  'aegis.broker': {
    what: 'Whether the simulated aegis-policyd daemon is running.',
    why: 'When it is stopped the broker denies every capability request (fail closed).',
    condition: 'warn if aegis-policyd is not running.',
    remediation: 'Start aegis-policyd in the Service Manager.',
    app: 'services',
    fix: () => ({ actionId: 'service.start', actionArg: 'aegis-policyd' }),
  },
  'native.kernel': {
    what: 'Connection to a native Lunar Core kernel.',
    why: 'Informational: this build runs entirely in the browser.',
    condition: 'always skipped in the web build.',
    remediation: 'None — run the native PyxisOS build to use the kernel.',
    app: 'bootlab',
  },
};

function explainFor(id: string, status: CheckStatus): Explanation {
  const e = EXPLAIN[id];
  if (!e) return { what: id, why: '', condition: '', remediation: '' };
  const { fix, ...rest } = e;
  return status === 'warn' || status === 'fail' ? { ...rest, ...(fix ? fix() : {}) } : rest;
}

/** Plain-text report for export. */
export function formatReport(r: DiagnosticReport): string {
  const lines = [
    `PyxisOS-Web diagnostic report — ${new Date(r.ranAt).toISOString()}`,
    `Summary: ${r.summary.pass} pass, ${r.summary.warn} warn, ${r.summary.fail} fail, ${r.summary.skip} skip`,
    'Checks run in your browser against the web demo; they do not test hardware or a native kernel.',
    '',
  ];
  for (const c of r.results) {
    lines.push(`[${c.status.toUpperCase()}] ${c.name} (${c.id}) — severity ${c.severity}${c.simulated ? ', SIMULATED model' : ''}`);
    lines.push(`  Evidence:    ${c.detail}`);
    lines.push(`  Checked:     ${c.explain.what}`);
    lines.push(`  Condition:   ${c.explain.condition}`);
    if (c.status === 'warn' || c.status === 'fail') lines.push(`  Remediation: ${c.explain.remediation}`);
    lines.push('');
  }
  return lines.join('\n');
}


