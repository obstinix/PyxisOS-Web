import { DEFAULT_SETTINGS, sanitizeSettings, Settings, settingsStore } from './settings';
import { SERVICE_DEFS, serviceConfig } from './services';
import { isPolicyKey, policy, PolicyRule } from './aegis';
import { asArray, persisted } from './persisted';
import { events } from './events';
import { runtime } from './system';

/**
 * Configuration files edited by the Configuration Editor. Each file is a JSON
 * view of a real store: saving validates the text and applies it, so the
 * running desktop changes immediately. Read-only mirrors are published under
 * /system/config so the terminal can read them.
 */
export interface ConfigFile {
  id: string;
  name: string;
  description: string;
  read: () => string;
  /** Returns a list of problems; empty means valid. */
  validate: (value: unknown) => string[];
  apply: (value: unknown) => void;
}

const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export const CONFIG_FILES: ConfigFile[] = [
  {
    id: 'settings',
    name: 'settings.json',
    description: 'Desktop preferences (theme, wallpaper, dock, notifications…). Applied immediately on save.',
    read: () => json(settingsStore.get()),
    validate(v) {
      if (!isPlainObject(v)) return ['Top level must be a JSON object'];
      const errors: string[] = [];
      const clean = sanitizeSettings(v) as unknown as Record<string, unknown>;
      for (const [k, val] of Object.entries(v)) {
        if (!(k in DEFAULT_SETTINGS)) errors.push(`Unknown key "${k}"`);
        else if (JSON.stringify(clean[k]) !== JSON.stringify(val)) errors.push(`Invalid value for "${k}": ${JSON.stringify(val)}`);
      }
      return errors;
    },
    apply(v) {
      settingsStore.set(sanitizeSettings({ ...settingsStore.get(), ...(v as Partial<Settings>) }));
    },
  },
  {
    id: 'services',
    name: 'services.json',
    description: 'Startup configuration of simulated services ({ "id": { "enabled": true } }). Takes effect at next boot.',
    read: () => json(serviceConfig.get()),
    validate(v) {
      if (!isPlainObject(v)) return ['Top level must be a JSON object'];
      const errors: string[] = [];
      const ids = SERVICE_DEFS.filter((d) => d.controllable).map((d) => d.id);
      for (const [k, val] of Object.entries(v)) {
        if (!ids.includes(k)) errors.push(`Unknown or uncontrollable service "${k}" (valid: ${ids.join(', ')})`);
        else if (!isPlainObject(val) || typeof val.enabled !== 'boolean' || Object.keys(val).length !== 1) errors.push(`"${k}" must be { "enabled": true|false }`);
      }
      return errors;
    },
    apply(v) {
      serviceConfig.set((c) => ({ ...c, ...(v as Record<string, { enabled: boolean }>) }));
    },
  },
  {
    id: 'aegis',
    name: 'aegis-policy.json',
    description: 'Aegis policy overrides ("app:capability": "allow" | "deny" | "ask"). Overrides cannot grant undeclared capabilities.',
    read: () => json(policy.get()),
    validate(v) {
      if (!isPlainObject(v)) return ['Top level must be a JSON object'];
      const errors: string[] = [];
      for (const [k, val] of Object.entries(v)) {
        if (!isPolicyKey(k)) errors.push(`Invalid key "${k}" — expected "<app-id>:<capability>"`);
        else if (val !== 'allow' && val !== 'deny' && val !== 'ask') errors.push(`"${k}" must be "allow", "deny" or "ask"`);
      }
      return errors;
    },
    apply(v) {
      policy.set({ ...(v as Record<string, PolicyRule>) });
    },
  },
];

export function getConfig(id: string): ConfigFile | undefined {
  return CONFIG_FILES.find((c) => c.id === id);
}

export interface ParseResult {
  ok: boolean;
  errors: string[];
  value?: unknown;
}

export function parseConfig(file: ConfigFile, text: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`JSON syntax error: ${(e as Error).message}`] };
  }
  const errors = file.validate(value);
  return { ok: errors.length === 0, errors, value };
}

export interface ConfigRevision {
  file: string;
  time: number;
  before: string;
  after: string;
}

export const configHistory = persisted<ConfigRevision[]>({
  key: 'config.history',
  version: 1,
  defaults: () => [],
  load: (raw) =>
    asArray(raw, 50).filter(
      (r): r is ConfigRevision =>
        !!r && typeof r === 'object' && typeof (r as ConfigRevision).file === 'string' && typeof (r as ConfigRevision).before === 'string' && typeof (r as ConfigRevision).after === 'string',
    ),
});

/** Validate, apply and record a configuration change. */
export function saveConfig(id: string, text: string, actor = 'config'): ParseResult {
  const file = getConfig(id);
  if (!file) return { ok: false, errors: [`Unknown configuration file ${id}`] };
  const result = parseConfig(file, text);
  if (!result.ok) {
    events.log('config', `Rejected invalid ${file.name}: ${result.errors[0]}`, 'warn', { data: { file: file.name, actor } });
    return result;
  }
  const before = file.read();
  file.apply(result.value);
  const after = file.read();
  if (before !== after) {
    configHistory.set((h) => [{ file: id, time: Date.now(), before, after }, ...h].slice(0, 50));
    events.log('config', `Saved ${file.name}`, 'success', { data: { file: file.name, actor } });
  }
  return result;
}

/** Publish read-only mirrors of every configuration file under /system/config. */
export function mirrorConfig(): void {
  const files: Record<string, string> = {};
  for (const c of CONFIG_FILES) files[c.name] = c.read();
  runtime.fs.installSystemSubdir('config', files);
}

let mirrorTimer: ReturnType<typeof setTimeout> | null = null;
export function startConfigMirror(): () => void {
  mirrorConfig();
  const schedule = () => {
    if (mirrorTimer) clearTimeout(mirrorTimer);
    mirrorTimer = setTimeout(mirrorConfig, 250);
  };
  const subs = [settingsStore.subscribe(schedule), serviceConfig.subscribe(schedule), policy.subscribe(schedule)];
  return () => subs.forEach((u) => u());
}
