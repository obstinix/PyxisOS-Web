import { Capability } from './capabilities';
import { bestScore } from './fuzzy';

/**
 * Application registry metadata. UI components are attached separately in
 * `src/apps/index.tsx` so the registry can be inspected by the terminal,
 * diagnostics and tests without loading React.
 */
export type AppId =
  | 'system-center'
  | 'terminal'
  | 'files'
  | 'editor'
  | 'monitor'
  | 'settings'
  | 'architecture'
  | 'astral'
  | 'events'
  | 'about'
  | 'browser'
  | 'doctor'
  | 'services'
  | 'processes'
  | 'config'
  | 'sysinfo'
  | 'consensus'
  | 'aegis'
  | 'bootlab'
  | 'correlation'
  | 'activity'
  | 'selftest';

export type AppCategory = 'System' | 'Utilities' | 'Internet' | 'Developer' | 'PyxisOS';
export const CATEGORIES: AppCategory[] = ['System', 'Utilities', 'Internet', 'Developer', 'PyxisOS'];

export interface AppMeta {
  id: AppId;
  name: string;
  description: string;
  category: AppCategory;
  /** Single-instance apps focus their existing window instead of opening another. */
  singleton: boolean;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  /** Whether the app appears in the dock by default. */
  pinned: boolean;
  keywords: string[];
  /** Aegis capabilities the app declares. Undeclared capabilities are denied. */
  capabilities: Capability[];
}

export const APPS: AppMeta[] = [
  {
    id: 'system-center',
    name: 'System Center',
    description: 'PyxisOS identity, runtime status, diagnostics and services',
    category: 'System',
    singleton: true,
    defaultSize: { w: 920, h: 620 },
    minSize: { w: 520, h: 380 },
    pinned: true,
    keywords: ['dashboard', 'overview', 'status', 'home'],
    capabilities: ['fs.read', 'diagnostics.run'],
  },
  {
    id: 'terminal',
    name: 'Pyxis Terminal',
    description: 'Command shell over the virtual filesystem and simulation runtime',
    category: 'System',
    singleton: false,
    defaultSize: { w: 760, h: 480 },
    minSize: { w: 380, h: 220 },
    pinned: true,
    keywords: ['shell', 'console', 'cli', 'command'],
    capabilities: ['fs.read', 'fs.write', 'fs.delete', 'diagnostics.run', 'services.control', 'process.control'],
  },
  {
    id: 'files',
    name: 'Files',
    description: 'Browse and manage the virtual filesystem',
    category: 'Utilities',
    singleton: false,
    defaultSize: { w: 860, h: 540 },
    minSize: { w: 460, h: 300 },
    pinned: true,
    keywords: ['file manager', 'explorer', 'folders', 'documents'],
    capabilities: ['fs.read', 'fs.write', 'fs.delete'],
  },
  {
    id: 'editor',
    name: 'Text Editor',
    description: 'Edit text files stored in the virtual filesystem',
    category: 'Utilities',
    singleton: true,
    defaultSize: { w: 800, h: 560 },
    minSize: { w: 420, h: 260 },
    pinned: true,
    keywords: ['text', 'notes', 'write', 'code'],
    capabilities: ['fs.read', 'fs.write'],
  },
  {
    id: 'monitor',
    name: 'System Monitor',
    description: 'Live browser runtime metrics and simulation resource usage',
    category: 'System',
    singleton: true,
    defaultSize: { w: 860, h: 580 },
    minSize: { w: 480, h: 340 },
    pinned: true,
    keywords: ['performance', 'memory', 'tasks', 'processes', 'activity'],
    capabilities: ['process.control'],
  },
  {
    id: 'settings',
    name: 'Settings',
    description: 'Appearance, desktop, notifications and session preferences',
    category: 'System',
    singleton: true,
    defaultSize: { w: 780, h: 560 },
    minSize: { w: 460, h: 340 },
    pinned: true,
    keywords: ['preferences', 'theme', 'wallpaper', 'appearance', 'config'],
    capabilities: ['settings.write', 'system.reset'],
  },
  {
    id: 'architecture',
    name: 'Architecture Explorer',
    description: 'Interactive map of PyxisOS components and their status',
    category: 'PyxisOS',
    singleton: true,
    defaultSize: { w: 940, h: 600 },
    minSize: { w: 520, h: 360 },
    pinned: false,
    keywords: ['lunar core', 'kernel', 'design', 'components', 'diagram'],
    capabilities: [],
  },
  {
    id: 'astral',
    name: 'Astral Intelligence',
    description: 'Local rule-based assistant that explains diagnostics and status',
    category: 'PyxisOS',
    singleton: true,
    defaultSize: { w: 720, h: 560 },
    minSize: { w: 420, h: 320 },
    pinned: false,
    keywords: ['assistant', 'help', 'ai', 'explain', 'advisor'],
    capabilities: ['fs.read', 'settings.write', 'diagnostics.run', 'services.control', 'network.navigate'],
  },
  {
    id: 'events',
    name: 'System Journal',
    description: 'Searchable journal of system and boot events',
    category: 'System',
    singleton: true,
    defaultSize: { w: 720, h: 480 },
    minSize: { w: 420, h: 260 },
    pinned: false,
    keywords: ['log', 'journal', 'history', 'events', 'boot log', 'syslog'],
    capabilities: ['fs.write'],
  },
  {
    id: 'about',
    name: 'About PyxisOS',
    description: 'Version, licensing and simulation boundaries',
    category: 'PyxisOS',
    singleton: true,
    defaultSize: { w: 560, h: 520 },
    minSize: { w: 380, h: 320 },
    pinned: false,
    keywords: ['version', 'license', 'credits', 'info'],
    capabilities: [],
  },
  {
    id: 'browser',
    name: 'Pyxis Browser',
    description: 'Web browser shell with tabs, history and bookmarks; search via DuckDuckGo and Wikipedia',
    category: 'Internet',
    singleton: true,
    defaultSize: { w: 1000, h: 640 },
    minSize: { w: 460, h: 320 },
    pinned: true,
    keywords: ['web', 'internet', 'duckduckgo', 'search', 'url', 'firefox', 'tabs'],
    capabilities: ['network.navigate'],
  },
  {
    id: 'doctor',
    name: 'System Doctor',
    description: 'Explainable diagnostics with evidence, remediation and reports',
    category: 'System',
    singleton: true,
    defaultSize: { w: 900, h: 600 },
    minSize: { w: 480, h: 340 },
    pinned: false,
    keywords: ['diagnostics', 'health', 'check', 'doctor', 'repair'],
    capabilities: ['diagnostics.run', 'fs.write', 'services.control'],
  },
  {
    id: 'services',
    name: 'Service Manager',
    description: 'Start, stop and configure system services with dependency checks',
    category: 'System',
    singleton: true,
    defaultSize: { w: 900, h: 560 },
    minSize: { w: 480, h: 320 },
    pinned: false,
    keywords: ['daemon', 'systemctl', 'units', 'startup'],
    capabilities: ['services.control'],
  },
  {
    id: 'processes',
    name: 'Process Explorer',
    description: 'Process tree of the demo with states, resources and controls',
    category: 'System',
    singleton: true,
    defaultSize: { w: 880, h: 560 },
    minSize: { w: 480, h: 320 },
    pinned: false,
    keywords: ['ps', 'tasks', 'pid', 'kill', 'tree'],
    capabilities: ['process.control'],
  },
  {
    id: 'config',
    name: 'Configuration Editor',
    description: 'Validated editing of PyxisOS configuration with history and revert',
    category: 'Developer',
    singleton: true,
    defaultSize: { w: 900, h: 580 },
    minSize: { w: 480, h: 320 },
    pinned: false,
    keywords: ['config', 'json', 'policy', 'settings.json', 'etc'],
    capabilities: ['fs.read', 'settings.write', 'services.control'],
  },
  {
    id: 'sysinfo',
    name: 'System Information',
    description: 'Project, build, runtime and browser environment details',
    category: 'System',
    singleton: true,
    defaultSize: { w: 820, h: 580 },
    minSize: { w: 460, h: 320 },
    pinned: false,
    keywords: ['about', 'version', 'build', 'environment', 'hardware', 'sysinfo'],
    capabilities: [],
  },
  {
    id: 'consensus',
    name: 'Astral Consensus Visualizer',
    description: 'Step-through simulation of a leader-based consensus round',
    category: 'PyxisOS',
    singleton: true,
    defaultSize: { w: 960, h: 620 },
    minSize: { w: 520, h: 360 },
    pinned: false,
    keywords: ['consensus', 'nodes', 'raft', 'quorum', 'astral', 'distributed'],
    capabilities: [],
  },
  {
    id: 'aegis',
    name: 'Aegis Security Center',
    description: 'Capability declarations, permission policy and audit log',
    category: 'PyxisOS',
    singleton: true,
    defaultSize: { w: 940, h: 600 },
    minSize: { w: 500, h: 340 },
    pinned: false,
    keywords: ['security', 'permissions', 'capabilities', 'policy', 'audit'],
    capabilities: [],
  },
  {
    id: 'bootlab',
    name: 'Kernel & Boot Lab',
    description: 'Step-by-step model of the Lunar Core boot path and failure scenarios',
    category: 'PyxisOS',
    singleton: true,
    defaultSize: { w: 940, h: 600 },
    minSize: { w: 500, h: 340 },
    pinned: false,
    keywords: ['boot', 'kernel', 'bootloader', 'memory', 'init', 'lunar core'],
    capabilities: [],
  },
  {
    id: 'correlation',
    name: 'Event Correlation',
    description: 'Groups related journal events into explainable incidents',
    category: 'Developer',
    singleton: true,
    defaultSize: { w: 900, h: 580 },
    minSize: { w: 480, h: 320 },
    pinned: false,
    keywords: ['incidents', 'timeline', 'root cause', 'correlate'],
    capabilities: [],
  },
  {
    id: 'activity',
    name: 'Assistant Activity',
    description: 'What the assistant proposed, which permissions it used, and the outcomes',
    category: 'PyxisOS',
    singleton: true,
    defaultSize: { w: 860, h: 560 },
    minSize: { w: 460, h: 320 },
    pinned: false,
    keywords: ['ai', 'audit', 'assistant', 'approvals', 'tools'],
    capabilities: [],
  },
  {
    id: 'selftest',
    name: 'Self-Test & Recovery',
    description: 'Runs functional self-tests of the web demo and offers safe recovery',
    category: 'System',
    singleton: true,
    defaultSize: { w: 880, h: 600 },
    minSize: { w: 480, h: 340 },
    pinned: false,
    keywords: ['test', 'recovery', 'reset', 'repair', 'self-test'],
    capabilities: ['system.reset', 'settings.write'],
  },
];

export function getApp(id: string): AppMeta | undefined {
  return APPS.find((a) => a.id === id);
}

/** Rank apps against a launcher query by name, id, keywords and description (fuzzy). */
export function searchApps(query: string): AppMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return APPS;
  return APPS.map((a) => ({ a, score: bestScore(q, [a.name, a.id, ...a.keywords, a.description]) }))
    .filter((s) => s.score >= 20)
    .sort((x, y) => y.score - x.score || x.a.name.localeCompare(y.a.name))
    .map((s) => s.a);
}
