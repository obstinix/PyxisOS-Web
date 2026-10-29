import { wm } from './windows';
import { getApp } from './apps';
import { SERVICE_DEFS, serviceRuntime, stopService } from './services';
import { events } from './events';

export type ProcState = 'running' | 'sleeping' | 'background' | 'failed' | 'stopped';

export interface ProcInfo {
  pid: number;
  ppid: number;
  name: string;
  /** What the entry represents. */
  type: 'kernel' | 'service' | 'shell' | 'app' | 'tab';
  state: ProcState;
  /** LIVE = a real object in the web demo (window, live subsystem); SIMULATED = modelled only. */
  kind: 'LIVE' | 'SIMULATED';
  /** Simulated resource estimates — not measurements. */
  cpu: number;
  memKiB: number;
  started: number;
  detail: string;
  windowId?: string;
  serviceId?: string;
}

const pids = new Map<string, number>();
let nextPid = 1000;
function pidFor(key: string): number {
  let pid = pids.get(key);
  if (!pid) {
    pid = nextPid++;
    pids.set(key, pid);
  }
  return pid;
}

/** Deterministic pseudo-random value in [0,1) from a string and time bucket. */
function noise(key: string, bucket: number): number {
  let h = 2166136261 ^ bucket;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

const browserTabs: { list: () => { id: string; title: string; url: string }[] } = { list: () => [] };
/** The browser registers its tab list so tabs appear as child processes. */
export function setTabSource(fn: () => { id: string; title: string; url: string }[]): void {
  browserTabs.list = fn;
}

/**
 * Process table of the demo. Windows and tabs are real objects in the web
 * app; kernel and daemon entries model PyxisOS. CPU and memory figures are
 * simulated estimates derived deterministically, not host measurements.
 */
export function listProcesses(now = Date.now()): ProcInfo[] {
  const bucket = Math.floor(now / 2000);
  const est = (key: string, base: number, spread: number) => +(base + noise(key, bucket) * spread).toFixed(1);
  const out: ProcInfo[] = [
    { pid: 1, ppid: 0, name: 'lunar-init', type: 'kernel', state: 'running', kind: 'SIMULATED', cpu: est('init', 0, 0.3), memKiB: 1840, started: 0, detail: 'Init process model (PID 1)' },
    { pid: 2, ppid: 0, name: 'lunar-sched', type: 'kernel', state: 'running', kind: 'SIMULATED', cpu: est('sched', 0.2, 0.6), memKiB: 512, started: 0, detail: 'Scheduler model' },
  ];
  const run = serviceRuntime.get();
  SERVICE_DEFS.forEach((d, i) => {
    if (d.kind === 'UNAVAILABLE' || d.kind === 'NOT IMPLEMENTED') return;
    const r = run[d.id];
    const state: ProcState = d.controllable ? (r?.state === 'running' ? 'sleeping' : r?.state === 'failed' ? 'failed' : 'stopped') : 'running';
    if (state === 'stopped') return;
    out.push({
      pid: 100 + i,
      ppid: 1,
      name: d.id,
      type: 'service',
      state,
      kind: d.kind === 'LIVE' ? 'LIVE' : 'SIMULATED',
      cpu: state === 'failed' ? 0 : est(d.id, 0, 1.5),
      memKiB: Math.round(900 + noise(d.id, 0) * 3000),
      started: r?.since ?? 0,
      detail: d.description,
      serviceId: d.id,
    });
  });
  out.push({ pid: 300, ppid: 1, name: 'pyxis-shell', type: 'shell', state: 'running', kind: 'LIVE', cpu: est('shell', 0.5, 2), memKiB: 12400, started: 0, detail: 'Desktop shell (React UI)' });
  const { activeWorkspace, focusedId } = wm.state;
  for (const w of wm.windows) {
    const pid = pidFor(w.id);
    const state: ProcState = w.minimized ? 'sleeping' : w.workspace !== activeWorkspace ? 'background' : 'running';
    out.push({
      pid,
      ppid: 300,
      name: w.appId,
      type: 'app',
      state,
      kind: 'LIVE',
      cpu: state === 'running' ? est(w.id, w.id === focusedId ? 1.5 : 0.2, 4) : est(w.id, 0, 0.3),
      memKiB: Math.round(4000 + noise(w.appId, 0) * 22000),
      started: w.openedAt,
      detail: `${getApp(w.appId)?.name ?? w.appId} — window "${w.title}" on workspace ${w.workspace + 1}`,
      windowId: w.id,
    });
    if (w.appId === 'browser') {
      for (const t of browserTabs.list()) {
        out.push({
          pid: pidFor(`tab:${t.id}`),
          ppid: pid,
          name: `tab: ${t.title || t.url}`.slice(0, 40),
          type: 'tab',
          state: 'running',
          kind: 'LIVE',
          cpu: est(t.id, 0, 2),
          memKiB: Math.round(3000 + noise(t.url, 0) * 30000),
          started: w.openedAt,
          detail: t.url,
        });
      }
    }
  }
  return out;
}

/** End a process. Windows close (respecting unsaved-change guards); simulated services stop. */
export function endProcess(pid: number): { ok: boolean; message: string } {
  const p = listProcesses().find((x) => x.pid === pid);
  if (!p) return { ok: false, message: `No process with PID ${pid}` };
  if (p.type === 'kernel' || p.type === 'shell') return { ok: false, message: `${p.name} is protected and cannot be ended` };
  if (p.type === 'tab') return { ok: false, message: 'Close browser tabs from the browser' };
  if (p.windowId) {
    const closed = wm.close(p.windowId);
    events.log('process', `End process ${pid} (${p.name}): ${closed ? 'window closed' : 'cancelled by app'}`, closed ? 'info' : 'warn');
    return closed ? { ok: true, message: `Closed ${p.name}` } : { ok: false, message: `${p.name} refused to close (unsaved changes)` };
  }
  if (p.serviceId) {
    const def = SERVICE_DEFS.find((d) => d.id === p.serviceId)!;
    if (!def.controllable) return { ok: false, message: `${def.name} is a live subsystem of the web demo and cannot be ended` };
    try {
      stopService(def.id, { cascade: true, actor: 'process-explorer' });
      return { ok: true, message: `Stopped ${def.name}` };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }
  return { ok: false, message: 'Not supported' };
}
