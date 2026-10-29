import { runtime } from './system';
import { wm } from './windows';
import { events } from './events';
import { settingsStore } from './settings';
import { metrics } from './metrics';

export type ServiceStatus = 'ok' | 'warn' | 'err' | 'muted';

export interface ServiceInfo {
  id: string;
  name: string;
  state: string;
  status: ServiceStatus;
  kind: 'LIVE' | 'NOT IMPLEMENTED' | 'UNAVAILABLE';
}

/** Current status of each simulation service, derived from live runtime state. */
export function getServices(): ServiceInfo[] {
  const p = runtime.persistence.get();
  const { files, dirs } = runtime.fs.counts();
  return [
    { id: 'desktop-shell', name: 'Desktop shell', state: runtime.phase.get() === 'desktop' ? 'running' : runtime.phase.get(), status: 'ok', kind: 'LIVE' },
    { id: 'window-manager', name: 'Window manager', state: `running · ${wm.windows.length} window(s)`, status: 'ok', kind: 'LIVE' },
    { id: 'vfs', name: 'Virtual filesystem', state: `mounted · ${files} files, ${dirs} dirs`, status: 'ok', kind: 'LIVE' },
    {
      id: 'persistence',
      name: 'Persistence',
      state: p.lastError ? `error · ${p.lastError}` : `${p.backend} · ${p.saves} save(s)`,
      status: p.lastError ? 'err' : p.backend === 'memory' ? 'warn' : 'ok',
      kind: 'LIVE',
    },
    { id: 'event-journal', name: 'Event journal', state: `running · ${events.total} events`, status: 'ok', kind: 'LIVE' },
    {
      id: 'notifications',
      name: 'Notifications',
      state: settingsStore.get().notifications ? 'enabled' : 'toasts muted by user',
      status: 'ok',
      kind: 'LIVE',
    },
    { id: 'metrics', name: 'Metrics sampler', state: metrics.active ? 'sampling (1 Hz)' : 'idle until a monitor is open', status: 'ok', kind: 'LIVE' },
    { id: 'lunar-core', name: 'Lunar Core kernel', state: 'not available in the browser build', status: 'muted', kind: 'UNAVAILABLE' },
    { id: 'astral-consensus', name: 'Astral Consensus Engine', state: 'planned — not implemented', status: 'muted', kind: 'NOT IMPLEMENTED' },
  ];
}
