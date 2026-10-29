import { beforeEach, describe, expect, it } from 'vitest';
import { parse, ParseError, parseFlags, tokenize } from '../src/terminal/parser';
import { ShellHost, ShellSession, OutputBlock } from '../src/terminal/shell';
import { createRegistry } from '../src/terminal/commands';
import { runtime } from '../src/core/system';
import { HOME } from '../src/core/path';
import { APPS } from '../src/core/apps';

describe('parser', () => {
  it('splits words and honours quotes', () => {
    expect(tokenize(`echo "hello world" 'a b' c\\ d`).map((t) => t.value)).toEqual(['echo', 'hello world', 'a b', 'c d']);
  });

  it('expands variables except in single quotes', () => {
    const env = { HOME: '/home/pyxis', X: '1' };
    expect(tokenize(`echo $HOME "$X" '$X' \${X}`, env).map((t) => t.value)).toEqual(['echo', '/home/pyxis', '1', '$X', '1']);
  });

  it('parses pipes, redirection and command lists', () => {
    const p = parse('cat a | grep x > out.txt && echo done; ls');
    expect(p).toHaveLength(3);
    expect(p[0].commands.map((c) => c.argv[0])).toEqual(['cat', 'grep']);
    expect(p[0].commands[1].redirect).toEqual({ path: 'out.txt', append: false });
    expect(p[1].joiner).toBe('&&');
    expect(p[2].joiner).toBe(';');
  });

  it('reports syntax errors', () => {
    expect(() => parse('echo "unterminated')).toThrow(ParseError);
    expect(() => parse('| ls')).toThrow(ParseError);
    expect(() => parse('echo >')).toThrow(ParseError);
    expect(() => parse('ls &&')).toThrow(ParseError);
  });

  it('parses combined and long flags', () => {
    const { flags, rest } = parseFlags(['-rf', '--parents', 'a', '--', '-b'], { parents: 'p' });
    expect([...flags].sort()).toEqual(['f', 'p', 'r']);
    expect(rest).toEqual(['a', '-b']);
  });
});

describe('shell commands', () => {
  let session: ShellSession;
  let out: OutputBlock[];
  let opened: { id: string; props?: Record<string, unknown> }[];
  let cleared: number;
  const host: ShellHost = {
    clear: () => cleared++,
    openApp: (id, props) => opened.push({ id, props }),
    exit: () => undefined,
  };
  const run = async (line: string) => {
    out = [];
    const status = await session.execute(line, host, (b) => out.push(b));
    return { status, text: out.map((b) => b.text).join('\n'), errors: out.filter((b) => b.tone === 'err') };
  };

  beforeEach(() => {
    runtime.resetForTests();
    session = new ShellSession(createRegistry(), () => runtime.fs);
    opened = [];
    cleared = 0;
  });

  it('help lists every registered command', async () => {
    const { text } = await run('help');
    for (const spec of session.registry.list()) expect(text).toContain(spec.name);
    expect((await run('help ls')).text).toContain('usage: ls');
  });

  it('pwd and cd navigate the filesystem', async () => {
    expect((await run('pwd')).text).toBe(HOME);
    await run('cd Documents');
    expect(session.cwd).toBe(`${HOME}/Documents`);
    await run('cd ..');
    expect(session.cwd).toBe(HOME);
    await run('cd /tmp');
    await run('cd -');
    expect(session.cwd).toBe(HOME);
    await run('cd /tmp && cd');
    expect(session.cwd).toBe(HOME);
    const r = await run('cd nowhere');
    expect(r.status).toBe(1);
    expect(r.errors[0].text).toContain('No such file');
    expect((await run('cd Documents/welcome.txt')).errors[0].text).toContain('Not a directory');
  });

  it('ls reflects directory contents', async () => {
    const r = await run('ls');
    expect(r.text).toContain('Documents/');
    expect(r.text).toContain('Projects/');
    await run('mkdir demo && touch demo/a.txt');
    expect((await run('ls demo')).text).toBe('a.txt');
    expect((await run('ls -l demo')).text).toMatch(/-rw-r--r--.*a\.txt/);
  });

  it('mkdir, touch, echo redirection and cat work end to end', async () => {
    await run('mkdir -p work/notes');
    expect(runtime.fs.isDir(`${HOME}/work/notes`)).toBe(true);
    await run('touch work/notes/todo.txt');
    expect(runtime.fs.readFile(`${HOME}/work/notes/todo.txt`)).toBe('');
    await run('echo "first line" > work/notes/todo.txt');
    await run('echo second >> work/notes/todo.txt');
    expect((await run('cat work/notes/todo.txt')).text).toBe('first line\nsecond');
    expect((await run('cat -n work/notes/todo.txt')).text).toContain('2  second');
    const missing = await run('cat nope.txt');
    expect(missing.status).toBe(1);
  });

  it('cp, mv and rm operate on the shared filesystem', async () => {
    await run('echo data > a.txt');
    await run('cp a.txt b.txt');
    expect(runtime.fs.readFile(`${HOME}/b.txt`)).toBe('data\n');
    await run('mv b.txt Documents/');
    expect(runtime.fs.exists(`${HOME}/Documents/b.txt`)).toBe(true);
    expect(runtime.fs.exists(`${HOME}/b.txt`)).toBe(false);
    await run('mkdir d && cp a.txt d');
    expect((await run('cp d e')).status).toBe(1);
    await run('cp -r d e');
    expect(runtime.fs.readFile(`${HOME}/e/a.txt`)).toBe('data\n');
    expect((await run('rm d')).errors[0].text).toContain('Is a directory');
    await run('rm -r d e a.txt');
    expect(runtime.fs.exists(`${HOME}/d`)).toBe(false);
    expect(runtime.fs.exists(`${HOME}/a.txt`)).toBe(false);
    expect((await run('rm -f ghost')).status).toBe(0);
  });

  it('refuses to remove protected locations', async () => {
    const r = await run('rm -rf /');
    expect(r.status).toBe(1);
    expect(r.errors[0].text).toContain('Protected');
    expect(runtime.fs.isDir(HOME)).toBe(true);
    expect((await run('echo x > /system/hack')).status).toBe(1);
  });

  it('supports pipes into text utilities', async () => {
    runtime.fs.writeFile(`${HOME}/list.txt`, 'banana\napple\ncherry\napricot\n');
    expect((await run('cat list.txt | grep ap')).text).toBe('apple\napricot');
    expect((await run('cat list.txt | sort | head -n 2')).text).toBe('apple\napricot');
    expect((await run('grep -c x list.txt; wc list.txt')).text).toContain('4');
    expect((await run('tail -1 list.txt')).text).toBe('apricot');
  });

  it('history records real commands and can be cleared', async () => {
    await run('pwd');
    await run('whoami');
    const r = await run('history');
    expect(r.text).toMatch(/1\s+pwd/);
    expect(r.text).toMatch(/2\s+whoami/);
    await run('history -c');
    expect(session.history).toEqual([]);
  });

  it('clear and open call into the host', async () => {
    await run('clear');
    expect(cleared).toBe(1);
    await run('open Documents/welcome.txt');
    expect(opened[0]).toEqual({ id: 'editor', props: { path: `${HOME}/Documents/welcome.txt` } });
    await run('pyxis open monitor');
    expect(opened[1].id).toBe('monitor');
    await run('edit fresh.txt');
    expect(runtime.fs.exists(`${HOME}/fresh.txt`)).toBe(true);
  });

  it('reports unknown commands with status 127', async () => {
    const r = await run('frobnicate');
    expect(r.status).toBe(127);
    expect(r.errors[0].text).toContain('command not found');
  });

  it('&& short-circuits on failure', async () => {
    await run('cat missing && touch should-not-exist');
    expect(runtime.fs.exists(`${HOME}/should-not-exist`)).toBe(false);
    await run('cat missing; touch should-exist');
    expect(runtime.fs.exists(`${HOME}/should-exist`)).toBe(true);
  });

  it('identity commands print sensible values', async () => {
    expect((await run('whoami')).text).toBe('pyxis');
    expect((await run('uname')).text).toBe('PyxisOS');
    expect((await run('uname -a')).text).toContain('lunar-core');
    expect((await run('date -I')).text).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect((await run('neofetch')).text).toContain('simulated');
  });

  it('pyxis subcommands reflect runtime state', async () => {
    expect((await run('pyxis --version')).text).toContain('0.1.0');
    const info = (await run('pyxis info')).text;
    expect(info).toContain('LUNAR-PYXIS');
    expect(info).toContain('SIMULATED');
    const apps = (await run('pyxis apps')).text;
    for (const a of APPS) expect(apps).toContain(a.id);
    expect((await run('pyxis status')).text).toContain('vfs');
    expect((await run('pyxis runtime')).text).toContain('Uptime');
    expect((await run('pyxis hardware')).text).toMatch(/LIVE|UNAVAILABLE/);
    expect((await run('pyxis bogus')).status).toBe(1);
  });

  it('pyxis doctor executes real checks', async () => {
    const r = await run('pyxis doctor');
    expect(r.text).toContain('Filesystem operations');
    expect(r.text).toMatch(/\d+ passed/);
    expect(r.text).toContain('[SKIP] Lunar Core kernel link');
    // The probe directory must be cleaned up afterwards.
    expect(runtime.fs.list('/tmp').filter((e) => e.name.startsWith('.diag'))).toHaveLength(0);
  });

  it('separate sessions keep independent state', async () => {
    const other = new ShellSession(createRegistry(), () => runtime.fs);
    await run('cd /tmp');
    expect(other.cwd).toBe(HOME);
    await other.execute('touch shared.txt', host, () => undefined);
    expect((await run(`ls ${HOME}`)).text).toContain('shared.txt');
  });

  it('tab-completes commands and paths', () => {
    expect(session.complete('neof').line).toBe('neofetch ');
    expect(session.complete('cd Doc').line).toBe('cd Documents/');
    const multi = session.complete('cd D');
    expect(multi.candidates.sort()).toEqual(['Desktop/', 'Documents/', 'Downloads/']);
    expect(multi.line).toBe('cd D');
    expect(session.complete('cat Documents/wel').line).toBe('cat Documents/welcome.txt ');
  });
});
