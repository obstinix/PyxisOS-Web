import { runtime } from './system';
import { wm } from './windows';
import { events } from './events';
import { settingsStore } from './settings';
import { metrics } from './metrics';
import { Store } from './store';
import { asObject, persisted } from './persisted';

export type ServiceStatus = 'ok' | 'warn' | 'err' | 'muted';
export type ServiceKind = 'LIVE' | 'SIMULATED' | 'UNAVAILABLE' | 'NOT IMPLEMENTED';
export type RunState = 'running' | 'stopped' | 'failed';

export interface ServiceInfo {
  id: string;
  name: string;
  state: string;
  status: ServiceStatus;
  kind: ServiceKind;
}

export interface ServiceDef {
  id: string;
  name: string;
  description: string;
  kind: ServiceKind;
  /** Services that must be running before this one can start. */
  deps: string[];
  /** Whether the user may start/stop/enable it (only simulated services). */
  controllable: boolean;
  /** What depends on this service inside PyxisOS-Web. */
  affects?: string;
}

/**
 * Service definitions. LIVE services describe real subsystems of the web demo
 * and are read-only. SIMULATED services are a model of PyxisOS daemons: their
 * state is real application state, but no operating-system process exists.
 */
export const SERVICE_DEFS: ServiceDef[] = [
  { id: 'desktop-shell', name: 'Desktop shell', description: 'Renders the desktop, dock and windows.', kind: 'LIVE', deps: ['window-manager'], controllable: false },
  { id: 'window-manager', name: 'Window manager', description: 'Window focus, stacking, workspaces and layout.', kind: 'LIVE', deps: [], controllable: false },
  { id: 'vfs', name: 'Virtual filesystem', description: 'In-memory filesystem shared by every app.', kind: 'LIVE', deps: ['persistence'], controllable: false },
  { id: 'persistence', name: 'Persistence', description: 'Saves the filesystem, settings and session to browser storage.', kind: 'LIVE', deps: [], controllable: false },
  { id: 'event-journal', name: 'Event journal', description: 'Records system events for the journal and diagnostics.', kind: 'LIVE', deps: [], controllable: false },
  { id: 'notifications', name: 'Notifications', description: 'Desktop toasts and notification history.', kind: 'LIVE', deps: ['event-journal'], controllable: false },
  { id: 'metrics', name: 'Metrics sampler', description: 'Samples browser performance while a monitor is open.', kind: 'LIVE', deps: [], controllable: false },
  {
    id: 'pyxis-netd',
    name: 'pyxis-netd',
    description: 'Simulated network daemon.',
    kind: 'SIMULATED',
    deps: [],
    controllable: true,
    affects: 'Pyxis Browser refuses to load pages while it is stopped. Your real network connection is never affected.',
  },
  {
    id: 'aegis-policyd',
    name: 'aegis-policyd',
    description: 'Simulated Aegis capability policy daemon.',
    kind: 'SIMULATED',
    deps: [],
    controllable: true,
    affects: 'While stopped, the Aegis broker fails closed: every capability request is denied.',
  },
  {
    id: 'astral-assistd',
    name: 'astral-assistd',
    description: 'Simulated assistant daemon that hosts Astral Intelligence.',
    kind: 'SIMULATED',
    deps: ['aegis-policyd'],
    controllable: true,
    affects: 'Astral Intelligence and the natural-language command bar pause while it is stopped.',
  },
  {
    id: 'astral-consensusd',
    name: 'astral-consensusd',
    description: 'Simulated Astral Consensus Engine node.',
    kind: 'SIMULATED',
    deps: ['pyxis-netd'],
    controllable: true,
    affects: 'The Consensus Visualizer cannot start new rounds while it is stopped.',
  },
  {
    id: 'lunar-core',
    name: 'Lunar Core kernel',
    description: 'The native PyxisOS microkernel.',
    kind: 'UNAVAILABLE',
    deps: [],
    controllable: false,
  },
];

export interface ServiceRuntime {
  state: RunState;
  since: number;
  restarts: number;
  lastError?: string;
}

export const serviceConfig = persisted<Record<string, { enabled: boolean }>>({
  key: 'services',
  version: 1,
  defaults: () => Object.fromEntries(SERVICE_DEFS.filter((d) => d.controllable).map((d) => [d.id, { enabled: true }])),
  load(raw) {
    const r = asObject(raw);
    const out: Record<string, { enabled: boolean }> = {};
    for (const d of SERVICE_DEFS.filter((x) => x.controllable)) {
      const v = r[d.id] as { enabled?: unknown } | undefined;
      out[d.id] = { enabled: v && typeof v === 'object' && typeof v.enabled === 'boolean' ? v.enabled : true };
    }
    return out;
  },
});

const initialRuntime = (): Record<string, ServiceRuntime> =>
  Object.fromEntries(SERVICE_DEFS.filter((d) => d.controllable).map((d) => [d.id, { state: 'stopped' as RunState, since: Date.now(), restarts: 0 }]));

export const serviceRuntime = new Store<Record<string, ServiceRuntime>>(initialRuntime());

export class ServiceError extends Error {}

export function getDef(id: string): ServiceDef | undefined {
  return SERVICE_DEFS.find((d) => d.id === id);
}

function setRun(id: string, patch: Partial<ServiceRuntime>): void {
  serviceRuntime.set((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
}

function controllable(id: string): ServiceDef {
  const def = getDef(id);
  if (!def) throw new ServiceError(`Unknown service '${id}'`);
  if (!def.controllable) throw new ServiceError(`${def.name} is a ${def.kind} subsystem and cannot be controlled from here`);
  return def;
}

/** Whether a simulated service is running, or whether a live subsystem is up. */
export function isRunning(id: string): boolean {
  const def = getDef(id);
  if (!def) return false;
  if (!def.controllable) return def.kind === 'LIVE';
  return serviceRuntime.get()[id]?.state === 'running';
}

export function dependents(id: string): ServiceDef[] {
  return SERVICE_DEFS.filter((d) => d.deps.includes(id));
}

export interface ControlOptions {
  /** Start missing dependencies / stop running dependents as well. */
  cascade?: boolean;
  /** Who requested the operation (recorded in the journal). */
  actor?: string;
}

function log(id: string, message: string, level: 'info' | 'warn' | 'error' | 'success', actor?: string): void {
  events.log('services', message, level, { simulated: true, data: { service: id, ...(actor ? { actor } : {}) } });
}

export function startService(id: string, opts: ControlOptions = {}): string[] {
  const def = controllable(id);
  if (isRunning(id)) return [];
  const started: string[] = [];
  for (const dep of def.deps) {
    if (isRunning(dep)) continue;
    if (!opts.cascade) throw new ServiceError(`${def.name} requires ${dep}, which is not running`);
    started.push(...startService(dep, opts));
  }
  setRun(id, { state: 'running', since: Date.now(), lastError: undefined });
  log(id, `Started ${def.name}`, 'success', opts.actor);
  return [...started, id];
}

export function stopService(id: string, opts: ControlOptions = {}): string[] {
  const def = controllable(id);
  if (!isRunning(id) && serviceRuntime.get()[id]?.state !== 'failed') return [];
  const running = dependents(id).filter((d) => isRunning(d.id));
  const stopped: string[] = [];
  if (running.length) {
    if (!opts.cascade) throw new ServiceError(`${running.map((d) => d.name).join(', ')} depend${running.length === 1 ? 's' : ''} on ${def.name}`);
    for (const d of running) stopped.push(...stopService(d.id, opts));
  }
  setRun(id, { state: 'stopped', since: Date.now(), lastError: undefined });
  log(id, `Stopped ${def.name}`, 'info', opts.actor);
  return [...stopped, id];
}

export function restartService(id: string, opts: ControlOptions = {}): void {
  const def = controllable(id);
  const dependentsRunning = dependents(id).filter((d) => isRunning(d.id)).map((d) => d.id);
  stopService(id, { ...opts, cascade: true });
  startService(id, { ...opts, cascade: true });
  for (const d of dependentsRunning) startService(d, { ...opts, cascade: true });
  setRun(id, { restarts: (serviceRuntime.get()[id]?.restarts ?? 0) + 1 });
  log(id, `Restarted ${def.name}`, 'success', opts.actor);
}

export function setServiceEnabled(id: string, enabled: boolean, actor?: string): void {
  const def = controllable(id);
  serviceConfig.set((c) => ({ ...c, [id]: { enabled } }));
  log(id, `${enabled ? 'Enabled' : 'Disabled'} ${def.name} at startup`, 'info', actor);
}

/**
 * Inject a simulated crash. Running dependents fail too, which gives the
 * journal, diagnostics and event correlation a realistic failure to explain.
 */
export function failService(id: string, reason = 'simulated crash', actor?: string): void {
  const def = controllable(id);
  if (!isRunning(id)) throw new ServiceError(`${def.name} is not running`);
  setRun(id, { state: 'failed', since: Date.now(), lastError: reason });
  events.log('services', `${def.name} failed: ${reason}`, 'error', { simulated: true, data: { service: id, ...(actor ? { actor } : {}) } });
  for (const d of dependents(id)) {
    if (!isRunning(d.id)) continue;
    setRun(d.id, { state: 'failed', since: Date.now(), lastError: `dependency ${def.name} failed` });
    events.log('services', `${d.name} failed: dependency ${def.name} failed`, 'error', { simulated: true, data: { service: d.id, cause: id } });
  }
}

/** Start enabled services in dependency order (boot hook). */
export function startEnabledServices(): string {
  serviceRuntime.set(initialRuntime());
  const cfg = serviceConfig.get();
  const started: string[] = [];
  const skipped: string[] = [];
  for (const def of SERVICE_DEFS.filter((d) => d.controllable)) {
    if (!cfg[def.id]?.enabled) {
      skipped.push(def.id);
      continue;
    }
    try {
      started.push(...startService(def.id, { actor: 'boot' }).filter((s) => !started.includes(s)));
    } catch (e) {
      skipped.push(`${def.id} (${(e as Error).message})`);
    }
  }
  const note = `${started.length} simulated services started`;
  return skipped.length ? `${note}; not started: ${skipped.join(', ')}` : note;
}

/** Current status of each service, combining live subsystems and the simulation model. */
export function getServices(): ServiceInfo[] {
  const p = runtime.persistence.get();
  const { files, dirs } = runtime.fs.counts();
  const run = serviceRuntime.get();
  const live: Record<string, Omit<ServiceInfo, 'id' | 'name' | 'kind'>> = {
    'desktop-shell': { state: runtime.phase.get() === 'desktop' ? 'running' : runtime.phase.get(), status: 'ok' },
    'window-manager': { state: `running · ${wm.windows.length} window(s)`, status: 'ok' },
    vfs: { state: `mounted · ${files} files, ${dirs} dirs`, status: 'ok' },
    persistence: {
      state: p.lastError ? `error · ${p.lastError}` : `${p.backend} · ${p.saves} save(s)`,
      status: p.lastError ? 'err' : p.backend === 'memory' ? 'warn' : 'ok',
    },
    'event-journal': { state: `running · ${events.total} events`, status: 'ok' },
    notifications: { state: settingsStore.get().dnd ? 'do not disturb' : settingsStore.get().notifications ? 'enabled' : 'toasts muted by user', status: 'ok' },
    metrics: { state: metrics.active ? 'sampling (1 Hz)' : 'idle until a monitor is open', status: 'ok' },
    'lunar-core': { state: 'not available in the browser build', status: 'muted' },
  };
  return SERVICE_DEFS.map((d) => {
    if (!d.controllable) return { id: d.id, name: d.name, kind: d.kind, ...live[d.id] };
    const r = run[d.id];
    const state = r.state === 'failed' ? `failed · ${r.lastError ?? 'unknown'}` : r.state;
    return { id: d.id, name: d.name, kind: d.kind, state, status: r.state === 'running' ? 'ok' : r.state === 'failed' ? 'err' : 'muted' };
  });
}
