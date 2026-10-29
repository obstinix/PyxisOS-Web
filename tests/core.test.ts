import { beforeEach, describe, expect, it } from 'vitest';
import { clampBounds, WindowManager } from '../src/core/windows';
import { APPS, getApp, searchApps } from '../src/core/apps';
import { DEFAULT_SETTINGS, sanitizeSettings, settingsStore, updateSettings, applySettingsToDocument } from '../src/core/settings';
import { IndexedDbStore, LocalStorageStore, MemoryStore } from '../src/core/persistence';
import { runtime } from '../src/core/system';
import { runDiagnostics, listChecks } from '../src/core/diagnostics';
import { askAstral, recommendations } from '../src/core/astral';
import { HOME } from '../src/core/path';
import { events } from '../src/core/events';
import { getServices } from '../src/core/services';

describe('application registry', () => {
  it('has unique ids and sane sizes', () => {
    const ids = APPS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of APPS) {
      expect(a.minSize.w).toBeLessThanOrEqual(a.defaultSize.w);
      expect(a.minSize.h).toBeLessThanOrEqual(a.defaultSize.h);
    }
  });

  it('searches by name prefix, words and keywords', () => {
    expect(searchApps('term')[0].id).toBe('terminal');
    expect(searchApps('shell').map((a) => a.id)).toContain('terminal');
    expect(searchApps('wallpaper')[0].id).toBe('settings');
    expect(searchApps('zzzz')).toHaveLength(0);
    expect(searchApps('')).toHaveLength(APPS.length);
    expect(getApp('nope')).toBeUndefined();
  });
});

describe('window manager', () => {
  let wm: WindowManager;
  beforeEach(() => {
    wm = new WindowManager();
    wm.setViewport(1280, 720);
  });

  it('opens windows focused on top and closes them', () => {
    const a = wm.open('terminal');
    const b = wm.open('files');
    expect(wm.state.focusedId).toBe(b.id);
    expect(wm.get(b.id)!.z).toBeGreaterThan(wm.get(a.id)!.z);
    wm.close(b.id);
    expect(wm.windows).toHaveLength(1);
    expect(wm.state.focusedId).toBe(a.id);
  });

  it('reuses singleton windows and merges launch props', () => {
    const a = wm.open('editor', { path: '/a' });
    const b = wm.open('editor', { path: '/b' });
    expect(b.id).toBe(a.id);
    expect(wm.windows).toHaveLength(1);
    expect(wm.get(a.id)!.props.path).toBe('/b');
    // Terminal is multi-instance.
    wm.open('terminal');
    wm.open('terminal');
    expect(wm.windows.filter((w) => w.appId === 'terminal')).toHaveLength(2);
  });

  it('focus raises stacking order', () => {
    const a = wm.open('terminal');
    wm.open('files');
    wm.focus(a.id);
    const zs = wm.windows.map((w) => w.z);
    expect(wm.get(a.id)!.z).toBe(Math.max(...zs));
    expect(new Set(zs).size).toBe(zs.length);
  });

  it('minimise hands focus to the next window; taskbar toggles', () => {
    const a = wm.open('terminal');
    const b = wm.open('files');
    wm.minimize(b.id);
    expect(wm.get(b.id)!.minimized).toBe(true);
    expect(wm.state.focusedId).toBe(a.id);
    wm.toggleFromTaskbar(b.id);
    expect(wm.get(b.id)!.minimized).toBe(false);
    expect(wm.state.focusedId).toBe(b.id);
    wm.toggleFromTaskbar(b.id);
    expect(wm.get(b.id)!.minimized).toBe(true);
  });

  it('maximise toggles and setBounds clamps to the viewport and min size', () => {
    const a = wm.open('terminal');
    wm.toggleMaximize(a.id);
    expect(wm.get(a.id)!.maximized).toBe(true);
    wm.toggleMaximize(a.id);
    expect(wm.get(a.id)!.maximized).toBe(false);
    wm.setBounds(a.id, { x: 5000, y: -300, w: 10, h: 10 });
    const b = wm.get(a.id)!.bounds;
    const meta = getApp('terminal')!;
    expect(b.w).toBe(meta.minSize.w);
    expect(b.h).toBe(meta.minSize.h);
    expect(b.y).toBe(0);
    expect(b.x).toBeLessThanOrEqual(1280 - 48);
  });

  it('keeps windows reachable when the viewport shrinks', () => {
    const a = wm.open('files');
    wm.setBounds(a.id, { x: 1000, y: 600, w: 600, h: 400 });
    wm.setViewport(800, 500);
    const b = wm.get(a.id)!.bounds;
    expect(b.x).toBeLessThanOrEqual(800 - 48);
    expect(b.y).toBeLessThanOrEqual(500 - 38);
    expect(b.w).toBeLessThanOrEqual(800);
  });

  it('clampBounds never produces negative sizes on tiny screens', () => {
    const b = clampBounds({ x: 0, y: 0, w: 900, h: 600 }, { w: 320, h: 400 }, { w: 460, h: 300 });
    expect(b.w).toBe(320);
    expect(b.h).toBe(400);
  });

  it('close guards can veto and forced close bypasses them', () => {
    const a = wm.open('editor');
    let allow = false;
    wm.setCloseGuard(a.id, () => allow);
    expect(wm.close(a.id)).toBe(false);
    expect(wm.windows).toHaveLength(1);
    expect(wm.close(a.id, true)).toBe(true);
    expect(wm.windows).toHaveLength(0);
    const b = wm.open('editor');
    wm.setCloseGuard(b.id, () => (allow = true));
    expect(wm.close(b.id)).toBe(true);
  });

  it('snapshots and restores a layout, ignoring invalid entries', () => {
    const a = wm.open('terminal');
    wm.setBounds(a.id, { x: 40, y: 50, w: 600, h: 400 });
    wm.open('editor', { path: `${HOME}/x.txt` });
    const snap = JSON.parse(JSON.stringify(wm.snapshot()));
    const other = new WindowManager();
    other.setViewport(1280, 720);
    const n = other.restore([...snap, { appId: 'malware' }, null, 'junk']);
    expect(n).toBe(2);
    expect(other.windows.map((w) => w.appId)).toEqual(['terminal', 'editor']);
    expect(other.windows[0].bounds).toEqual({ x: 40, y: 50, w: 600, h: 400 });
    expect(other.windows[1].props.path).toBe(`${HOME}/x.txt`);
    expect(other.restore('nope')).toBe(0);
  });
});

describe('settings', () => {
  it('sanitizes untrusted values', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    const s = sanitizeSettings({ theme: 'neon', accent: 'rose', scale: 7, clock24h: 'yes', displayName: '   ', notificationDurationMs: 999999, extra: 1 });
    expect(s.theme).toBe('dark');
    expect(s.accent).toBe('rose');
    expect(s.scale).toBe(1);
    expect(s.clock24h).toBe(true);
    expect(s.displayName).toBe(DEFAULT_SETTINGS.displayName);
    expect(s.notificationDurationMs).toBe(15000);
    expect('extra' in s).toBe(false);
  });

  it('applies to the document', () => {
    updateSettings({ theme: 'light', dockPosition: 'right', scale: 1.25 });
    applySettingsToDocument(settingsStore.get());
    const root = document.documentElement;
    expect(root.dataset.theme).toBe('light');
    expect(root.dataset.dock).toBe('right');
    expect(root.style.getPropertyValue('--ui-scale')).toBe('1.25');
    settingsStore.set({ ...DEFAULT_SETTINGS });
  });
});

describe('persistence backends', () => {
  const backends = [
    ['memory', () => Promise.resolve(new MemoryStore())],
    ['localStorage', () => Promise.resolve(new LocalStorageStore(localStorage))],
    ['IndexedDB', () => IndexedDbStore.open()],
  ] as const;

  for (const [name, make] of backends) {
    it(`${name} stores, reads, deletes and clears values`, async () => {
      const store = await make();
      await store.clear();
      await store.set('k', { a: [1, 2, 3] });
      expect(await store.get('k')).toEqual({ a: [1, 2, 3] });
      await store.delete('k');
      expect(await store.get('k')).toBeUndefined();
      await store.set('x', 1);
      await store.clear();
      expect(await store.get('x')).toBeUndefined();
    });
  }
});

describe('runtime boot and persistence', () => {
  beforeEach(() => runtime.resetForTests());

  it('boots through every stage and reaches the login phase', async () => {
    const storage = new MemoryStore();
    await runtime.boot({ storage });
    const stages = runtime.stages.get();
    expect(stages.length).toBeGreaterThan(5);
    expect(stages.every((s) => s.status === 'done' || s.status === 'warn')).toBe(true);
    expect(runtime.phase.get()).toBe('login');
    expect(runtime.fs.exists('/system/os-release')).toBe(true);
  });

  it('persists files and settings across a simulated reload', async () => {
    const storage = new MemoryStore();
    await runtime.boot({ storage });
    runtime.fs.mkdir(`${HOME}/Projects/demo`);
    runtime.fs.writeFile(`${HOME}/Projects/demo/readme.md`, '# persisted');
    updateSettings({ accent: 'ember' });
    expect(await runtime.saveNow()).toBe(true);

    // "Reload": fresh runtime state, same storage.
    runtime.resetForTests();
    settingsStore.set({ ...DEFAULT_SETTINGS });
    await runtime.boot({ storage });
    expect(runtime.fs.readFile(`${HOME}/Projects/demo/readme.md`)).toBe('# persisted');
    expect(settingsStore.get().accent).toBe('ember');
    settingsStore.set({ ...DEFAULT_SETTINGS });
  });

  it('recovers from a corrupted filesystem snapshot', async () => {
    const storage = new MemoryStore();
    await storage.set('vfs', { type: 'garbage' });
    await runtime.boot({ storage });
    const vfsStage = runtime.stages.get().find((s) => s.id === 'vfs')!;
    expect(vfsStage.status).toBe('warn');
    expect(runtime.fs.isDir(HOME)).toBe(true);
    expect(runtime.phase.get()).toBe('login');
  });

  it('falls back to memory when storage fails and reports save errors', async () => {
    const broken = new MemoryStore();
    broken.get = () => Promise.reject(new Error('disk on fire'));
    await runtime.boot({ storage: broken });
    expect(runtime.phase.get()).toBe('login');
    expect(runtime.storage.kind).toBe('memory');

    runtime.storage.set = () => Promise.reject(new Error('quota exceeded'));
    expect(await runtime.saveNow()).toBe(false);
    expect(runtime.persistence.get().lastError).toBe('quota exceeded');
  });
});

describe('diagnostics', () => {
  beforeEach(() => runtime.resetForTests());

  it('executes every registered check and summarises results', async () => {
    await runtime.boot({ storage: new MemoryStore() });
    const report = await runDiagnostics();
    expect(report.results).toHaveLength(listChecks().length);
    const total = Object.values(report.summary).reduce((a, b) => a + b, 0);
    expect(total).toBe(report.results.length);
    const byId = Object.fromEntries(report.results.map((r) => [r.id, r]));
    expect(byId['vfs.ops'].status).toBe('pass');
    expect(byId['vfs.protection'].status).toBe('pass');
    expect(byId['storage.roundtrip'].status).toBe('pass');
    // Memory storage must be reported honestly as a warning, not a pass.
    expect(byId['storage.backend'].status).toBe('warn');
    expect(byId['native.kernel'].status).toBe('skip');
  });

  it('detects a broken filesystem layout', async () => {
    await runtime.boot({ storage: new MemoryStore() });
    runtime.fs.remove(`${HOME}/Downloads`, { recursive: true });
    const report = await runDiagnostics();
    const layout = report.results.find((r) => r.id === 'vfs.layout')!;
    expect(layout.status).toBe('fail');
    expect(layout.detail).toContain('Downloads');
  });
});

describe('persistence safety', () => {
  beforeEach(() => runtime.resetForTests());

  it('never saves before stored data is loaded (tab hidden mid-boot)', async () => {
    const storage = new MemoryStore();
    await runtime.boot({ storage });
    updateSettings({ accent: 'ember' });
    runtime.fs.writeFile(`${HOME}/keep.txt`, 'mine');
    await runtime.saveNow();
    runtime.resetForTests();
    // Simulate visibilitychange firing while boot is reading settings.
    let midBootSave: boolean | undefined;
    const racing = Object.assign(Object.create(storage) as MemoryStore, {
      get: async (key: string) => {
        if (key === 'settings') midBootSave = await runtime.saveNow();
        return storage.get(key);
      },
    });
    await runtime.boot({ storage: racing });
    expect(midBootSave).toBe(false);
    expect(settingsStore.get().accent).toBe('ember');
    expect(runtime.fs.readFile(`${HOME}/keep.txt`)).toBe('mine');
  });

  it('factory reset is not undone by the save on page unload', async () => {
    const storage = new MemoryStore();
    await runtime.boot({ storage });
    runtime.fs.writeFile(`${HOME}/gone.txt`, 'x');
    await runtime.saveNow();
    await runtime.factoryReset(false);
    expect(await runtime.saveNow()).toBe(false);
    expect(await storage.get('vfs')).toBeUndefined();
  });
});

describe('services and astral', () => {
  beforeEach(() => runtime.resetForTests());

  it('reports unavailable native services honestly', () => {
    const services = getServices();
    expect(services.find((s) => s.id === 'lunar-core')!.kind).toBe('UNAVAILABLE');
    expect(services.find((s) => s.id === 'astral-consensus')!.kind).toBe('NOT IMPLEMENTED');
  });

  it('answers from live state and labels the rule used', async () => {
    await runtime.boot({ storage: new MemoryStore() });
    const status = await askAstral('give me a system status');
    expect(status.rule).toBe('status');
    expect(status.text.join(' ')).toContain('files');

    const diag = await askAstral('explain diagnostics');
    expect(diag.rule).toBe('diagnostics');
    expect(diag.text[0]).toMatch(/\d+ passed/);

    const ai = await askAstral('are you an AI model?');
    expect(ai.rule).toBe('capabilities');
    expect(ai.text.join(' ')).toContain('do not use a language model');

    expect((await askAstral('what is lunar core')).rule).toBe('kernel');
    expect((await askAstral('run diagnostics again')).rule).toBe('run-diagnostics');
    expect((await askAstral('blorp')).rule).toBe('fallback');
  });

  it('recommends fixing memory-only storage', async () => {
    await runtime.boot({ storage: new MemoryStore() });
    const recs = recommendations(null);
    expect(recs.join(' ')).toContain('Browser storage is unavailable');
    expect(recs.join(' ')).toContain('Diagnostics have not run');
  });

  it('records events for operations', () => {
    const before = events.total;
    events.log('test', 'hello');
    expect(events.total).toBe(before + 1);
    expect(events.all[events.all.length - 1].message).toBe('hello');
  });
});
