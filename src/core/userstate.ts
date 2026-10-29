import { APPS, AppId, getApp } from './apps';
import { asArray, asObject, persisted } from './persisted';
import { wm } from './windows';

export interface UserState {
  /** Apps pinned to the dock, in order. */
  favorites: AppId[];
  /** Most recently launched apps, newest first. */
  recents: AppId[];
  onboardingDone: boolean;
  tourDone: boolean;
}

const defaults = (): UserState => ({
  favorites: APPS.filter((a) => a.pinned).map((a) => a.id),
  recents: [],
  onboardingDone: false,
  tourDone: false,
});

function appIds(v: unknown, max: number): AppId[] {
  const out: AppId[] = [];
  for (const id of asArray(v, 50)) {
    if (typeof id === 'string' && getApp(id) && !out.includes(id as AppId)) out.push(id as AppId);
  }
  return out.slice(0, max);
}

export const userState = persisted<UserState>({
  key: 'user',
  version: 1,
  defaults,
  load(raw) {
    const r = asObject(raw);
    return {
      favorites: Array.isArray(r.favorites) ? appIds(r.favorites, 24) : defaults().favorites,
      recents: appIds(r.recents, 8),
      onboardingDone: r.onboardingDone === true,
      tourDone: r.tourDone === true,
    };
  },
});

export function isFavorite(id: AppId): boolean {
  return userState.get().favorites.includes(id);
}

export function toggleFavorite(id: AppId): void {
  userState.set((s) => ({
    ...s,
    favorites: s.favorites.includes(id) ? s.favorites.filter((f) => f !== id) : [...s.favorites, id],
  }));
}

export function setUserFlag(flag: 'onboardingDone' | 'tourDone', value: boolean): void {
  userState.set((s) => (s[flag] === value ? s : { ...s, [flag]: value }));
}

export function clearRecents(): void {
  userState.set((s) => ({ ...s, recents: [] }));
}

wm.onOpen((win) => {
  userState.set((s) => (s.recents[0] === win.appId ? s : { ...s, recents: [win.appId, ...s.recents.filter((r) => r !== win.appId)].slice(0, 8) }));
});
