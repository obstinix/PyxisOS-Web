import { HOME, basename, dirname, isWithin, joinPath } from './path';
import { VirtualFS } from './vfs';
import { asArray, persisted } from './persisted';
import { events } from './events';

/**
 * Trash for the Files app. Deleted items are moved into ~/.Trash and their
 * original location is recorded so they can be restored. The terminal's `rm`
 * keeps Unix semantics and deletes permanently.
 */
export const TRASH_DIR = `${HOME}/.Trash`;

export interface TrashRecord {
  /** Name of the item inside the trash directory. */
  name: string;
  original: string;
  deletedAt: number;
}

export const trashIndex = persisted<TrashRecord[]>({
  key: 'trash',
  version: 1,
  defaults: () => [],
  load: (raw) =>
    asArray(raw, 2000).filter(
      (r): r is TrashRecord => !!r && typeof r === 'object' && typeof (r as TrashRecord).name === 'string' && typeof (r as TrashRecord).original === 'string' && typeof (r as TrashRecord).deletedAt === 'number',
    ),
});

export function inTrash(path: string): boolean {
  return isWithin(path, TRASH_DIR);
}

/** Records whose items still exist in the trash directory. */
export function trashItems(fs: VirtualFS): TrashRecord[] {
  return trashIndex.get().filter((r) => fs.exists(joinPath(TRASH_DIR, r.name)));
}

export function moveToTrash(fs: VirtualFS, path: string): TrashRecord {
  if (inTrash(path)) throw new Error('Item is already in the Trash');
  if (!fs.isDir(TRASH_DIR)) fs.mkdir(TRASH_DIR, { parents: true });
  const name = fs.uniqueName(TRASH_DIR, basename(path));
  fs.move(path, joinPath(TRASH_DIR, name));
  const rec: TrashRecord = { name, original: path, deletedAt: Date.now() };
  trashIndex.set((list) => [rec, ...list.filter((r) => r.name !== name)]);
  events.log('files', `Moved ${path} to Trash`);
  return rec;
}

/** Restore an item to its original location (recreating parent folders; renaming on conflict). */
export function restoreFromTrash(fs: VirtualFS, name: string): string {
  const rec = trashIndex.get().find((r) => r.name === name);
  const src = joinPath(TRASH_DIR, name);
  if (!rec || !fs.exists(src)) throw new Error('Item is no longer in the Trash');
  const parent = dirname(rec.original);
  if (!fs.isDir(parent)) fs.mkdir(parent, { parents: true });
  const target = fs.exists(rec.original) ? joinPath(parent, fs.uniqueName(parent, basename(rec.original))) : rec.original;
  fs.move(src, target);
  trashIndex.set((list) => list.filter((r) => r.name !== name));
  events.log('files', `Restored ${target} from Trash`);
  return target;
}

export function deleteFromTrash(fs: VirtualFS, name: string): void {
  const p = joinPath(TRASH_DIR, name);
  if (fs.exists(p)) fs.remove(p, { recursive: true });
  trashIndex.set((list) => list.filter((r) => r.name !== name));
}

export function emptyTrash(fs: VirtualFS): number {
  if (!fs.isDir(TRASH_DIR)) return 0;
  const items = fs.list(TRASH_DIR);
  for (const e of items) fs.remove(e.path, { recursive: true });
  trashIndex.set([]);
  events.log('files', `Emptied Trash (${items.length} item(s) permanently deleted)`, 'warn');
  return items.length;
}
