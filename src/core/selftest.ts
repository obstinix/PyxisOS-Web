import { Store } from './store';
import { runtime } from './system';
import { WindowManager } from './windows';
import { APPS } from './apps';
import { VirtualFS } from './vfs';
import { DEFAULT_SETTINGS, applySettingsToDocument } from './settings';
import { NotificationCenter } from './notifications';
import { listChecks, runDiagnostics } from './diagnostics';
import { resolveInput } from './browser';
import { declared } from './aegis';
import { getAction } from './actions';
import { parseIntent } from './intents';
import { events } from './events';
import { ShellSession } from '../terminal/shell';
import { createRegistry } from '../terminal/commands';

/**
 * Functional self-tests of the web demo. Each test exercises real code
 * (window manager, filesystem, shell, storage…) using isolated instances or
 * scratch data so your files and layout are not touched. These tests cover
 * the browser application only — never hardware or a native kernel.
 */
export interface SelfTestResult {
  id: string;
  area: string;
  name: string;
  ok: boolean;
  detail: string;
  advice: string;
  durationMs: number;
}

interface SelfTest {
  id: string;
  area: string;
  name: string;
  advice: string;
  run: () => Promise<string> | string;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

let componentProbe: () => string[] = () => [];
export function setSelfTestComponentProbe(fn: () => string[]): void {
  componentProbe = fn;
}

const TESTS: SelfTest[] = [
  {
    id: 'init',
    area: 'Application initialisation',
    name: 'Boot stages completed',
    advice: 'Open the System Journal and look for boot errors; restart PyxisOS.',
    run: () => {
      const stages = runtime.stages.get();
      const failed = stages.filter((s) => s.status === 'failed');
      assert(stages.length > 0, 'No boot stages recorded');
      assert(!failed.length, `Failed stages: ${failed.map((s) => s.id).join(', ')}`);
      return `${stages.length} stages, ${stages.filter((s) => s.status === 'warn').length} with warnings`;
    },
  },
  {
    id: 'wm',
    area: 'Window management',
    name: 'Open, focus, minimise, workspaces, close',
    advice: 'Close and reopen the affected window; report a bug if it repeats.',
    run: () => {
      const wm = new WindowManager();
      wm.setViewport(1200, 700);
      const a = wm.open('terminal');
      const b = wm.open('files');
      assert(wm.state.focusedId === b.id, 'newest window should be focused');
      wm.minimize(b.id);
      assert(wm.state.focusedId === a.id, 'focus should fall back after minimise');
      wm.moveToWorkspace(a.id, 2);
      assert(wm.get(a.id)!.workspace === 2, 'window did not move workspace');
      wm.focus(a.id);
      assert(wm.state.activeWorkspace === 2, 'focusing should switch workspace');
      const restored = new WindowManager();
      restored.setViewport(1200, 700);
      restored.restore(wm.snapshot());
      assert(restored.windows.some((w) => w.workspace === 2 && w.appId === 'terminal'), 'snapshot did not preserve workspace');
      wm.close(a.id);
      wm.close(b.id);
      assert(wm.windows.length === 0, 'windows not cleaned up');
      return 'Isolated window manager behaved correctly';
    },
  },
  {
    id: 'shell',
    area: 'Command dispatch',
    name: 'psh pipelines and redirection',
    advice: 'Run the same commands in the Terminal to see the error output.',
    run: async () => {
      const fs = new VirtualFS();
      const session = new ShellSession(createRegistry(), () => fs);
      const out: string[] = [];
      const host = { clear: () => undefined, openApp: () => undefined, exit: () => undefined };
      const status = await session.execute('echo alpha > /tmp/t.txt && echo beta >> /tmp/t.txt; cat /tmp/t.txt | sort -r | head -n 1', host, (b) => out.push(b.text));
      assert(status === 0, `exit status ${status}: ${out.join(' ')}`);
      assert(out.join('').trim() === 'beta', `unexpected output ${JSON.stringify(out)}`);
      return 'echo, >, >>, ;, &&, cat | sort -r | head on a scratch filesystem';
    },
  },
  {
    id: 'vfs',
    area: 'Virtual filesystem',
    name: 'Operations and snapshot round-trip',
    advice: 'Export your files from Files, then reset the filesystem below.',
    run: () => {
      const fs = new VirtualFS();
      fs.mkdir('/tmp/a/b', { parents: true });
      fs.writeFile('/tmp/a/b/f.txt', 'x');
      fs.copy('/tmp/a', '/tmp/c', { recursive: true });
      fs.move('/tmp/c/b/f.txt', '/tmp/c/g.txt');
      const copy = VirtualFS.fromSnapshot(fs.serialize());
      assert(copy.readFile('/tmp/c/g.txt') === 'x', 'snapshot lost data');
      let blocked = false;
      try {
        fs.writeFile('/system/x', 'y');
      } catch {
        blocked = true;
      }
      assert(blocked, '/system accepted a write');
      return 'mkdir -p, write, recursive copy, move, snapshot, read-only /system';
    },
  },
  {
    id: 'persistence',
    area: 'Persistence',
    name: `Storage round-trip`,
    advice: 'Allow site data for this site and leave private browsing; then restart.',
    run: async () => {
      const key = 'selftest-probe';
      const value = { n: Math.random() };
      await runtime.storage.set(key, value);
      const back = await runtime.storage.get<{ n: number }>(key);
      await runtime.storage.delete(key);
      assert(back?.n === value.n, 'value read back differs');
      return `Verified on ${runtime.storage.kind}`;
    },
  },
  {
    id: 'theme',
    area: 'Theme application',
    name: 'Settings map to design tokens',
    advice: 'Restore default appearance in Settings.',
    run: () => {
      const el = document.createElement('div');
      applySettingsToDocument({ ...DEFAULT_SETTINGS, theme: 'light', radius: 'round', windowOpacity: 0.92 }, el);
      assert(el.dataset.theme === 'light', 'theme attribute not applied');
      assert(el.dataset.radius === 'round', 'radius attribute not applied');
      assert(el.style.getPropertyValue('--window-alpha') === '92%', 'opacity token not applied');
      return 'theme, radius and opacity tokens applied to a detached element';
    },
  },
  {
    id: 'notifications',
    area: 'Notifications',
    name: 'Post, read and dismiss',
    advice: 'Check Settings → Notifications.',
    run: () => {
      const nc = new NotificationCenter(false, true);
      const n = nc.notify('Self-test', 'probe', 'info', 'selftest');
      assert(nc.unread === 1, 'notification not recorded');
      nc.markRead(n.id);
      assert((nc.unread as number) === 0, "mark read failed");
      nc.dismiss(n.id);
      assert(nc.history.get().length === 0, 'dismiss failed');
      return 'Isolated notification centre behaved correctly';
    },
  },
  {
    id: 'apps',
    area: 'Application registration',
    name: 'Every app has a UI and valid metadata',
    advice: 'Developer fix in src/apps/index.tsx.',
    run: () => {
      const comps = new Set(componentProbe());
      const missing = APPS.filter((a) => !comps.has(a.id)).map((a) => a.id);
      assert(!missing.length, `Missing components: ${missing.join(', ')}`);
      assert(new Set(APPS.map((a) => a.id)).size === APPS.length, 'duplicate app ids');
      return `${APPS.length} apps registered with components`;
    },
  },
  {
    id: 'diagnostics',
    area: 'Diagnostic infrastructure',
    name: 'Every check executes and is explained',
    advice: 'Open the System Doctor to see which check failed to run.',
    run: async () => {
      const r = await runDiagnostics();
      assert(r.results.length === listChecks().length, 'not every check produced a result');
      assert(r.results.every((c) => c.explain.what && c.explain.remediation), 'a check is missing its explanation');
      return `${r.results.length} checks, ${r.summary.fail} failing`;
    },
  },
  {
    id: 'security',
    area: 'Command safety',
    name: 'Allowlist and capability declarations',
    advice: 'Report a bug — this guards against unsafe actions.',
    run: () => {
      assert(!getAction('rm -rf /'), 'arbitrary action resolved');
      assert(parseIntent('sudo rm -rf /') === null, 'unsafe text mapped to an action');
      assert(parseIntent('open the system monitor')?.actionId === 'open:monitor', 'known phrase not understood');
      assert(!declared('about', 'fs.write'), 'undeclared capability treated as declared');
      return 'Unknown commands are refused; undeclared capabilities are denied';
    },
  },
  {
    id: 'browser',
    area: 'Browser integration',
    name: 'URL policy and iframe sandbox',
    advice: 'Use a current browser; Pyxis Browser needs iframe sandbox support.',
    run: () => {
      assert(resolveInput('javascript:alert(1)').kind === 'error', 'javascript: URL accepted');
      assert(resolveInput('example.com').url === 'https://example.com/', 'host not normalised');
      assert(resolveInput('pyxis os').kind === 'internal', 'search not detected');
      assert('sandbox' in document.createElement('iframe'), 'iframe sandbox unsupported');
      return 'Unsafe schemes blocked, hosts normalised, sandboxed iframes available';
    },
  },
];

export const selfTestStore = new Store<{ ranAt: number; results: SelfTestResult[] } | null>(null);

export function listSelfTests(): { id: string; area: string; name: string }[] {
  return TESTS.map(({ id, area, name }) => ({ id, area, name }));
}

export async function runSelfTests(): Promise<SelfTestResult[]> {
  const results: SelfTestResult[] = [];
  for (const t of TESTS) {
    const t0 = performance.now();
    let ok = true;
    let detail: string;
    try {
      detail = await t.run();
    } catch (e) {
      ok = false;
      detail = e instanceof Error ? e.message : String(e);
    }
    results.push({ id: t.id, area: t.area, name: t.name, ok, detail, advice: t.advice, durationMs: performance.now() - t0 });
  }
  selfTestStore.set({ ranAt: Date.now(), results });
  const failed = results.filter((r) => !r.ok).length;
  events.log('selftest', `Self-test: ${results.length - failed} passed, ${failed} failed`, failed ? 'error' : 'success');
  return results;
}
