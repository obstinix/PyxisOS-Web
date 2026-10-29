/**
 * TypeScript port of the deterministic Astral Consensus arbitrator from
 * obstinix/PyxisOS native/consensus/src/deterministic.rs (reviewed
 * 2026-10-29). The agent rules, domain weighting (2.5×), conditional-approval
 * discount (0.8×), conflict rule and outcome thresholds follow that source.
 * It runs in the browser on demo proposals; it is not connected to a running
 * PyxisOS system.
 */
export type Target = 'Kernel' | 'Memory' | 'Security' | 'Storage' | 'Drivers' | 'Network' | 'Userspace';
export type Priority = 'Low' | 'Normal' | 'High' | 'Critical';
export type Stance = 'Approve' | 'Reject' | 'Abstain' | 'ConditionalApproval';
export type EvidenceCategory = 'Telemetry' | 'SafetyInvariant' | 'ResourceConstraint' | 'AuditLog' | 'Benchmark';
export type Outcome = 'Accepted' | 'Rejected' | 'SplitConsensus' | 'QuorumFailed' | 'EscalationRequired';

export const TARGETS: Target[] = ['Kernel', 'Memory', 'Security', 'Storage', 'Drivers', 'Network', 'Userspace'];
export const PRIORITIES: Priority[] = ['Low', 'Normal', 'High', 'Critical'];

export interface Proposal {
  id: string;
  author: string;
  target: Target;
  action: string;
  parameters: [string, string][];
  requiredCapability: number;
  priority: Priority;
}

export interface Evidence {
  id: string;
  proposalId: string;
  provider: string;
  category: EvidenceCategory;
  summary: string;
  confidence: number;
}

export interface Vote {
  agent: string;
  stance: Stance;
  confidence: number;
  rationale: string;
  conditions: string[];
  weight: number;
}

export interface Decision {
  outcome: Outcome;
  score: number;
  approve: number;
  reject: number;
  conflict: boolean;
  conflictDetails?: string;
  securityVeto: boolean;
  rationale: string;
  votes: Vote[];
}

export interface Agent {
  id: string;
  name: string;
  domain: Target;
  evaluate: (p: Proposal, ev: Evidence[]) => Omit<Vote, 'agent' | 'weight'>;
}

const vote = (stance: Stance, confidence: number, rationale: string, conditions: string[] = []) => ({ stance, confidence, rationale, conditions });

export const AGENTS: Agent[] = [
  {
    id: 'security',
    name: 'Security & Privilege Auditor',
    domain: 'Security',
    evaluate(p) {
      if (p.action.includes('unrestricted_root') || p.action.includes('raw_io_bypass')) {
        return vote('Reject', 0.99, 'Violation of fundamental PyxisOS security policy: unrestricted raw bypass rejected');
      }
      if ((p.target === 'Kernel' || p.target === 'Security') && p.requiredCapability < 100) {
        return vote('Reject', 0.95, 'Insufficient cryptographic capability token for Kernel/Security mutation');
      }
      return vote('Approve', 0.92, 'Security invariants and capability bounds verified');
    },
  },
  {
    id: 'resource',
    name: 'Resource & Memory Profiler',
    domain: 'Memory',
    evaluate(p, ev) {
      const pressure = ev.some((e) => e.category === 'ResourceConstraint' && e.confidence > 0.8);
      if (pressure && p.priority !== 'Critical') {
        return vote('ConditionalApproval', 0.85, 'Resource pressure detected; execution deferred to low-load scheduling slice', ['defer_until_load_under_70_pct']);
      }
      for (const [k, v] of p.parameters) {
        if (k === 'alloc_pages' && Number(v) > 16384) return vote('Reject', 0.9, 'Single physical frame allocation exceeds 64MB kernel quota');
      }
      return vote('Approve', 0.88, 'Resource and memory allocation within acceptable limits');
    },
  },
  {
    id: 'logic',
    name: 'Logical Consistency & Invariant Checker',
    domain: 'Kernel',
    evaluate(p) {
      if (!p.action.trim()) return vote('Reject', 0.95, 'Malformed proposal: empty action specification');
      return vote('Approve', 0.91, 'Action syntax and dependency invariants validated');
    },
  },
];

/**
 * Arbitrate one proposal. `offline` lists agents that are unavailable in this
 * run (a demo failure scenario); they abstain, which the source treats as
 * contributing no weight.
 */
export function arbitrate(p: Proposal, evidence: Evidence[], offline: string[] = []): Decision {
  let approveWeight = 0;
  let totalWeight = 0;
  let approve = 0;
  let reject = 0;
  let hiApprove = false;
  let hiReject = false;
  let securityVeto = false;
  const votes: Vote[] = [];
  for (const a of AGENTS) {
    const v = offline.includes(a.id) ? vote('Abstain', 0, 'Agent unavailable (failure scenario)') : a.evaluate(p, evidence);
    const weight = a.domain === p.target ? 2.5 : 1;
    if (v.stance === 'Approve') {
      approveWeight += weight * v.confidence;
      totalWeight += weight;
      approve++;
      if (v.confidence >= 0.85) hiApprove = true;
    } else if (v.stance === 'ConditionalApproval') {
      approveWeight += weight * v.confidence * 0.8;
      totalWeight += weight;
      approve++;
    } else if (v.stance === 'Reject') {
      totalWeight += weight;
      reject++;
      if (v.confidence >= 0.85) hiReject = true;
      if (a.id === 'security') securityVeto = true;
    }
    votes.push({ agent: a.id, weight, ...v });
  }
  const score = totalWeight > 0 ? approveWeight / totalWeight : 0;
  const conflict = hiApprove && hiReject;
  let outcome: Outcome;
  if (securityVeto) outcome = 'Rejected';
  else if (conflict && p.priority === 'Critical') outcome = 'EscalationRequired';
  else if (score >= 0.65 && approve >= reject) outcome = 'Accepted';
  else if (approve === reject && approve > 0) outcome = 'SplitConsensus';
  else outcome = 'Rejected';
  return {
    outcome,
    score,
    approve,
    reject,
    conflict,
    conflictDetails: conflict ? `Material conflict detected on proposal '${p.id}': concurrent high-confidence Approve and Reject votes` : undefined,
    securityVeto,
    rationale: `Consensus outcome ${outcome} with score ${score.toFixed(2)} (Approvals: ${approve}, Rejections: ${reject})`,
    votes,
  };
}

export interface Scenario {
  id: string;
  label: string;
  proposal: Proposal;
  evidence: Evidence[];
}

const P = (id: string, target: Target, action: string, cap: number, priority: Priority, params: [string, string][] = []): Proposal => ({
  id,
  author: 'planner',
  target,
  action,
  parameters: params,
  requiredCapability: cap,
  priority,
});

export const SCENARIOS: Scenario[] = [
  { id: 'cache', label: 'Grow driver page cache', proposal: P('prop-cache', 'Memory', 'grow_page_cache', 120, 'Normal', [['alloc_pages', '2048']]), evidence: [] },
  {
    id: 'pressure',
    label: 'Allocation under memory pressure',
    proposal: P('prop-pressure', 'Memory', 'grow_page_cache', 120, 'Normal', [['alloc_pages', '4096']]),
    evidence: [{ id: 'ev-1', proposalId: 'prop-pressure', provider: 'telemetry', category: 'ResourceConstraint', summary: 'Memory utilisation 91% over the last 60 s', confidence: 0.9 }],
  },
  { id: 'huge', label: 'Oversized frame allocation', proposal: P('prop-huge', 'Memory', 'reserve_dma_region', 150, 'High', [['alloc_pages', '32768']]), evidence: [] },
  { id: 'lowcap', label: 'Kernel patch with weak capability', proposal: P('prop-kpatch', 'Kernel', 'hot_patch_scheduler', 40, 'High'), evidence: [] },
  { id: 'bypass', label: 'Driver requests raw_io_bypass', proposal: P('prop-bypass', 'Drivers', 'enable_raw_io_bypass', 200, 'Critical'), evidence: [] },
  { id: 'critical-conflict', label: 'Critical oversized allocation (conflict)', proposal: P('prop-crit', 'Storage', 'reserve_journal_buffer', 150, 'Critical', [['alloc_pages', '20000']]), evidence: [] },
];
