import { Capability, CAPABILITIES } from './capabilities';
import { AppId, getApp } from './apps';
import { asArray, asObject, persisted } from './persisted';
import { events } from './events';
import { isRunning } from './services';

/**
 * Aegis capability broker for PyxisOS-Web.
 *
 * This is an application-level policy layer: PyxisOS-Web's own code asks the
 * broker before performing sensitive operations on behalf of an app, and the
 * decision is recorded in an audit log. It is not kernel isolation and it does
 * not restrict what the browser itself can do.
 */
export type PolicyRule = 'allow' | 'deny' | 'ask';
export type Subject = AppId | 'system';

export interface AuditRecord {
  id: number;
  time: number;
  subject: Subject;
  capability: Capability;
  decision: 'allow' | 'deny';
  /** Why the broker decided as it did. */
  basis: 'direct' | 'declared' | 'undeclared' | 'policy-allow' | 'policy-deny' | 'user-approved' | 'user-denied' | 'daemon-stopped';
  reason: string;
}

export const policy = persisted<Record<string, PolicyRule>>({
  key: 'aegis',
  version: 1,
  defaults: () => ({ 'astral:settings.write': 'ask', 'astral:services.control': 'ask' }),
  load(raw) {
    const r = asObject(raw);
    const out: Record<string, PolicyRule> = {};
    for (const [k, v] of Object.entries(r)) {
      if (isPolicyKey(k) && (v === 'allow' || v === 'deny' || v === 'ask')) out[k] = v;
    }
    return out;
  },
});

export const audit = persisted<AuditRecord[]>({
  key: 'aegis.audit',
  version: 1,
  defaults: () => [],
  load(raw) {
    return asArray(raw, 300).filter(
      (r): r is AuditRecord =>
        !!r && typeof r === 'object' && typeof (r as AuditRecord).id === 'number' && typeof (r as AuditRecord).capability === 'string' && (r as AuditRecord).capability in CAPABILITIES,
    );
  },
});

export function isPolicyKey(key: string): boolean {
  const [subject, cap] = key.split(':');
  return (subject === 'system' || !!getApp(subject)) && !!cap && cap in CAPABILITIES;
}

type AskHandler = (subject: Subject, capability: Capability, reason: string) => Promise<boolean>;
let askHandler: AskHandler = async () => false;

/** The desktop registers a dialog-based handler; without one, "ask" means deny. */
export function setAskHandler(fn: AskHandler): void {
  askHandler = fn;
}

export function declared(subject: Subject, capability: Capability): boolean {
  if (subject === 'system') return true;
  return getApp(subject)?.capabilities.includes(capability) ?? false;
}

export function ruleFor(subject: Subject, capability: Capability): PolicyRule | 'declared' | 'undeclared' {
  const rule = policy.get()[`${subject}:${capability}`];
  if (rule) return rule;
  return declared(subject, capability) ? 'declared' : 'undeclared';
}

export function setRule(subject: Subject, capability: Capability, rule: PolicyRule | null): void {
  const key = `${subject}:${capability}`;
  policy.set((p) => {
    const next = { ...p };
    if (rule) next[key] = rule;
    else delete next[key];
    return next;
  });
  events.log('aegis', `Policy ${key} → ${rule ?? 'default'}`, 'info');
}

let nextId = 1;
function record(subject: Subject, capability: Capability, decision: 'allow' | 'deny', basis: AuditRecord['basis'], reason: string): AuditRecord {
  nextId = Math.max(nextId, (audit.get()[0]?.id ?? 0) + 1);
  const rec: AuditRecord = { id: nextId++, time: Date.now(), subject, capability, decision, basis, reason };
  audit.set((a) => [rec, ...a].slice(0, 300));
  events.log('aegis', `${decision === 'allow' ? 'Allowed' : 'Denied'} ${subject} → ${capability} (${basis})`, decision === 'allow' ? 'info' : 'warn', {
    data: { subject, capability, basis },
  });
  return rec;
}

/**
 * Ask the broker for a capability. Undeclared capabilities are always denied;
 * declared ones follow the policy (allow / deny / ask the user). If the
 * simulated aegis-policyd service is stopped the broker fails closed.
 */
export async function request(subject: Subject, capability: Capability, reason: string): Promise<AuditRecord> {
  // 'system' is the user acting directly through the desktop (palette, menus): recorded, never blocked.
  if (subject === 'system') return record(subject, capability, 'allow', 'direct', reason);
  if (!isRunning('aegis-policyd')) return record(subject, capability, 'deny', 'daemon-stopped', `${reason} — aegis-policyd is stopped, so the broker fails closed`);
  const rule = ruleFor(subject, capability);
  // A policy override can never grant a capability the app did not declare.
  if (!declared(subject, capability)) return record(subject, capability, 'deny', 'undeclared', `${reason} — ${subject} does not declare ${capability}`);
  if (rule === 'deny') return record(subject, capability, 'deny', 'policy-deny', reason);
  if (rule === 'ask') {
    const ok = await askHandler(subject, capability, reason);
    return record(subject, capability, ok ? 'allow' : 'deny', ok ? 'user-approved' : 'user-denied', reason);
  }
  return record(subject, capability, 'allow', rule === 'allow' ? 'policy-allow' : 'declared', reason);
}

export function clearAudit(): void {
  audit.set([]);
  events.log('aegis', 'Audit log cleared', 'info');
}
