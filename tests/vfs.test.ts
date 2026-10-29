import { describe, expect, it } from 'vitest';
import { VirtualFS, VfsError } from '../src/core/vfs';
import { HOME, resolvePath, normalize, validateName, displayPath } from '../src/core/path';

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof VfsError) return e.code;
    throw e;
  }
  return undefined;
}

describe('path utilities', () => {
  it('normalizes dots, slashes and parent references', () => {
    expect(normalize('/a//b/./c/')).toBe('/a/b/c');
    expect(normalize('/a/b/../c')).toBe('/a/c');
    expect(normalize('/../../..')).toBe('/');
  });

  it('resolves relative, home and absolute paths', () => {
    expect(resolvePath('Documents', HOME)).toBe(`${HOME}/Documents`);
    expect(resolvePath('~')).toBe(HOME);
    expect(resolvePath('~/Projects/../Downloads', '/')).toBe(`${HOME}/Downloads`);
    expect(resolvePath('/tmp', HOME)).toBe('/tmp');
    expect(resolvePath('..', '/')).toBe('/');
    expect(resolvePath('', '/tmp')).toBe('/tmp');
  });

  it('never escapes the virtual root', () => {
    expect(resolvePath('../../../../etc/passwd', HOME)).toBe('/etc/passwd');
  });

  it('validates names', () => {
    expect(validateName('ok.txt')).toBeNull();
    expect(validateName('')).not.toBeNull();
    expect(validateName('a/b')).not.toBeNull();
    expect(validateName('..')).not.toBeNull();
    expect(validateName('__proto__')).not.toBeNull();
  });

  it('displays home-relative paths', () => {
    expect(displayPath(HOME)).toBe('~');
    expect(displayPath(`${HOME}/Documents`)).toBe('~/Documents');
    expect(displayPath('/tmp')).toBe('/tmp');
  });
});

describe('VirtualFS', () => {
  it('starts with the standard home layout', () => {
    const fs = new VirtualFS();
    for (const d of ['Documents', 'Projects', 'Downloads']) expect(fs.isDir(`${HOME}/${d}`)).toBe(true);
    expect(fs.readFile(`${HOME}/Documents/welcome.txt`)).toContain('PyxisOS-Web');
  });

  it('creates, writes, appends and reads files', () => {
    const fs = new VirtualFS();
    fs.writeFile('/tmp/a.txt', 'hello');
    fs.writeFile('/tmp/a.txt', ' world', { append: true });
    expect(fs.readFile('/tmp/a.txt')).toBe('hello world');
    expect(fs.stat('/tmp/a.txt').size).toBe(11);
  });

  it('mkdir supports -p and rejects duplicates', () => {
    const fs = new VirtualFS();
    fs.mkdir('/tmp/x/y/z', { parents: true });
    expect(fs.isDir('/tmp/x/y/z')).toBe(true);
    expect(code(() => fs.mkdir('/tmp/x'))).toBe('EEXIST');
    expect(code(() => fs.mkdir('/tmp/missing/child'))).toBe('ENOENT');
  });

  it('lists directories first then files, alphabetically', () => {
    const fs = new VirtualFS();
    fs.writeFile('/tmp/b.txt', '');
    fs.mkdir('/tmp/zdir');
    fs.writeFile('/tmp/a.txt', '');
    expect(fs.list('/tmp').map((e) => e.name)).toEqual(['zdir', 'a.txt', 'b.txt']);
  });

  it('removes files and refuses non-empty directories without recursive', () => {
    const fs = new VirtualFS();
    fs.mkdir('/tmp/d');
    fs.writeFile('/tmp/d/f', 'x');
    expect(code(() => fs.remove('/tmp/d'))).toBe('ENOTEMPTY');
    fs.remove('/tmp/d', { recursive: true });
    expect(fs.exists('/tmp/d')).toBe(false);
  });

  it('protects system locations', () => {
    const fs = new VirtualFS();
    fs.installSystemFiles({ version: '0.1.0' });
    expect(code(() => fs.remove('/'))).toBe('EPERM');
    expect(code(() => fs.remove(HOME, { recursive: true }))).toBe('EPERM');
    expect(code(() => fs.writeFile('/system/version', 'hacked'))).toBe('EPERM');
    expect(code(() => fs.remove('/system/version'))).toBe('EPERM');
    expect(fs.readFile('/system/version')).toBe('0.1.0');
  });

  it('copies files and directories', () => {
    const fs = new VirtualFS();
    fs.mkdir('/tmp/src/inner', { parents: true });
    fs.writeFile('/tmp/src/inner/f.txt', 'data');
    expect(code(() => fs.copy('/tmp/src', '/tmp/dst'))).toBe('EISDIR');
    fs.copy('/tmp/src', '/tmp/dst', { recursive: true });
    expect(fs.readFile('/tmp/dst/inner/f.txt')).toBe('data');
    // copies are independent
    fs.writeFile('/tmp/dst/inner/f.txt', 'changed');
    expect(fs.readFile('/tmp/src/inner/f.txt')).toBe('data');
    // copy into an existing directory keeps the basename
    fs.copy('/tmp/src/inner/f.txt', `${HOME}/Documents`);
    expect(fs.readFile(`${HOME}/Documents/f.txt`)).toBe('data');
    expect(code(() => fs.copy('/tmp/src', '/tmp/src/inner', { recursive: true }))).toBe('EINVAL');
  });

  it('moves and renames entries', () => {
    const fs = new VirtualFS();
    fs.writeFile('/tmp/a.txt', 'A');
    fs.move('/tmp/a.txt', '/tmp/b.txt');
    expect(fs.exists('/tmp/a.txt')).toBe(false);
    expect(fs.readFile('/tmp/b.txt')).toBe('A');
    fs.mkdir('/tmp/dir');
    fs.move('/tmp/b.txt', '/tmp/dir');
    expect(fs.readFile('/tmp/dir/b.txt')).toBe('A');
    fs.rename('/tmp/dir/b.txt', 'c.txt');
    expect(fs.exists('/tmp/dir/c.txt')).toBe(true);
    expect(code(() => fs.move('/tmp/dir', '/tmp/dir/sub'))).toBe('EINVAL');
    expect(code(() => fs.rename('/tmp/dir/c.txt', 'bad/name'))).toBe('EINVAL');
  });

  it('reports useful errors for invalid operations', () => {
    const fs = new VirtualFS();
    expect(code(() => fs.readFile('/nope'))).toBe('ENOENT');
    expect(code(() => fs.readFile('/tmp'))).toBe('EISDIR');
    fs.writeFile('/tmp/f', '');
    expect(code(() => fs.list('/tmp/f'))).toBe('ENOTDIR');
    expect(code(() => fs.writeFile('/tmp/f/child', ''))).toBe('ENOTDIR');
  });

  it('does not treat Object prototype keys as entries', () => {
    const fs = new VirtualFS();
    expect(fs.exists('/tmp/constructor')).toBe(false);
    fs.writeFile('/tmp/constructor', 'ok');
    expect(fs.readFile('/tmp/constructor')).toBe('ok');
    expect(code(() => fs.writeFile('/tmp/__proto__', 'x'))).toBe('EINVAL');
  });

  it('generates unique names', () => {
    const fs = new VirtualFS();
    fs.writeFile('/tmp/untitled.txt', '');
    expect(fs.uniqueName('/tmp', 'untitled.txt')).toBe('untitled 2.txt');
    expect(fs.uniqueName('/tmp', 'fresh.txt')).toBe('fresh.txt');
  });

  it('searches names and optionally contents', () => {
    const fs = new VirtualFS();
    expect(fs.search('welcome', HOME).map((e) => e.name)).toEqual(['welcome.txt']);
    expect(fs.search('microkernel', HOME)).toHaveLength(0);
    expect(fs.search('microkernel', HOME, { content: true }).map((e) => e.name)).toEqual(['notes.md']);
  });

  it('enforces size limits', () => {
    const fs = new VirtualFS();
    expect(code(() => fs.writeFile('/tmp/big', 'x'.repeat(1024 * 1024 + 1)))).toBe('ENOSPC');
  });

  it('emits change notifications on mutation', () => {
    const fs = new VirtualFS();
    let n = 0;
    fs.changed.subscribe(() => n++);
    fs.touch('/tmp/t');
    fs.mkdir('/tmp/m');
    fs.remove('/tmp/t');
    expect(n).toBe(3);
  });

  it('round-trips through a snapshot and rejects malformed data', () => {
    const fs = new VirtualFS();
    fs.installSystemFiles({ version: '1' });
    fs.writeFile(`${HOME}/Documents/keep.txt`, 'persist me');
    const restored = VirtualFS.fromSnapshot(JSON.parse(JSON.stringify(fs.serialize())));
    expect(restored.readFile(`${HOME}/Documents/keep.txt`)).toBe('persist me');
    expect(restored.exists('/system/version')).toBe(false);
    expect(() => VirtualFS.fromSnapshot({ type: 'file' })).toThrow();
    expect(() => VirtualFS.fromSnapshot(null)).toThrow();
  });
});
