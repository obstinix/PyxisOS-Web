import { APPS, AppId, getApp } from './apps';
import { wm, WORKSPACE_COUNT } from './windows';
import { ACCENTS, AccentId, updateSettings, settingsStore, WALLPAPERS, WallpaperId } from './settings';
import { runDiagnostics } from './diagnostics';
import { Capability } from './capabilities';
import { request, Subject } from './aegis';
import { getDef, isRunning, restartService, SERVICE_DEFS, serviceConfig, startService, stopService } from './services';
import { notifications } from './notifications';
import { runtime } from './system';
import { HOME } from './path';
import { events } from './events';
import { searchUrl } from './browser';
import { setUserFlag } from './userstate';

/**
 * Allowlisted actions. The command palette, the natural-language command bar
 * and the assistant can only trigger operations listed here; free text is
 * never executed. Each action declares the capability it needs and whether
 * it is destructive (which always requires confirmation).
 */
export interface Action {
  id: string;
  title: string;
  description: string;
  category: 'Applications' | 'Appearance' | 'System' | 'Services' | 'Files' | 'Windows' | 'Help' | 'Web';
  keywords: string[];
  capability?: Capability;
  destructive?: boolean;
  /** Short label for the argument the action takes, if any. */
  arg?: string;
  run: (arg?: string) => Promise<string> | string;
}

type ConfirmHandler = (title: string, message: string) => Promise<boolean>;
let confirmHandler: ConfirmHandler = async () => false;
export function setConfirmHandler(fn: ConfirmHandler): void {
  confirmHandler = fn;
}

const appActions: Action[] = APPS.map((a) => ({
  id: `open:${a.id}`,
  title: `Open ${a.name}`,
  description: a.description,
  category: 'Applications',
  keywords: [a.id, a.name, ...a.keywords],
  run: () => {
    wm.open(a.id);
    return `Opened ${a.name}`;
  },
}));

function serviceAction(verb: 'start' | 'stop' | 'restart'): Action {
  return {
    id: `service.${verb}`,
    title: `${verb[0].toUpperCase()}${verb.slice(1)} a service`,
    description: `${verb[0].toUpperCase()}${verb.slice(1)} a simulated PyxisOS service (${SERVICE_DEFS.filter((d) => d.controllable).map((d) => d.id).join(', ')})`,
    category: 'Services',
    keywords: [verb, 'service', 'daemon', 'systemctl'],
    capability: 'services.control',
    destructive: verb === 'stop',
    arg: 'service id',
    run: (id) => {
      const def = id ? getDef(id) : undefined;
      if (!def) throw new Error(`Unknown service “${id ?? ''}”`);
      if (verb === 'start') return `Started ${startService(def.id, { cascade: true, actor: 'action' }).join(', ') || `${def.name} (already running)`}`;
      if (verb === 'stop') return `Stopped ${stopService(def.id, { cascade: true, actor: 'action' }).join(', ') || `${def.name} (already stopped)`}`;
      restartService(def.id, { actor: 'action' });
      return `Restarted ${def.name}`;
    },
  };
}

export const ACTIONS: Action[] = [
  ...appActions,
  {
    id: 'theme.dark',
    title: 'Switch to dark theme',
    description: 'Use the dark appearance',
    category: 'Appearance',
    keywords: ['dark mode', 'night', 'theme'],
    capability: 'settings.write',
    run: () => (updateSettings({ theme: 'dark' }), 'Dark theme enabled'),
  },
  {
    id: 'theme.light',
    title: 'Switch to light theme',
    description: 'Use the light appearance',
    category: 'Appearance',
    keywords: ['light mode', 'day', 'theme'],
    capability: 'settings.write',
    run: () => (updateSettings({ theme: 'light' }), 'Light theme enabled'),
  },
  {
    id: 'wallpaper.set',
    title: 'Change wallpaper',
    description: `Set the wallpaper (${Object.keys(WALLPAPERS).join(', ')}); without an argument, cycles to the next one`,
    category: 'Appearance',
    keywords: ['wallpaper', 'background', 'desktop picture'],
    capability: 'settings.write',
    arg: 'wallpaper',
    run: (arg) => {
      const ids = Object.keys(WALLPAPERS) as WallpaperId[];
      const id = arg && (ids as string[]).includes(arg) ? (arg as WallpaperId) : ids[(ids.indexOf(settingsStore.get().wallpaper) + 1) % ids.length];
      updateSettings({ wallpaper: id });
      return `Wallpaper set to ${WALLPAPERS[id]}`;
    },
  },
  {
    id: 'accent.set',
    title: 'Change accent colour',
    description: `Set the accent colour (${Object.keys(ACCENTS).join(', ')})`,
    category: 'Appearance',
    keywords: ['accent', 'colour', 'color', 'highlight'],
    capability: 'settings.write',
    arg: 'accent',
    run: (arg) => {
      if (!arg || !(arg in ACCENTS)) throw new Error(`Unknown accent “${arg ?? ''}”`);
      updateSettings({ accent: arg as AccentId });
      return `Accent set to ${ACCENTS[arg as AccentId].label}`;
    },
  },
  {
    id: 'motion.reduce',
    title: 'Reduce motion',
    description: 'Turn off animations',
    category: 'Appearance',
    keywords: ['animation', 'reduced motion', 'accessibility'],
    capability: 'settings.write',
    run: () => (updateSettings({ motion: 'reduced' }), 'Animations reduced'),
  },
  {
    id: 'dnd.toggle',
    title: 'Toggle Do Not Disturb',
    description: 'Silence notification toasts and sounds (history is still kept)',
    category: 'System',
    keywords: ['quiet', 'mute', 'notifications', 'focus'],
    capability: 'settings.write',
    run: () => {
      const dnd = !settingsStore.get().dnd;
      updateSettings({ dnd });
      return dnd ? 'Do Not Disturb on' : 'Do Not Disturb off';
    },
  },
  {
    id: 'diagnostics.run',
    title: 'Run system diagnostics',
    description: 'Execute every health check and open the System Doctor',
    category: 'System',
    keywords: ['doctor', 'health', 'check', 'diagnose'],
    capability: 'diagnostics.run',
    run: async () => {
      const r = await runDiagnostics();
      wm.open('doctor');
      return `${r.summary.pass} passed, ${r.summary.warn} warnings, ${r.summary.fail} failed, ${r.summary.skip} skipped`;
    },
  },
  {
    id: 'journal.warnings',
    title: 'Show warnings and errors',
    description: 'Open the System Journal filtered to warnings and errors',
    category: 'System',
    keywords: ['boot warnings', 'errors', 'log', 'journal', 'problems'],
    run: (arg) => {
      wm.open('events', { level: 'problems', source: arg === 'boot' ? 'boot' : '' });
      return arg === 'boot' ? 'Showing boot warnings and errors' : 'Showing warnings and errors';
    },
  },
  {
    id: 'files.find',
    title: 'Find files',
    description: 'Search file names and contents in your home folder',
    category: 'Files',
    keywords: ['search', 'find', 'locate', 'files'],
    capability: 'fs.read',
    arg: 'text',
    run: (arg) => {
      const q = (arg ?? '').trim();
      if (!q) throw new Error('Tell me what to look for');
      const hits = runtime.fs.search(q, HOME, { content: true, limit: 20 });
      wm.open('files', { search: q });
      return hits.length ? `${hits.length} match(es): ${hits.slice(0, 5).map((h) => h.path).join(', ')}${hits.length > 5 ? '…' : ''}` : `No files match “${q}”`;
    },
  },
  {
    id: 'config.find',
    title: 'Show configuration files',
    description: 'Open the Configuration Editor',
    category: 'Files',
    keywords: ['config', 'configuration', 'settings.json', 'policy'],
    run: () => (wm.open('config'), 'Opened the Configuration Editor (settings.json, services.json, aegis-policy.json)'),
  },
  {
    id: 'services.show',
    title: 'Show active services',
    description: 'Open the Service Manager',
    category: 'Services',
    keywords: ['services', 'daemons', 'running'],
    run: () => (wm.open('services'), 'Opened the Service Manager'),
  },
  {
    id: 'services.recover',
    title: 'Restart stopped services',
    description: 'Start every simulated service that is enabled at boot but stopped or failed, with its dependencies',
    category: 'Services',
    keywords: ['recover', 'repair', 'restart', 'failed services'],
    capability: 'services.control',
    run: () => {
      const cfg = serviceConfig.get();
      const started: string[] = [];
      for (const d of SERVICE_DEFS.filter((x) => x.controllable && cfg[x.id]?.enabled && !isRunning(x.id))) {
        if (!isRunning(d.id)) started.push(...startService(d.id, { cascade: true, actor: 'recovery' }));
      }
      return started.length ? `Started ${[...new Set(started)].join(', ')}` : 'All enabled services were already running';
    },
  },
  serviceAction('start'),
  serviceAction('stop'),
  serviceAction('restart'),
  {
    id: 'workspace.switch',
    title: 'Switch workspace',
    description: `Go to workspace 1–${WORKSPACE_COUNT}`,
    category: 'Windows',
    keywords: ['workspace', 'desktop', 'virtual desktop'],
    arg: 'number',
    run: (arg) => {
      const n = Number(arg);
      if (!Number.isInteger(n) || n < 1 || n > WORKSPACE_COUNT) throw new Error(`Workspace must be 1–${WORKSPACE_COUNT}`);
      wm.switchWorkspace(n - 1);
      return `Switched to workspace ${n}`;
    },
  },
  {
    id: 'windows.minimize-all',
    title: 'Minimize all windows',
    description: 'Show the desktop on the current workspace',
    category: 'Windows',
    keywords: ['show desktop', 'hide', 'minimise'],
    run: () => {
      wm.visibleWindows.forEach((w) => wm.minimize(w.id));
      return 'Minimized all windows on this workspace';
    },
  },
  {
    id: 'windows.close-all',
    title: 'Close all windows',
    description: 'Close every window (apps with unsaved changes will ask)',
    category: 'Windows',
    keywords: ['close', 'quit all'],
    destructive: true,
    run: () => {
      const kept = [...wm.windows].filter((w) => !wm.close(w.id)).length;
      return kept ? `Closed windows; ${kept} kept open with unsaved changes` : 'Closed all windows';
    },
  },
  {
    id: 'notifications.clear',
    title: 'Clear notifications',
    description: 'Remove all notifications from the history',
    category: 'System',
    keywords: ['notifications', 'clear', 'dismiss'],
    run: () => (notifications.clear(), 'Notifications cleared'),
  },
  {
    id: 'web.search',
    title: 'Search the web',
    description: 'Search with DuckDuckGo and Wikipedia in Pyxis Browser',
    category: 'Web',
    keywords: ['search', 'web', 'duckduckgo', 'google', 'look up'],
    capability: 'network.navigate',
    arg: 'query',
    run: (arg) => {
      const q = (arg ?? '').trim();
      if (!q) throw new Error('Tell me what to search for');
      wm.open('browser', { url: searchUrl(q), nonce: Date.now() });
      return `Searching for “${q}”`;
    },
  },
  {
    id: 'session.lock',
    title: 'Lock session',
    description: 'Save and return to the login screen',
    category: 'System',
    keywords: ['lock', 'away'],
    run: () => (void runtime.lock(), 'Locking session'),
  },
  {
    id: 'help.tour',
    title: 'Start guided demo',
    description: 'Walk through the main features step by step',
    category: 'Help',
    keywords: ['tour', 'demo', 'walkthrough', 'guide', 'tutorial'],
    run: () => (setUserFlag('tourDone', false), window.dispatchEvent(new CustomEvent('pyxis:tour')), 'Starting the guided demo'),
  },
  {
    id: 'help.onboarding',
    title: 'Replay first-run setup',
    description: 'Show the welcome and setup steps again',
    category: 'Help',
    keywords: ['welcome', 'setup', 'onboarding', 'first run'],
    run: () => (window.dispatchEvent(new CustomEvent('pyxis:onboarding')), 'Opening first-run setup'),
  },
  {
    id: 'recovery.open',
    title: 'Open recovery options',
    description: 'Self-tests and safe reset options (reset itself always asks first)',
    category: 'System',
    keywords: ['reset', 'recovery', 'repair', 'factory', 'erase'],
    run: () => (wm.open('selftest'), 'Opened Self-Test & Recovery. Reset actions there explain what will be removed and ask for confirmation.'),
  },
];

export function getAction(id: string): Action | undefined {
  return ACTIONS.find((a) => a.id === id);
}

export interface ActionOutcome {
  ok: boolean;
  message: string;
  status: 'completed' | 'denied' | 'cancelled' | 'failed';
  auditId?: number;
}

/**
 * Run an allowlisted action on behalf of `subject`. Capability checks go
 * through Aegis; destructive actions always ask the user first.
 */
export async function runAction(id: string, arg: string | undefined, subject: Subject): Promise<ActionOutcome> {
  const action = getAction(id);
  if (!action) return { ok: false, status: 'denied', message: `“${id}” is not an allowed action` };
  let auditId: number | undefined;
  if (action.capability) {
    const rec = await request(subject, action.capability, `${action.title}${arg ? ` (${arg})` : ''}`);
    auditId = rec.id;
    if (rec.decision === 'deny') return { ok: false, status: 'denied', message: `Permission denied: ${rec.reason}`, auditId };
  }
  if (action.destructive) {
    const ok = await confirmHandler(action.title, `${action.description}${arg ? `\nTarget: ${arg}` : ''}`);
    if (!ok) return { ok: false, status: 'cancelled', message: 'Cancelled — nothing was changed', auditId };
  }
  try {
    const message = await action.run(arg);
    events.log('actions', `${subject}: ${action.title}${arg ? ` (${arg})` : ''} — ${message}`, 'info', { data: { action: id, subject } });
    return { ok: true, status: 'completed', message, auditId };
  } catch (e) {
    return { ok: false, status: 'failed', message: (e as Error).message, auditId };
  }
}

export function appForQuery(text: string): AppId | null {
  const t = text.toLowerCase();
  const hit = APPS.find((a) => t.includes(a.name.toLowerCase()) || t.includes(a.id)) ?? APPS.find((a) => a.keywords.some((k) => k.length > 3 && t.includes(k)));
  return hit ? hit.id : getApp(t)?.id ?? null;
}
