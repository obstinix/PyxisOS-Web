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
  | 'about';

export interface AppMeta {
  id: AppId;
  name: string;
  description: string;
  category: 'System' | 'Utilities' | 'Project';
  /** Single-instance apps focus their existing window instead of opening another. */
  singleton: boolean;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  /** Whether the app appears in the dock by default. */
  pinned: boolean;
  keywords: string[];
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
  },
  {
    id: 'architecture',
    name: 'Architecture Explorer',
    description: 'Interactive map of PyxisOS components and their status',
    category: 'Project',
    singleton: true,
    defaultSize: { w: 940, h: 600 },
    minSize: { w: 520, h: 360 },
    pinned: false,
    keywords: ['lunar core', 'kernel', 'design', 'components', 'diagram'],
  },
  {
    id: 'astral',
    name: 'Astral Intelligence',
    description: 'Local rule-based assistant that explains diagnostics and status',
    category: 'Project',
    singleton: true,
    defaultSize: { w: 720, h: 560 },
    minSize: { w: 420, h: 320 },
    pinned: false,
    keywords: ['assistant', 'help', 'ai', 'explain', 'advisor'],
  },
  {
    id: 'events',
    name: 'Event Journal',
    description: 'Chronological journal of system events in this session',
    category: 'System',
    singleton: true,
    defaultSize: { w: 720, h: 480 },
    minSize: { w: 420, h: 260 },
    pinned: false,
    keywords: ['log', 'journal', 'history', 'events'],
  },
  {
    id: 'about',
    name: 'About PyxisOS',
    description: 'Version, licensing and simulation boundaries',
    category: 'Project',
    singleton: true,
    defaultSize: { w: 560, h: 520 },
    minSize: { w: 380, h: 320 },
    pinned: false,
    keywords: ['version', 'license', 'credits', 'info'],
  },
];

export function getApp(id: string): AppMeta | undefined {
  return APPS.find((a) => a.id === id);
}

/** Rank apps against a launcher query by name, id and keywords. */
export function searchApps(query: string): AppMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return APPS;
  const scored = APPS.map((a) => {
    const name = a.name.toLowerCase();
    let score = 0;
    if (name.startsWith(q)) score = 4;
    else if (name.split(/\s+/).some((w) => w.startsWith(q))) score = 3;
    else if (name.includes(q) || a.id.includes(q)) score = 2;
    else if (a.keywords.some((k) => k.includes(q)) || a.description.toLowerCase().includes(q)) score = 1;
    return { a, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((x, y) => y.score - x.score || x.a.name.localeCompare(y.a.name))
    .map((s) => s.a);
}
