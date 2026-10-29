import { AppId, APPS } from './apps';
import { diagnosticsStore, runDiagnostics, DiagnosticReport } from './diagnostics';
import { runtime } from './system';
import { wm } from './windows';
import { events } from './events';
import { MAX_TOTAL_BYTES } from './vfs';
import { getServices, isRunning, SERVICE_DEFS } from './services';
import { parseIntent, proposeActivity, settleActivity, SUPPORTED_PHRASES } from './intents';
import { getAction, runAction } from './actions';

export interface AstralAction {
  label: string;
  app?: AppId;
  props?: Record<string, unknown>;
  prompt?: string;
}

export interface AstralProposal {
  activityId: number;
  actionId: string;
  arg?: string;
  title: string;
  pattern: string;
  capability?: string;
  destructive: boolean;
  /** Set once the proposal ran automatically (no capability, not destructive). */
  outcome?: { ok: boolean; message: string };
}

export interface AstralReply {
  text: string[];
  actions?: AstralAction[];
  proposal?: AstralProposal;
  /** Which rule produced the answer — shown so the user can see how it was derived. */
  rule: string;
}

function kib(n: number): string {
  return `${(n / 1024).toFixed(1)} KiB`;
}

async function ensureReport(): Promise<DiagnosticReport> {
  return diagnosticsStore.get() ?? (await runDiagnostics());
}

/** Recommendations derived from real runtime conditions. */
export function recommendations(report: DiagnosticReport | null): string[] {
  const out: string[] = [];
  const p = runtime.persistence.get();
  if (p.backend === 'memory') out.push('Browser storage is unavailable, so nothing will persist. Leave private browsing or allow site data, then restart.');
  if (p.lastError) out.push(`The last save failed (${p.lastError}). Free browser storage space or export your profile from Settings.`);
  const used = runtime.fs.totalBytes() / MAX_TOTAL_BYTES;
  if (used > 0.8) out.push(`The virtual disk is ${(used * 100).toFixed(0)}% full. Remove large files from ~/Downloads or /tmp.`);
  if (wm.windows.length > 8) out.push(`${wm.windows.length} windows are open. Closing unused ones keeps the desktop responsive.`);
  for (const r of report?.results ?? []) {
    if (r.status === 'fail') out.push(`Check “${r.name}” failed: ${r.detail}. Re-run diagnostics after addressing it.`);
  }
  if (!report) out.push('Diagnostics have not run yet this session. Run them to get a verified picture.');
  if (typeof navigator !== 'undefined' && !navigator.onLine) out.push('You are offline. That is fine — PyxisOS-Web needs no network once loaded.');
  return out;
}

type Rule = { id: string; match: RegExp; answer: (q: string) => Promise<AstralReply> | AstralReply };

const rules: Rule[] = [
  {
    id: 'capabilities',
    match: /\b(who are you|what (are|can) you|help|capabilit|are you (an )?ai|llm|gpt|model)\b/,
    answer: () => ({
      rule: 'capabilities',
      text: [
        'I am Astral Intelligence in its first, local form: a rule-based assistant. I do not use a language model or any network service.',
        'I read real state from this session — diagnostics, services, storage, the virtual filesystem and open windows — and explain it.',
        'Try: “system status”, “explain diagnostics”, “what should I do?”, “storage”, “how do I create a file?”, or “what is Lunar Core?”.',
        'I can also carry out allowlisted actions such as “open the system monitor”, “show me the boot warnings”, “change the wallpaper” or “run the system doctor”. Actions that need a permission wait for your approval.',
      ],
      actions: [
        { label: 'System status', prompt: 'system status' },
        { label: 'Explain diagnostics', prompt: 'explain diagnostics' },
      ],
    }),
  },
  {
    id: 'run-diagnostics',
    match: /\b(run|rerun|re-run)\b.*\bdiagnos/,
    answer: async () => {
      const report = await runDiagnostics();
      return {
        rule: 'run-diagnostics',
        text: [`Diagnostics re-run: ${report.summary.pass} passed, ${report.summary.warn} warnings, ${report.summary.fail} failed, ${report.summary.skip} skipped.`],
        actions: [{ label: 'Explain results', prompt: 'explain diagnostics' }],
      };
    },
  },
  {
    id: 'diagnostics',
    match: /\b(diagnos|doctor|check|health|warning|fail|problem|error|issue)/,
    answer: async () => {
      const report = await ensureReport();
      const { pass, warn, fail, skip } = report.summary;
      const text = [
        `The last diagnostic run (${new Date(report.ranAt).toLocaleTimeString()}) executed ${report.results.length} checks in this browser: ${pass} passed, ${warn} warnings, ${fail} failed, ${skip} skipped.`,
      ];
      const notable = report.results.filter((r) => r.status === 'warn' || r.status === 'fail');
      if (!notable.length) text.push('Nothing needs attention. Every executable check passed.');
      for (const r of notable) text.push(`${r.status === 'fail' ? 'Failure' : 'Warning'} — ${r.name}: ${r.detail}.`);
      const skipped = report.results.filter((r) => r.status === 'skip');
      if (skipped.length) text.push(`Skipped checks are not failures: ${skipped.map((r) => r.name).join(', ')} cannot run in a browser build.`);
      return { rule: 'diagnostics', text, actions: [{ label: 'Open System Center', app: 'system-center' }, { label: 'Re-run diagnostics', prompt: 'run diagnostics' }] };
    },
  },
  {
    id: 'recommend',
    match: /\b(recommend|suggest|should i|advice|next step|improve|optimi)/,
    answer: async () => {
      const recs = recommendations(diagnosticsStore.get());
      return {
        rule: 'recommend',
        text: recs.length ? ['Based on current conditions:', ...recs.map((r) => `• ${r}`)] : ['No action is needed right now. Storage is healthy, saves are succeeding and no checks have failed.'],
        actions: [{ label: 'System Monitor', app: 'monitor' }],
      };
    },
  },
  {
    id: 'status',
    match: /\b(status|summary|summari|overview|how is|state|services?)\b/,
    answer: () => {
      const services = getServices();
      const p = runtime.persistence.get();
      const { files, dirs } = runtime.fs.counts();
      return {
        rule: 'status',
        text: [
          `Session up ${Math.round(runtime.uptimeMs() / 60000)} min, ${wm.windows.length} window(s) open, ${events.total} events recorded.`,
          `Virtual filesystem: ${files} files in ${dirs} folders, ${kib(runtime.fs.totalBytes())}. Storage backend: ${p.backend}${p.lastError ? ` (last save failed: ${p.lastError})` : ''}.`,
          `Services: ${services.filter((s) => s.status === 'ok').length} running normally, ${services.filter((s) => s.status === 'err').length} failed, ${services.filter((s) => s.status === 'muted').length} stopped or unavailable in the browser build.`,
          ...SERVICE_DEFS.filter((d) => d.controllable && !isRunning(d.id)).map((d) => `• ${d.id} is not running — ${d.affects ?? ''}`),
        ],
        actions: [
          { label: 'Open System Center', app: 'system-center' },
          { label: 'Service Manager', app: 'services' },
        ],
      };
    },
  },
  {
    id: 'storage',
    match: /\b(storage|disk|space|quota|persist|save|indexeddb)/,
    answer: () => {
      const used = runtime.fs.totalBytes();
      const p = runtime.persistence.get();
      return {
        rule: 'storage',
        text: [
          `Files are stored with ${p.backend}. The virtual disk uses ${kib(used)} of its ${MAX_TOTAL_BYTES / 1048576} MiB quota (${((used / MAX_TOTAL_BYTES) * 100).toFixed(1)}%).`,
          p.lastSaveAt ? `${p.saves} autosave(s) so far; the latest at ${new Date(p.lastSaveAt).toLocaleTimeString()}.` : 'No autosave has been needed yet this session.',
          'Data stays in this browser profile. Use Settings → Session & data to export a backup.',
        ],
        actions: [{ label: 'Open Settings', app: 'settings', props: { section: 'session' } }],
      };
    },
  },
  {
    id: 'kernel',
    match: /\b(lunar|kernel|native|real os|hardware|boot)/,
    answer: () => ({
      rule: 'kernel',
      text: [
        'Lunar Core is the PyxisOS microkernel, developed natively. This browser build does not boot it.',
        'Kernel identifiers you see (lunar-core 0.1.0-sim) label the JavaScript simulation layer. Hardware values come only from what the browser exposes, such as logical core count.',
      ],
      actions: [
        { label: 'Kernel & Boot Lab', app: 'bootlab' },
        { label: 'Architecture Explorer', app: 'architecture' },
      ],
    }),
  },
  {
    id: 'consensus',
    match: /\b(consensus|arbitrat|agents? vote)/,
    answer: () => ({
      rule: 'consensus',
      text: [
        'Astral Consensus is in development in the native PyxisOS project (native/consensus): specialised agents vote on structured proposals with evidence and confidence, and an arbitrator synthesises a decision.',
        'The Consensus Visualizer runs a TypeScript port of its deterministic arbitrator on demo proposals. I do not use it to make decisions — my answers come from fixed rules.',
      ],
      actions: [{ label: 'Consensus Visualizer', app: 'consensus' }],
    }),
  },
  {
    id: 'aegis',
    match: /\b(aegis|permission|capabilit\w* (model|token)|security (model|center))/,
    answer: () => ({
      rule: 'aegis',
      text: [
        'In PyxisOS, Aegis is a planned capability-based security layer (unforgeable tokens whose delegated rights can never exceed the parent).',
        'Here, the Aegis Security Center applies the same idea at application level: apps declare capabilities, undeclared ones are denied, and every decision is audited. It is not kernel isolation.',
        isRunning('aegis-policyd') ? 'aegis-policyd is running, so requests are evaluated against policy.' : 'aegis-policyd is stopped, so every app request is currently denied (fail closed).',
      ],
      actions: [{ label: 'Aegis Security Center', app: 'aegis' }],
    }),
  },
  {
    id: 'browser',
    match: /\b(browser|internet|web ?page|firefox|duckduckgo|iframe)/,
    answer: () => ({
      rule: 'browser',
      text: [
        'Pyxis Browser uses your own browser engine: pages load in sandboxed iframes, and search uses the DuckDuckGo Instant Answer and Wikipedia APIs.',
        'Sites that forbid embedding (GitHub, DuckDuckGo, Google…) open in a real browser tab instead. It is not Firefox and not a separate engine.',
      ],
      actions: [{ label: 'Open Pyxis Browser', app: 'browser' }],
    }),
  },
  {
    id: 'commands',
    match: /\b(commands?|what can i (say|type|ask)|natural language|phrases?)\b/,
    answer: () => ({
      rule: 'commands',
      text: ['I understand these command patterns (anything else is refused):', ...SUPPORTED_PHRASES.map((p) => `• ${p}`), 'The Terminal has its own commands; type “help” there.'],
      actions: [{ label: 'Assistant Activity', app: 'activity' }],
    }),
  },
  {
    id: 'howto-files',
    match: /\b(create|make|new|write|edit|delete|remove|copy|move|rename)\b.*\b(file|folder|directory|dir)/,
    answer: () => ({
      rule: 'howto-files',
      text: [
        'In the Terminal: mkdir notes · touch notes/todo.txt · echo "hello" > notes/todo.txt · cat notes/todo.txt · cp, mv and rm work as usual.',
        'In Files: right-click empty space for New file / New folder; right-click an item to rename, copy, cut, duplicate, export or delete.',
        'Both use the same virtual filesystem, so changes appear everywhere immediately.',
      ],
      actions: [
        { label: 'Open Terminal', app: 'terminal' },
        { label: 'Open Files', app: 'files' },
      ],
    }),
  },
  {
    id: 'apps',
    match: /\b(apps?|applications?|programs?|open)\b/,
    answer: () => ({
      rule: 'apps',
      text: [`${APPS.length} applications are registered:`, ...APPS.map((a) => `• ${a.name} — ${a.description}`)],
      actions: APPS.slice(0, 3).map((a) => ({ label: a.name, app: a.id })),
    }),
  },
];

const QUESTION = /^(what|why|how|who|when|where|which|is|are|can|could|does|do|explain|tell me|describe)\b/;

/** Turn a recognised command into a proposal; low-risk actions run immediately. */
async function propose(question: string): Promise<AstralReply | null> {
  const intent = parseIntent(question);
  if (!intent) return null;
  const action = getAction(intent.actionId)!;
  const rec = proposeActivity(question, intent);
  const proposal: AstralProposal = {
    activityId: rec.id,
    actionId: action.id,
    arg: intent.arg,
    title: `${action.title}${intent.arg ? ` — ${intent.arg}` : ''}`,
    pattern: intent.pattern,
    capability: action.capability,
    destructive: !!action.destructive,
  };
  if (!action.capability && !action.destructive) {
    const out = await runAction(action.id, intent.arg, 'astral');
    settleActivity(rec.id, out.status, out.message, out.auditId);
    proposal.outcome = { ok: out.ok, message: out.message };
    return { rule: `intent: ${intent.pattern}`, text: [out.ok ? out.message : `I could not do that: ${out.message}`], proposal };
  }
  return {
    rule: `intent: ${intent.pattern}`,
    text: [
      `I can ${action.title.toLowerCase()}${intent.arg ? ` (${intent.arg})` : ''}.`,
      `This needs the “${action.capability ?? 'none'}” capability${action.destructive ? ' and is destructive, so you will be asked to confirm' : ''}. Approve to run it.`,
    ],
    proposal,
  };
}

/** Execute a proposal the user approved. */
export async function approveProposal(p: AstralProposal): Promise<{ ok: boolean; message: string }> {
  const out = await runAction(p.actionId, p.arg, 'astral');
  settleActivity(p.activityId, out.status, out.message, out.auditId);
  return { ok: out.ok, message: out.message };
}

export function dismissProposal(p: AstralProposal): void {
  settleActivity(p.activityId, 'dismissed', 'Dismissed by user');
}

/** Answer a question using deterministic rules over live runtime state. */
export async function askAstral(question: string): Promise<AstralReply> {
  const q = question.toLowerCase().trim();
  events.log('astral', `Query: ${question.slice(0, 80)}`);
  if (!q) return { rule: 'empty', text: ['Ask me about system status, diagnostics, storage or the PyxisOS architecture.'] };
  if (!isRunning('astral-assistd')) {
    return {
      rule: 'daemon-stopped',
      text: ['The simulated astral-assistd service is stopped, so the assistant is paused. Start it in the Service Manager (it requires aegis-policyd).'],
      actions: [{ label: 'Service Manager', app: 'services' }],
    };
  }
  // Imperatives are matched against the command allowlist first; questions go to the knowledge rules.
  if (!QUESTION.test(q)) {
    const reply = await propose(question);
    if (reply) return reply;
  }
  for (const rule of rules) if (rule.match.test(q)) return rule.answer(q);
  const reply = await propose(question);
  if (reply) return reply;
  return {
    rule: 'fallback',
    text: [
      'I could not match that to one of my rules. I am a local rule-based assistant, so I only understand a set of topics.',
      'Try: “system status”, “explain diagnostics”, “what should I do?”, “storage”, “what is Lunar Core?”, or “how do I create a file?”.',
    ],
    actions: [{ label: 'What can you do?', prompt: 'what can you do' }],
  };
}
