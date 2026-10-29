import { appForQuery, getAction } from './actions';
import { ACCENTS, WALLPAPERS } from './settings';
import { SERVICE_DEFS } from './services';
import { asArray, persisted } from './persisted';
import { Capability } from './capabilities';

/**
 * Deterministic natural-language intent parser. It maps a sentence to one
 * allowlisted action (see actions.ts) using explicit patterns, and explains
 * which pattern matched. Anything it does not recognise is refused.
 */
export interface Intent {
  actionId: string;
  arg?: string;
  /** The pattern that matched, shown to the user. */
  pattern: string;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[“”"'`]/g, '')
    .replace(/[?!.]+$/g, '')
    .replace(/^(hey |ok )?(pyxis|astral)[,:]?\s+/, '')
    .replace(/\b(please|can you|could you|would you|i want to|i'd like to|for me|now)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function serviceIn(t: string): string | undefined {
  return SERVICE_DEFS.find((d) => d.controllable && (t.includes(d.id) || t.includes(d.id.replace(/-?d$/, '').replace('-', ' '))))?.id;
}

type Pattern = { name: string; re: RegExp; to: (m: RegExpMatchArray, t: string) => Intent | null };

const PATTERNS: Pattern[] = [
  { name: 'search the web for …', re: /^(?:search|look up|google|duckduckgo)(?: the web| online)?(?: for)? (.+)$/, to: (m) => ({ actionId: 'web.search', arg: m[1], pattern: '' }) },
  { name: 'find … files', re: /^(?:find|locate|search)(?: for)? (?:the )?config(?:uration)? files?$/, to: () => ({ actionId: 'config.find', pattern: '' }) },
  { name: 'find files named/containing …', re: /^(?:find|locate|search for|search)(?: files?)?(?: (?:named|called|containing|with|about))? (.+?)(?: files?)?$/, to: (m) => ({ actionId: 'files.find', arg: m[1], pattern: '' }) },
  { name: 'run diagnostics / doctor', re: /\b(run|start|do)\b.*\b(diagnos\w*|doctor|health ?check|checks)\b|^(diagnose|check health)/, to: () => ({ actionId: 'diagnostics.run', pattern: '' }) },
  { name: 'show boot warnings', re: /\b(boot)\b.*\b(warn\w*|errors?|problems?|issues?)\b|\b(warn\w*|errors?)\b.*\bboot\b/, to: () => ({ actionId: 'journal.warnings', arg: 'boot', pattern: '' }) },
  { name: 'show warnings/errors', re: /\b(show|list|what are)\b.*\b(warnings?|errors?|problems?)\b/, to: () => ({ actionId: 'journal.warnings', pattern: '' }) },
  { name: 'show services', re: /\b(show|list|which|what)\b.*\bservices?\b/, to: () => ({ actionId: 'services.show', pattern: '' }) },
  {
    name: 'start/stop/restart <service>',
    re: /^(start|stop|restart|kill)\b(.*)$/,
    to: (m, t) => {
      const id = serviceIn(t);
      if (!id) return null;
      const verb = m[1] === 'kill' ? 'stop' : m[1];
      return { actionId: `service.${verb}`, arg: id, pattern: '' };
    },
  },
  { name: 'dark/light theme', re: /\b(dark|light)\b.*\b(mode|theme)\b|\b(theme|mode)\b.*\b(dark|light)\b/, to: (_m, t) => ({ actionId: t.includes('dark') ? 'theme.dark' : 'theme.light', pattern: '' }) },
  {
    name: 'change wallpaper (to …)',
    re: /\b(wallpaper|background)\b/,
    to: (_m, t) => {
      const id = Object.entries(WALLPAPERS).find(([k, label]) => t.includes(k) || t.includes(label.toLowerCase().split(' ')[0]))?.[0];
      return { actionId: 'wallpaper.set', arg: id, pattern: '' };
    },
  },
  {
    name: 'accent colour …',
    re: /\b(accent|colou?r)\b/,
    to: (_m, t) => {
      const id = Object.entries(ACCENTS).find(([k, v]) => t.includes(k) || t.includes(v.label.toLowerCase()))?.[0];
      return id ? { actionId: 'accent.set', arg: id, pattern: '' } : null;
    },
  },
  { name: 'reduce motion', re: /\b(reduce|disable|turn off|stop)\b.*\b(motion|animations?)\b/, to: () => ({ actionId: 'motion.reduce', pattern: '' }) },
  { name: 'do not disturb', re: /\b(do not disturb|dnd|mute notifications|quiet mode)\b/, to: () => ({ actionId: 'dnd.toggle', pattern: '' }) },
  { name: 'workspace N', re: /\bworkspace (\d)\b|\b(go to|switch to) (?:desktop|workspace) (\d)\b/, to: (m) => ({ actionId: 'workspace.switch', arg: m[1] ?? m[3], pattern: '' }) },
  { name: 'minimize all', re: /\b(minimi[sz]e all|show (the )?desktop|hide (all )?windows)\b/, to: () => ({ actionId: 'windows.minimize-all', pattern: '' }) },
  { name: 'close all windows', re: /\bclose (all|every)( the)? windows?\b/, to: () => ({ actionId: 'windows.close-all', pattern: '' }) },
  { name: 'clear notifications', re: /\bclear (all )?notifications\b/, to: () => ({ actionId: 'notifications.clear', pattern: '' }) },
  { name: 'lock', re: /^lock( (the )?(screen|session))?$/, to: () => ({ actionId: 'session.lock', pattern: '' }) },
  { name: 'tour / demo', re: /\b(tour|walkthrough|guided demo|show me around)\b/, to: () => ({ actionId: 'help.tour', pattern: '' }) },
  { name: 'reset / recovery', re: /\b(reset|factory|erase|wipe|recover\w*)\b/, to: () => ({ actionId: 'recovery.open', pattern: '' }) },
  {
    name: 'open/launch <app>',
    re: /^(?:open|launch|start|show|run|bring up)(?: the| my)? (.+)$/,
    to: (m) => {
      const id = appForQuery(m[1]);
      return id ? { actionId: `open:${id}`, pattern: '' } : null;
    },
  },
];

export function parseIntent(text: string): Intent | null {
  const t = norm(text);
  if (!t) return null;
  for (const p of PATTERNS) {
    const m = t.match(p.re);
    if (!m) continue;
    const intent = p.to(m, t);
    if (intent && getAction(intent.actionId)) return { ...intent, pattern: p.name };
  }
  return null;
}

export const SUPPORTED_PHRASES = PATTERNS.map((p) => p.name);

// ------------------------------------------------------------------ activity log

export type ActivityStatus = 'proposed' | 'completed' | 'denied' | 'cancelled' | 'failed' | 'dismissed';

export interface ActivityRecord {
  id: number;
  time: number;
  input: string;
  actionId: string;
  arg?: string;
  pattern: string;
  capability?: Capability;
  destructive: boolean;
  status: ActivityStatus;
  outcome?: string;
  auditId?: number;
}

export const activity = persisted<ActivityRecord[]>({
  key: 'assistant.activity',
  version: 1,
  defaults: () => [],
  load: (raw) =>
    asArray(raw, 300).filter(
      (r): r is ActivityRecord => !!r && typeof r === 'object' && typeof (r as ActivityRecord).id === 'number' && typeof (r as ActivityRecord).actionId === 'string',
    ),
});

let nextActivity = 1;
export function proposeActivity(input: string, intent: Intent): ActivityRecord {
  nextActivity = Math.max(nextActivity, (activity.get()[0]?.id ?? 0) + 1);
  const action = getAction(intent.actionId)!;
  const rec: ActivityRecord = {
    id: nextActivity++,
    time: Date.now(),
    input: input.slice(0, 300),
    actionId: intent.actionId,
    arg: intent.arg,
    pattern: intent.pattern,
    capability: action.capability,
    destructive: !!action.destructive,
    status: 'proposed',
  };
  activity.set((a) => [rec, ...a].slice(0, 300));
  return rec;
}

export function settleActivity(id: number, status: ActivityStatus, outcome?: string, auditId?: number): void {
  activity.set((a) => a.map((r) => (r.id === id ? { ...r, status, outcome, auditId } : r)));
}
