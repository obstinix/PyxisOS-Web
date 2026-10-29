import { Signal } from './store';
import { HOME, basename, dirname, isWithin, joinPath, normalize, splitPath, validateName } from './path';

export type VfsErrorCode = 'ENOENT' | 'EEXIST' | 'ENOTDIR' | 'EISDIR' | 'ENOTEMPTY' | 'EPERM' | 'EINVAL' | 'ENOSPC';

export class VfsError extends Error {
  constructor(
    readonly code: VfsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'VfsError';
  }
}

export interface FileNode {
  type: 'file';
  name: string;
  content: string;
  ctime: number;
  mtime: number;
}

export interface DirNode {
  type: 'dir';
  name: string;
  children: Record<string, VfsNode>;
  ctime: number;
  mtime: number;
}

export type VfsNode = FileNode | DirNode;

export interface Entry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
  mtime: number;
  readonly: boolean;
}

export const MAX_FILE_BYTES = 1024 * 1024;
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

/** Paths that can never be removed, renamed or written into by the user. */
const READONLY_ROOTS = ['/system'];
const PROTECTED = new Set(['/', '/home', HOME, '/system', '/tmp']);

const now = () => Date.now();

function dir(name: string, children: Record<string, VfsNode> = {}): DirNode {
  const t = now();
  return { type: 'dir', name, children, ctime: t, mtime: t };
}

function file(name: string, content: string): FileNode {
  const t = now();
  return { type: 'file', name, content, ctime: t, mtime: t };
}

function getChild(d: DirNode, name: string): VfsNode | undefined {
  return Object.prototype.hasOwnProperty.call(d.children, name) ? d.children[name] : undefined;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

function clone<T extends VfsNode>(node: T): T {
  return structuredClone(node);
}

export interface SystemFiles {
  [name: string]: string;
}

/**
 * In-memory virtual filesystem. This is the single source of truth shared by
 * the terminal, file manager and editor; every mutation bumps `changed` so the
 * UI re-renders and the persistence layer schedules a save.
 */
export class VirtualFS {
  root: DirNode;
  readonly changed = new Signal();
  private bypassReadonly = false;

  constructor(root?: DirNode) {
    this.root = root ?? VirtualFS.defaultTree();
  }

  static defaultTree(): DirNode {
    return dir('', {
      home: dir('home', {
        pyxis: dir('pyxis', {
          Documents: dir('Documents', {
            'welcome.txt': file(
              'welcome.txt',
              [
                'Welcome to PyxisOS-Web.',
                '',
                'This desktop is a browser-based simulation of the PyxisOS environment.',
                'Files you create here live in your browser storage (IndexedDB) and',
                'persist across reloads. They are not on your host filesystem.',
                '',
                'Try the Terminal:  ls, cd Projects, cat notes.md, pyxis doctor',
              ].join('\n'),
            ),
          }),
          Projects: dir('Projects', {
            'notes.md': file(
              'notes.md',
              '# Lunar-Pyxis notes\n\n- Lunar Core: native microkernel (in development)\n- Pyxis CLI: system command interface\n- This web build simulates the desktop layer.\n',
            ),
          }),
          Downloads: dir('Downloads'),
          Desktop: dir('Desktop'),
        }),
      }),
      system: dir('system'),
      tmp: dir('tmp'),
    });
  }

  /** Replace the read-only /system tree with generated content. */
  installSystemFiles(files: SystemFiles): void {
    const sys = dir('system');
    for (const [name, content] of Object.entries(files)) sys.children[name] = file(name, content);
    this.root.children.system = sys;
    this.changed.emit();
  }

  // ---------------------------------------------------------------- lookup

  private lookup(path: string): VfsNode | undefined {
    let node: VfsNode = this.root;
    for (const part of splitPath(path)) {
      if (node.type !== 'dir') return undefined;
      const next: VfsNode | undefined = Object.prototype.hasOwnProperty.call(node.children, part)
        ? node.children[part]
        : undefined;
      if (!next) return undefined;
      node = next;
    }
    return node;
  }

  private requireNode(path: string): VfsNode {
    const node = this.lookup(path);
    if (!node) throw new VfsError('ENOENT', `${normalize(path)}: No such file or directory`);
    return node;
  }

  private requireDir(path: string): DirNode {
    const node = this.requireNode(path);
    if (node.type !== 'dir') throw new VfsError('ENOTDIR', `${normalize(path)}: Not a directory`);
    return node;
  }

  private parentOf(path: string): DirNode {
    const parentPath = dirname(path);
    const parent = this.lookup(parentPath);
    if (!parent) throw new VfsError('ENOENT', `${parentPath}: No such directory`);
    if (parent.type !== 'dir') throw new VfsError('ENOTDIR', `${parentPath}: Not a directory`);
    return parent;
  }

  isReadonly(path: string): boolean {
    if (this.bypassReadonly) return false;
    return READONLY_ROOTS.some((r) => isWithin(path, r));
  }

  private assertWritable(path: string): void {
    if (this.isReadonly(path)) throw new VfsError('EPERM', `${normalize(path)}: Read-only system location`);
  }

  private assertRemovable(path: string): void {
    const p = normalize(path);
    if (PROTECTED.has(p)) throw new VfsError('EPERM', `${p}: Protected system directory`);
    this.assertWritable(p);
  }

  exists(path: string): boolean {
    return this.lookup(path) !== undefined;
  }

  isDir(path: string): boolean {
    return this.lookup(path)?.type === 'dir';
  }

  isFile(path: string): boolean {
    return this.lookup(path)?.type === 'file';
  }

  stat(path: string): Entry {
    const p = normalize(path);
    return this.entry(p, this.requireNode(p));
  }

  private entry(path: string, node: VfsNode): Entry {
    return {
      name: node.name || '/',
      path,
      type: node.type,
      size: node.type === 'file' ? byteLength(node.content) : Object.keys(node.children).length,
      mtime: node.mtime,
      readonly: this.isReadonly(path) || PROTECTED.has(path),
    };
  }

  list(path: string): Entry[] {
    const p = normalize(path);
    const d = this.requireDir(p);
    return Object.values(d.children)
      .map((n) => this.entry(joinPath(p, n.name), n))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
  }

  readFile(path: string): string {
    const node = this.requireNode(path);
    if (node.type !== 'file') throw new VfsError('EISDIR', `${normalize(path)}: Is a directory`);
    return node.content;
  }

  // ---------------------------------------------------------------- mutation

  writeFile(path: string, content: string, opts: { append?: boolean } = {}): void {
    const p = normalize(path);
    this.assertWritable(p);
    const name = basename(p);
    const nameErr = validateName(name);
    if (nameErr) throw new VfsError('EINVAL', `${p}: ${nameErr}`);
    const parent = this.parentOf(p);
    const existing = getChild(parent, name);
    if (existing && existing.type === 'dir') throw new VfsError('EISDIR', `${p}: Is a directory`);
    const next = opts.append && existing ? existing.content + content : content;
    const size = byteLength(next);
    if (size > MAX_FILE_BYTES) throw new VfsError('ENOSPC', `${p}: File exceeds ${MAX_FILE_BYTES / 1024} KiB limit`);
    if (this.totalBytes() - (existing ? byteLength(existing.content) : 0) + size > MAX_TOTAL_BYTES) {
      throw new VfsError('ENOSPC', 'Virtual disk quota exceeded');
    }
    if (existing) {
      existing.content = next;
      existing.mtime = now();
    } else {
      parent.children[name] = file(name, next);
    }
    parent.mtime = now();
    this.changed.emit();
  }

  touch(path: string): void {
    const p = normalize(path);
    const node = this.lookup(p);
    if (node) {
      this.assertWritable(p);
      node.mtime = now();
      this.changed.emit();
    } else {
      this.writeFile(p, '');
    }
  }

  mkdir(path: string, opts: { parents?: boolean } = {}): void {
    const p = normalize(path);
    this.assertWritable(p);
    if (opts.parents) {
      let cur: DirNode = this.root;
      let curPath = '';
      for (const part of splitPath(p)) {
        curPath += '/' + part;
        const next = getChild(cur, part);
        if (!next) {
          const err = validateName(part);
          if (err) throw new VfsError('EINVAL', `${curPath}: ${err}`);
          this.assertWritable(curPath);
          cur.children[part] = dir(part);
          cur.mtime = now();
          cur = cur.children[part] as DirNode;
        } else if (next.type !== 'dir') {
          throw new VfsError('ENOTDIR', `${curPath}: Not a directory`);
        } else {
          cur = next;
        }
      }
      this.changed.emit();
      return;
    }
    if (this.exists(p)) throw new VfsError('EEXIST', `${p}: File exists`);
    const name = basename(p);
    const err = validateName(name);
    if (err) throw new VfsError('EINVAL', `${p}: ${err}`);
    const parent = this.parentOf(p);
    parent.children[name] = dir(name);
    parent.mtime = now();
    this.changed.emit();
  }

  remove(path: string, opts: { recursive?: boolean } = {}): void {
    const p = normalize(path);
    this.assertRemovable(p);
    const node = this.requireNode(p);
    if (node.type === 'dir' && !opts.recursive) {
      if (Object.keys(node.children).length > 0) throw new VfsError('ENOTEMPTY', `${p}: Directory not empty`);
    }
    const parent = this.parentOf(p);
    delete parent.children[node.name];
    parent.mtime = now();
    this.changed.emit();
  }

  /** Resolve the final destination for cp/mv: into `dest` if it is a directory. */
  private destination(src: string, dest: string): string {
    const d = normalize(dest);
    return this.isDir(d) ? joinPath(d, basename(src)) : d;
  }

  copy(src: string, dest: string, opts: { recursive?: boolean } = {}): string {
    const s = normalize(src);
    const node = this.requireNode(s);
    if (node.type === 'dir' && !opts.recursive) throw new VfsError('EISDIR', `${s}: Is a directory (use -r)`);
    const target = this.destination(s, dest);
    if (target === s) throw new VfsError('EINVAL', `${s}: Source and destination are the same`);
    if (node.type === 'dir' && isWithin(target, s)) {
      throw new VfsError('EINVAL', `Cannot copy ${s} into itself`);
    }
    this.assertWritable(target);
    const name = basename(target);
    const err = validateName(name);
    if (err) throw new VfsError('EINVAL', `${target}: ${err}`);
    const parent = this.parentOf(target);
    const existing = getChild(parent, name);
    if (existing && existing.type === 'dir') throw new VfsError('EEXIST', `${target}: Directory exists`);
    if (existing && node.type === 'dir') throw new VfsError('EEXIST', `${target}: File exists`);
    const copy = clone(node);
    copy.name = name;
    copy.mtime = now();
    if (this.totalBytes() + this.nodeBytes(copy) - (existing ? this.nodeBytes(existing) : 0) > MAX_TOTAL_BYTES) {
      throw new VfsError('ENOSPC', 'Virtual disk quota exceeded');
    }
    parent.children[name] = copy;
    parent.mtime = now();
    this.changed.emit();
    return target;
  }

  move(src: string, dest: string): string {
    const s = normalize(src);
    this.assertRemovable(s);
    const node = this.requireNode(s);
    const target = this.destination(s, dest);
    if (target === s) return s;
    if (node.type === 'dir' && isWithin(target, s)) throw new VfsError('EINVAL', `Cannot move ${s} into itself`);
    this.assertWritable(target);
    const name = basename(target);
    const err = validateName(name);
    if (err) throw new VfsError('EINVAL', `${target}: ${err}`);
    const parent = this.parentOf(target);
    const existing = getChild(parent, name);
    if (existing) {
      if (existing.type === 'dir' || node.type === 'dir') throw new VfsError('EEXIST', `${target}: Already exists`);
    }
    const oldParent = this.parentOf(s);
    delete oldParent.children[node.name];
    node.name = name;
    parent.children[name] = node;
    oldParent.mtime = parent.mtime = now();
    this.changed.emit();
    return target;
  }

  rename(path: string, newName: string): string {
    const err = validateName(newName);
    if (err) throw new VfsError('EINVAL', err);
    const p = normalize(path);
    const target = joinPath(dirname(p), newName);
    if (target !== p && this.exists(target)) throw new VfsError('EEXIST', `${target}: Already exists`);
    return this.move(p, target);
  }

  /** Pick a non-colliding name such as "untitled 2.txt" within `dirPath`. */
  uniqueName(dirPath: string, desired: string): string {
    const d = this.requireDir(dirPath);
    if (!getChild(d, desired)) return desired;
    const dot = desired.lastIndexOf('.');
    const stem = dot > 0 ? desired.slice(0, dot) : desired;
    const ext = dot > 0 ? desired.slice(dot) : '';
    for (let i = 2; ; i++) {
      const candidate = `${stem} ${i}${ext}`;
      if (!getChild(d, candidate)) return candidate;
    }
  }

  /** Case-insensitive name/content search below `rootPath`. */
  search(query: string, rootPath = '/', opts: { content?: boolean; limit?: number } = {}): Entry[] {
    const q = query.toLowerCase();
    const out: Entry[] = [];
    const limit = opts.limit ?? 200;
    if (!q) return out;
    const walk = (path: string, node: VfsNode) => {
      if (out.length >= limit) return;
      if (path !== normalize(rootPath)) {
        const hit =
          node.name.toLowerCase().includes(q) ||
          (opts.content && node.type === 'file' && node.content.toLowerCase().includes(q));
        if (hit) out.push(this.entry(path, node));
      }
      if (node.type === 'dir') {
        for (const child of Object.values(node.children)) walk(joinPath(path, child.name), child);
      }
    };
    walk(normalize(rootPath), this.requireNode(rootPath));
    return out;
  }

  private nodeBytes(node: VfsNode): number {
    if (node.type === 'file') return byteLength(node.content);
    let total = 0;
    for (const c of Object.values(node.children)) total += this.nodeBytes(c);
    return total;
  }

  totalBytes(): number {
    return this.nodeBytes(this.root);
  }

  counts(): { files: number; dirs: number } {
    let files = 0;
    let dirs = 0;
    const walk = (n: VfsNode) => {
      if (n.type === 'file') files++;
      else {
        dirs++;
        Object.values(n.children).forEach(walk);
      }
    };
    walk(this.root);
    return { files, dirs };
  }

  // ---------------------------------------------------------------- serialization

  serialize(): DirNode {
    const snapshot = clone(this.root);
    // /system is regenerated on every boot; do not persist it.
    snapshot.children.system = dir('system');
    return snapshot;
  }

  /** Load a previously serialized tree, validating its shape. */
  static fromSnapshot(snapshot: unknown): VirtualFS {
    if (!isDirNode(snapshot)) throw new Error('Invalid filesystem snapshot');
    const fs = new VirtualFS(snapshot);
    // Ensure required directories exist even if a snapshot predates them.
    fs.bypassReadonly = true;
    for (const p of ['/home', HOME, `${HOME}/Documents`, `${HOME}/Projects`, `${HOME}/Downloads`, '/system', '/tmp']) {
      if (!fs.isDir(p)) fs.mkdir(p, { parents: true });
    }
    fs.bypassReadonly = false;
    return fs;
  }
}

function isNode(v: unknown): v is VfsNode {
  if (!v || typeof v !== 'object') return false;
  const n = v as Record<string, unknown>;
  if (typeof n.name !== 'string') return false;
  if (n.type === 'file') return typeof n.content === 'string';
  if (n.type === 'dir') return isDirNode(v);
  return false;
}

function isDirNode(v: unknown): v is DirNode {
  if (!v || typeof v !== 'object') return false;
  const n = v as Record<string, unknown>;
  if (n.type !== 'dir' || typeof n.children !== 'object' || n.children === null) return false;
  return Object.values(n.children as Record<string, unknown>).every(isNode);
}
