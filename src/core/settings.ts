import { Store } from './store';

export type ThemeMode = 'dark' | 'light';
export type AccentId = 'crimson' | 'rose' | 'ember' | 'graphite';
export type WallpaperId = 'eclipse' | 'orbit' | 'lattice' | 'void' | 'dusk' | 'drift' | 'daycycle';
export type FontId = 'plex' | 'system' | 'mono';
export type RadiusId = 'sharp' | 'default' | 'round';
export type DensityId = 'compact' | 'comfortable';
export type DockPosition = 'bottom' | 'left' | 'right';
export type MotionPref = 'system' | 'full' | 'reduced';

export interface Settings {
  theme: ThemeMode;
  accent: AccentId;
  wallpaper: WallpaperId;
  scale: number;
  clock24h: boolean;
  clockSeconds: boolean;
  dockPosition: DockPosition;
  dockAutohide: boolean;
  motion: MotionPref;
  notifications: boolean;
  notificationDurationMs: number;
  restoreSession: boolean;
  fastBoot: boolean;
  displayName: string;
  font: FontId;
  radius: RadiusId;
  density: DensityId;
  /** Window background opacity (1 = opaque). */
  windowOpacity: number;
  blur: boolean;
  highContrast: boolean;
  /** Notification chime volume, 0–100 (0 = silent). */
  soundVolume: number;
  /** Do not disturb: notifications are recorded but no toasts or sounds. */
  dnd: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  accent: 'crimson',
  wallpaper: 'eclipse',
  scale: 1,
  clock24h: true,
  clockSeconds: false,
  dockPosition: 'bottom',
  dockAutohide: false,
  motion: 'system',
  notifications: true,
  notificationDurationMs: 4500,
  restoreSession: true,
  fastBoot: false,
  displayName: 'Pyxis Operator',
  font: 'plex',
  radius: 'default',
  density: 'comfortable',
  windowOpacity: 1,
  blur: false,
  highContrast: false,
  soundVolume: 0,
  dnd: false,
};

export const ACCENTS: Record<AccentId, { label: string; dark: string; light: string; soft: string }> = {
  crimson: { label: 'Lunar Crimson', dark: '#c0354c', light: '#a3243a', soft: '#f2c6cf' },
  rose: { label: 'Pale Rose', dark: '#e08da0', light: '#b4536b', soft: '#f7dbe2' },
  ember: { label: 'Ember', dark: '#d0603c', light: '#a9452a', soft: '#f3d0c3' },
  graphite: { label: 'Graphite', dark: '#a8a8ad', light: '#55555c', soft: '#e3e3e6' },
};

export const WALLPAPERS: Record<WallpaperId, string> = {
  eclipse: 'Eclipse',
  orbit: 'Orbit Lines',
  lattice: 'Lattice',
  void: 'Void',
  dusk: 'Dusk Gradient',
  drift: 'Drift (animated)',
  daycycle: 'Day Cycle (time-based)',
};

export const FONTS: Record<FontId, string> = { plex: 'IBM Plex Sans', system: 'System UI', mono: 'IBM Plex Mono' };
export const RADII: Record<RadiusId, string> = { sharp: 'Sharp', default: 'Default', round: 'Rounded' };
export const DENSITIES: Record<DensityId, string> = { compact: 'Compact', comfortable: 'Comfortable' };
export const OPACITIES = [1, 0.96, 0.92, 0.86];

export const SCALES = [0.875, 1, 1.125, 1.25];

const ENUMS: Partial<Record<keyof Settings, readonly unknown[]>> = {
  theme: ['dark', 'light'],
  accent: Object.keys(ACCENTS),
  wallpaper: Object.keys(WALLPAPERS),
  dockPosition: ['bottom', 'left', 'right'],
  motion: ['system', 'full', 'reduced'],
  scale: SCALES,
  font: Object.keys(FONTS),
  radius: Object.keys(RADII),
  density: Object.keys(DENSITIES),
  windowOpacity: OPACITIES,
};

/** Merge untrusted persisted data with defaults, discarding invalid values. */
export function sanitizeSettings(raw: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const v = r[key];
    if (v === undefined) continue;
    if (typeof v !== typeof DEFAULT_SETTINGS[key]) continue;
    const allowed = ENUMS[key];
    if (allowed && !allowed.includes(v)) continue;
    if (key === 'displayName') {
      const name = String(v).trim().slice(0, 40);
      if (name) out.displayName = name;
      continue;
    }
    if (key === 'soundVolume') {
      out.soundVolume = Math.round(Math.min(100, Math.max(0, Number(v) || 0)));
      continue;
    }
    if (key === 'notificationDurationMs') {
      out.notificationDurationMs = Math.min(15000, Math.max(1500, Number(v)));
      continue;
    }
    (out as unknown as Record<string, unknown>)[key] = v;
  }
  return out;
}

export const settingsStore = new Store<Settings>({ ...DEFAULT_SETTINGS });

export function updateSettings(patch: Partial<Settings>): void {
  settingsStore.set((prev) => sanitizeSettings({ ...prev, ...patch }));
}

export function prefersReducedMotion(s: Settings): boolean {
  if (s.motion === 'reduced') return true;
  if (s.motion === 'full') return false;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Apply settings to the document as CSS variables / data attributes. */
export function applySettingsToDocument(s: Settings, root: HTMLElement = document.documentElement): void {
  const accent = ACCENTS[s.accent];
  root.dataset.theme = s.theme;
  root.dataset.wallpaper = s.wallpaper;
  root.dataset.dock = s.dockPosition;
  root.dataset.motion = prefersReducedMotion(s) ? 'reduced' : 'full';
  root.style.setProperty('--accent', s.theme === 'dark' ? accent.dark : accent.light);
  root.style.setProperty('--accent-soft', accent.soft);
  root.style.setProperty('--ui-scale', String(s.scale));
  root.style.fontSize = `${14 * s.scale}px`;
  root.dataset.font = s.font;
  root.dataset.radius = s.radius;
  root.dataset.density = s.density;
  root.dataset.contrast = s.highContrast ? 'high' : 'normal';
  root.dataset.blur = s.blur ? 'on' : 'off';
  root.style.setProperty('--window-alpha', `${Math.round(s.windowOpacity * 100)}%`);
  root.dataset.daypart = daypart(new Date());
}

/** Coarse time of day used by the time-based wallpaper. */
export function daypart(d: Date): 'night' | 'dawn' | 'day' | 'dusk' {
  const h = d.getHours();
  if (h < 5 || h >= 21) return 'night';
  if (h < 9) return 'dawn';
  if (h < 17) return 'day';
  return 'dusk';
}
