/** Path utilities for the virtual filesystem. All paths are POSIX-style. */

export const HOME = '/home/pyxis';

/**
 * Resolve `input` against `cwd` into a normalised absolute path.
 * Supports `~`, `.`, `..`, repeated slashes and trailing slashes. `..` never
 * escapes the virtual root, so no input can address anything outside it.
 */
export function resolvePath(input: string, cwd = '/', home = HOME): string {
  let p = input.trim();
  if (p === '' ) return normalize(cwd);
  if (p === '~') p = home;
  else if (p.startsWith('~/')) p = home + p.slice(1);
  if (!p.startsWith('/')) p = (cwd.endsWith('/') ? cwd : cwd + '/') + p;
  return normalize(p);
}

export function normalize(path: string): string {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return '/' + out.join('/');
}

export function splitPath(path: string): string[] {
  return normalize(path).split('/').filter(Boolean);
}

export function dirname(path: string): string {
  const parts = splitPath(path);
  parts.pop();
  return '/' + parts.join('/');
}

export function basename(path: string): string {
  const parts = splitPath(path);
  return parts[parts.length - 1] ?? '';
}

export function joinPath(dir: string, name: string): string {
  return normalize(dir + '/' + name);
}

/** True if `child` equals `parent` or lies beneath it. */
export function isWithin(child: string, parent: string): boolean {
  const c = normalize(child);
  const p = normalize(parent);
  return c === p || p === '/' || c.startsWith(p + '/');
}

export function extname(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

/** Show a path relative to home with `~`. */
export function displayPath(path: string, home = HOME): string {
  if (path === home) return '~';
  if (path.startsWith(home + '/')) return '~' + path.slice(home.length);
  return path;
}

/** Validate a single file or directory name. Returns an error message or null. */
export function validateName(name: string): string | null {
  if (name.length === 0) return 'Name cannot be empty';
  if (name === '.' || name === '..') return `'${name}' is reserved`;
  if (name === '__proto__') return `'${name}' is reserved`;
  if (name.includes('/')) return 'Name cannot contain "/"';
  if (/[\u0000-\u001f\u007f]/.test(name)) return 'Name cannot contain control characters';
  if (name.length > 255) return 'Name is longer than 255 characters';
  return null;
}
