import { asArray, asObject, asString, persisted } from './persisted';
import { events } from './events';

/**
 * State and URL policy for the Pyxis Browser.
 *
 * The browser is a shell around the host browser's own engine: web pages are
 * loaded in sandboxed iframes by the user's real browser. Search results come
 * from the DuckDuckGo Instant Answer API and the Wikipedia search API, both of
 * which allow cross-origin requests. Sites that send X-Frame-Options or a
 * frame-ancestors policy cannot be embedded and are opened in a real browser
 * tab instead.
 */

export const HOME_URL = 'pyxis://start';
export const INTERNAL_PAGES = ['start', 'search', 'history', 'bookmarks', 'about'] as const;

export interface Tab {
  id: string;
  /** Navigation stack for this tab and the current position in it. */
  stack: string[];
  index: number;
  title: string;
}

export interface Bookmark {
  url: string;
  title: string;
  addedAt: number;
}

export interface Visit {
  url: string;
  title: string;
  time: number;
}

export interface BrowserState {
  tabs: Tab[];
  activeId: string;
  bookmarks: Bookmark[];
  history: Visit[];
}

let tabSeq = 0;
export function newTab(url = HOME_URL): Tab {
  return { id: `tab-${Date.now().toString(36)}-${++tabSeq}`, stack: [url], index: 0, title: titleFor(url) };
}

const defaults = (): BrowserState => {
  const t = newTab();
  return {
    tabs: [t],
    activeId: t.id,
    bookmarks: [
      { url: 'https://github.com/obstinix/PyxisOS-Web', title: 'PyxisOS-Web on GitHub', addedAt: 0 },
      { url: 'https://en.wikipedia.org/wiki/Microkernel', title: 'Microkernel — Wikipedia', addedAt: 0 },
      { url: 'pyxis://about', title: 'About Pyxis Browser', addedAt: 0 },
    ],
    history: [],
  };
};

function validUrl(u: unknown): string | null {
  const s = asString(u, 2048);
  if (!s) return null;
  const r = resolveInput(s);
  return r.kind === 'error' ? null : r.url;
}

export const browserState = persisted<BrowserState>({
  key: 'browser',
  version: 1,
  defaults,
  load(raw) {
    const r = asObject(raw);
    const tabs: Tab[] = [];
    for (const t of asArray(r.tabs, 12)) {
      if (!t || typeof t !== 'object') continue;
      const tt = t as Record<string, unknown>;
      const stack = asArray(tt.stack, 50).map(validUrl).filter((x): x is string => !!x);
      if (!stack.length || typeof tt.id !== 'string') continue;
      const index = typeof tt.index === 'number' ? Math.min(Math.max(0, Math.floor(tt.index)), stack.length - 1) : stack.length - 1;
      tabs.push({ id: tt.id.slice(0, 60), stack, index, title: asString(tt.title, 200) ?? titleFor(stack[index]) });
    }
    if (!tabs.length) tabs.push(newTab());
    const activeId = typeof r.activeId === 'string' && tabs.some((t) => t.id === r.activeId) ? r.activeId : tabs[0].id;
    const bookmarks: Bookmark[] = [];
    for (const b of asArray(r.bookmarks, 200)) {
      const bb = b as Record<string, unknown>;
      const url = validUrl(bb?.url);
      if (url) bookmarks.push({ url, title: asString(bb.title, 200) ?? url, addedAt: typeof bb.addedAt === 'number' ? bb.addedAt : 0 });
    }
    const history: Visit[] = [];
    for (const v of asArray(r.history, 500)) {
      const vv = v as Record<string, unknown>;
      const url = validUrl(vv?.url);
      if (url && typeof vv.time === 'number') history.push({ url, title: asString(vv.title, 200) ?? url, time: vv.time });
    }
    return { tabs, activeId, bookmarks, history };
  },
});

/** Hosts verified (2026-10-29) to send X-Frame-Options / frame-ancestors that forbid embedding. */
export const FRAME_BLOCKED_HOSTS = [
  'duckduckgo.com',
  'github.com',
  'google.com',
  'youtube.com',
  'x.com',
  'twitter.com',
  'reddit.com',
  'stackoverflow.com',
  'developer.mozilla.org',
  'news.ycombinator.com',
  'bing.com',
  'openstreetmap.org',
  'facebook.com',
  'linkedin.com',
];

export function isFrameBlocked(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return FRAME_BLOCKED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export type Resolved = { kind: 'internal'; url: string } | { kind: 'web'; url: string } | { kind: 'error'; url: string; message: string };

const BLOCKED_SCHEMES = ['javascript:', 'data:', 'file:', 'blob:', 'about:', 'chrome:', 'vbscript:', 'filesystem:'];

/** Turn address-bar input into an internal page, a web URL or a search. */
export function resolveInput(input: string): Resolved {
  const text = input.trim();
  if (!text) return { kind: 'internal', url: HOME_URL };
  const lower = text.toLowerCase();
  if (lower.startsWith('pyxis://')) {
    const page = lower.slice(8).split(/[?#/]/)[0];
    if ((INTERNAL_PAGES as readonly string[]).includes(page)) return { kind: 'internal', url: text.slice(0, 2048) };
    return { kind: 'error', url: text, message: `Unknown internal page “${page}”` };
  }
  if (BLOCKED_SCHEMES.some((s) => lower.startsWith(s))) {
    return { kind: 'error', url: text, message: 'This address type is blocked for security. Only http and https pages can be opened.' };
  }
  let candidate = text;
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  if (!hasScheme) {
    const looksLikeHost = !/\s/.test(text) && (/^[^/]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(text) || /^localhost(:\d+)?([/?#].*)?$/i.test(text));
    if (!looksLikeHost) return { kind: 'internal', url: searchUrl(text) };
    candidate = `${/^localhost/i.test(text) ? 'http' : 'https'}://${text}`;
  }
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { kind: 'error', url: text, message: `The ${u.protocol} scheme is not supported. Only http and https pages can be opened.` };
    }
    if (u.username || u.password) return { kind: 'error', url: text, message: 'Addresses containing credentials are blocked.' };
    if (typeof location !== 'undefined' && u.origin === location.origin) {
      return { kind: 'error', url: text, message: 'PyxisOS-Web cannot embed itself. Use the desktop directly.' };
    }
    return { kind: 'web', url: u.toString() };
  } catch {
    return { kind: 'internal', url: searchUrl(text) };
  }
}

export function searchUrl(q: string): string {
  return `pyxis://search?q=${encodeURIComponent(q.trim().slice(0, 500))}`;
}

export function searchQuery(url: string): string | null {
  if (!url.startsWith('pyxis://search')) return null;
  const i = url.indexOf('?');
  return i < 0 ? '' : new URLSearchParams(url.slice(i + 1)).get('q') ?? '';
}

export function duckDuckGoUrl(q: string): string {
  return `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
}

export function titleFor(url: string): string {
  if (url.startsWith('pyxis://')) {
    const q = searchQuery(url);
    if (q !== null) return q ? `${q} — Search` : 'Search';
    const page = url.slice(8).split(/[?#/]/)[0];
    return { start: 'Start', history: 'History', bookmarks: 'Bookmarks', about: 'About' }[page] ?? 'Pyxis';
  }
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// ------------------------------------------------------------------ actions

function patch(fn: (s: BrowserState) => BrowserState): void {
  browserState.set(fn);
}

function patchTab(id: string, fn: (t: Tab) => Tab): void {
  patch((s) => ({ ...s, tabs: s.tabs.map((t) => (t.id === id ? fn(t) : t)) }));
}

export function activeTab(s = browserState.get()): Tab {
  return s.tabs.find((t) => t.id === s.activeId) ?? s.tabs[0];
}

export function currentUrl(t: Tab): string {
  return t.stack[t.index];
}

/** Push a resolved URL onto a tab's history, dropping any forward entries. */
export function navigate(tabId: string, url: string): void {
  patchTab(tabId, (t) => {
    if (t.stack[t.index] === url) return t;
    const stack = [...t.stack.slice(0, t.index + 1), url].slice(-50);
    return { ...t, stack, index: stack.length - 1, title: titleFor(url) };
  });
  recordVisit(url, titleFor(url));
}

export function goBack(tabId: string): void {
  patchTab(tabId, (t) => (t.index > 0 ? { ...t, index: t.index - 1, title: titleFor(t.stack[t.index - 1]) } : t));
}

export function goForward(tabId: string): void {
  patchTab(tabId, (t) => (t.index < t.stack.length - 1 ? { ...t, index: t.index + 1, title: titleFor(t.stack[t.index + 1]) } : t));
}

export function openTab(url = HOME_URL): string {
  const t = newTab(url);
  patch((s) => ({ ...s, tabs: [...s.tabs, t].slice(-12), activeId: t.id }));
  if (url !== HOME_URL) recordVisit(url, titleFor(url));
  return t.id;
}

export function closeTab(id: string): void {
  patch((s) => {
    const idx = s.tabs.findIndex((t) => t.id === id);
    if (idx < 0) return s;
    const tabs = s.tabs.filter((t) => t.id !== id);
    if (!tabs.length) {
      const t = newTab();
      return { ...s, tabs: [t], activeId: t.id };
    }
    const activeId = s.activeId === id ? tabs[Math.min(idx, tabs.length - 1)].id : s.activeId;
    return { ...s, tabs, activeId };
  });
}

export function selectTab(id: string): void {
  patch((s) => (s.tabs.some((t) => t.id === id) ? { ...s, activeId: id } : s));
}

export function recordVisit(url: string, title: string): void {
  if (url === HOME_URL) return;
  patch((s) => ({ ...s, history: [{ url, title, time: Date.now() }, ...s.history].slice(0, 500) }));
}

export function isBookmarked(url: string): boolean {
  return browserState.get().bookmarks.some((b) => b.url === url);
}

export function toggleBookmark(url: string, title: string): boolean {
  const on = !isBookmarked(url);
  patch((s) => ({
    ...s,
    bookmarks: on ? [...s.bookmarks, { url, title, addedAt: Date.now() }] : s.bookmarks.filter((b) => b.url !== url),
  }));
  events.log('browser', `${on ? 'Bookmarked' : 'Removed bookmark'} ${url}`);
  return on;
}

export function removeBookmark(url: string): void {
  patch((s) => ({ ...s, bookmarks: s.bookmarks.filter((b) => b.url !== url) }));
}

export function clearHistory(): void {
  patch((s) => ({ ...s, history: [] }));
  events.log('browser', 'Browsing history cleared');
}

// ------------------------------------------------------------------ search APIs

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: 'DuckDuckGo' | 'Wikipedia';
}

export interface SearchResponse {
  answer: { heading: string; text: string; url: string; source: string } | null;
  results: SearchResult[];
  errors: string[];
}

function stripTags(html: string): string {
  // Snippets are rendered as plain text; the DOM parser never executes markup here.
  if (typeof DOMParser !== 'undefined') return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
  return html.replace(/<[^>]*>/g, '');
}

/** Query DuckDuckGo Instant Answers and Wikipedia search (both CORS-enabled). */
export async function search(q: string, signal?: AbortSignal): Promise<SearchResponse> {
  const out: SearchResponse = { answer: null, results: [], errors: [] };
  const ddg = fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1&t=pyxisos-web`, { signal })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((d: { Heading?: string; AbstractText?: string; AbstractURL?: string; AbstractSource?: string; RelatedTopics?: unknown[] }) => {
      if (d.AbstractText) out.answer = { heading: d.Heading ?? q, text: d.AbstractText, url: d.AbstractURL ?? '', source: d.AbstractSource ?? 'DuckDuckGo' };
      const flat: { Text?: string; FirstURL?: string }[] = [];
      for (const t of d.RelatedTopics ?? []) {
        const topic = t as { Text?: string; FirstURL?: string; Topics?: { Text?: string; FirstURL?: string }[] };
        if (topic.Topics) flat.push(...topic.Topics);
        else flat.push(topic);
      }
      for (const t of flat.slice(0, 6)) {
        if (t.FirstURL && t.Text) out.results.push({ title: t.Text.split(' - ')[0].slice(0, 120), url: t.FirstURL, snippet: t.Text, source: 'DuckDuckGo' });
      }
    })
    .catch((e: Error) => {
      if (e.name === 'AbortError') return;
      // The Instant Answer API answers queries it has nothing for with an empty,
      // unreadable body, which browsers surface as a network TypeError.
      out.errors.push(e instanceof TypeError || e instanceof SyntaxError ? 'DuckDuckGo has no instant answer for this query (full results open in a new tab).' : `DuckDuckGo: ${e.message}`);
    });
  const wiki = fetch(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=8&srsearch=${encodeURIComponent(q)}`,
    { signal },
  )
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((d: { query?: { search?: { title: string; snippet: string }[] } }) => {
      for (const r of d.query?.search ?? []) {
        out.results.push({
          title: r.title,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
          snippet: stripTags(r.snippet),
          source: 'Wikipedia',
        });
      }
    })
    .catch((e: Error) => {
      if (e.name !== 'AbortError') out.errors.push(`Wikipedia: ${e.message}`);
    });
  await Promise.all([ddg, wiki]);
  return out;
}

/** Title suggestions from Wikipedia's OpenSearch endpoint (CORS-enabled). */
export async function suggest(q: string, signal?: AbortSignal): Promise<string[]> {
  const r = await fetch(`https://en.wikipedia.org/w/api.php?action=opensearch&format=json&origin=*&limit=6&search=${encodeURIComponent(q)}`, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = (await r.json()) as [string, string[]];
  return Array.isArray(d[1]) ? d[1].filter((x) => typeof x === 'string').slice(0, 6) : [];
}
