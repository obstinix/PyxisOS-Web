import { SystemEvent } from './events';
import { SERVICE_DEFS } from './services';

/**
 * Deterministic event correlation. Each rule groups journal events that are
 * related by explicit references (a dependency named in the event data) or by
 * source and time. Groups describe correlation, not proven causation; the
 * confidence and explanation say which.
 */
export type Confidence = 'high' | 'medium' | 'low';

export interface Incident {
  id: string;
  rule: string;
  title: string;
  severity: 'error' | 'warn' | 'info';
  confidence: Confidence;
  /** Why these events were grouped and what they do (and do not) show. */
  explanation: string;
  possibleCause?: string;
  events: SystemEvent[];
  firstAt: number;
  lastAt: number;
}

const problem = (e: SystemEvent) => e.level === 'warn' || e.level === 'error';

function incident(rule: string, title: string, evs: SystemEvent[], confidence: Confidence, explanation: string, possibleCause?: string): Incident {
  const sorted = [...evs].sort((a, b) => a.id - b.id);
  return {
    id: `${rule}:${sorted[0].id}`,
    rule,
    title,
    severity: sorted.some((e) => e.level === 'error') ? 'error' : sorted.some((e) => e.level === 'warn') ? 'warn' : 'info',
    confidence,
    explanation,
    possibleCause,
    events: sorted,
    firstAt: sorted[0].time,
    lastAt: sorted[sorted.length - 1].time,
  };
}

/** Rule 1: a service failure and the dependents that name it as their cause. */
function serviceCascades(list: SystemEvent[], used: Set<number>): Incident[] {
  const out: Incident[] = [];
  for (const root of list) {
    if (root.source !== 'services' || root.level !== 'error' || root.data?.cause || used.has(root.id)) continue;
    const svc = String(root.data?.service ?? '');
    const followers = list.filter((e) => e.source === 'services' && e.data?.cause === svc && e.id > root.id && e.time - root.time < 5000);
    if (!followers.length) continue;
    [root, ...followers].forEach((e) => used.add(e.id));
    out.push(
      incident(
        'service-cascade',
        `${svc} failure took down ${followers.length} dependent service(s)`,
        [root, ...followers],
        'high',
        `Each dependent's failure event names ${svc} as its cause, and the dependency is declared in the service definitions.`,
        `${svc} failed (${root.message.split(': ').slice(1).join(': ') || 'see event'})`,
      ),
    );
  }
  return out;
}

/** Rule 2: Aegis denials that state the policy daemon was stopped, linked to the stop/failure event. */
function brokerFailClosed(list: SystemEvent[], used: Set<number>): Incident[] {
  const denials = list.filter((e) => e.source === 'aegis' && e.data?.basis === 'daemon-stopped' && !used.has(e.id));
  if (!denials.length) return [];
  const cause = [...list].reverse().find((e) => e.source === 'services' && e.data?.service === 'aegis-policyd' && /Stopped|failed/.test(e.message) && e.id < denials[0].id);
  const evs = cause ? [cause, ...denials] : denials;
  evs.forEach((e) => used.add(e.id));
  return [
    incident(
      'aegis-fail-closed',
      `${denials.length} permission request(s) denied while aegis-policyd was down`,
      evs,
      cause ? 'high' : 'medium',
      'Each denial records the basis "daemon-stopped": the broker refuses every request when the simulated policy daemon is not running.',
      cause ? cause.message : 'aegis-policyd was not running (stop event not in the current journal window)',
    ),
  ];
}

/** Rule 3: warnings or errors during boot. */
function bootProblems(list: SystemEvent[], used: Set<number>): Incident[] {
  const evs = list.filter((e) => e.source === 'boot' && problem(e) && !used.has(e.id));
  if (!evs.length) return [];
  evs.forEach((e) => used.add(e.id));
  return [incident('boot', `Boot completed with ${evs.length} warning(s)/error(s)`, evs, 'high', 'All events were emitted by boot stages of this session.')];
}

/** Rule 4: diagnostics problems preceded by storage problems within 60 s. */
function storageDiagnostics(list: SystemEvent[], used: Set<number>): Incident[] {
  const out: Incident[] = [];
  for (const d of list) {
    if (d.source !== 'diagnostics' || !problem(d) || used.has(d.id)) continue;
    const prior = list.filter((e) => e.source === 'storage' && problem(e) && e.time <= d.time && d.time - e.time < 60000 && !used.has(e.id));
    if (!prior.length) continue;
    [...prior, d].forEach((e) => used.add(e.id));
    out.push(
      incident(
        'storage-diagnostics',
        'Diagnostics reported problems shortly after storage errors',
        [...prior, d],
        'medium',
        'The events are close in time and storage is checked by diagnostics. This is a likely relationship, not a proven cause.',
        prior[0].message,
      ),
    );
  }
  return out;
}

/** Rule 5: bursts of three or more problems from one source within 30 s. */
function bursts(list: SystemEvent[], used: Set<number>): Incident[] {
  const out: Incident[] = [];
  const bySource = new Map<string, SystemEvent[]>();
  for (const e of list) if (problem(e) && !used.has(e.id)) bySource.set(e.source, [...(bySource.get(e.source) ?? []), e]);
  for (const [source, evs] of bySource) {
    let group: SystemEvent[] = [];
    const flush = () => {
      if (group.length >= 3) {
        group.forEach((e) => used.add(e.id));
        out.push(incident('burst', `${group.length} problems from ${source} within 30 s`, group, 'low', 'Grouped only because they share a source and occurred close together. They may be unrelated.'));
      }
      group = [];
    };
    for (const e of evs) {
      if (group.length && e.time - group[0].time > 30000) flush();
      group.push(e);
    }
    flush();
  }
  return out;
}

export function correlate(list: SystemEvent[]): Incident[] {
  const used = new Set<number>();
  const incidents = [
    ...serviceCascades(list, used),
    ...brokerFailClosed(list, used),
    ...bootProblems(list, used),
    ...storageDiagnostics(list, used),
    ...bursts(list, used),
  ];
  return incidents.sort((a, b) => b.lastAt - a.lastAt);
}

export const CORRELATION_RULES: { id: string; description: string; confidence: Confidence }[] = [
  { id: 'service-cascade', description: 'Service failure plus dependents whose events name it as the cause (declared dependencies: ' + SERVICE_DEFS.filter((d) => d.deps.length && d.controllable).map((d) => `${d.id} → ${d.deps.join(', ')}`).join('; ') + ')', confidence: 'high' },
  { id: 'aegis-fail-closed', description: 'Permission denials recorded with basis "daemon-stopped", linked to the aegis-policyd stop/failure', confidence: 'high' },
  { id: 'boot', description: 'Warnings and errors emitted by boot stages', confidence: 'high' },
  { id: 'storage-diagnostics', description: 'Diagnostics problems within 60 s after storage errors', confidence: 'medium' },
  { id: 'burst', description: 'Three or more problems from the same source within 30 s', confidence: 'low' },
];
