import { useEffect, useMemo, useRef, useState } from 'react';
import { AppProps } from './types';
import { useStore } from '../core/store';
import {
  activeTab,
  browserState,
  clearHistory,
  closeTab,
  currentUrl,
  duckDuckGoUrl,
  FRAME_BLOCKED_HOSTS,
  goBack,
  goForward,
  HOME_URL,
  isFrameBlocked,
  navigate,
  openTab,
  removeBookmark,
  resolveInput,
  search,
  SearchResponse,
  searchQuery,
  searchUrl,
  selectTab,
  suggest,
  Tab,
  titleFor,
  toggleBookmark,
} from '../core/browser';
import { request } from '../core/aegis';
import { isRunning, serviceRuntime } from '../core/services';
import { setTabSource } from '../core/processes';
import { wm } from '../core/windows';
import { Icon } from '../shell/icons';
import { Badge, confirmDialog, EmptyState, timeAgo } from '../shell/ui';

setTabSource(() => browserState.get().tabs.map((t) => ({ id: t.id, title: t.title, url: currentUrl(t) })));

function openExternal(url: string): void {
  // A real browser tab, isolated from PyxisOS-Web (no opener access).
  window.open(url, '_blank', 'noopener,noreferrer');
}

type Gate = { ok: true } | { ok: false; reason: 'netd' | 'offline' | 'denied'; message: string };

/** Pages are only loaded when the simulated network daemon runs, the browser is online and Aegis allows it. */
async function gate(url: string): Promise<Gate> {
  if (!isRunning('pyxis-netd')) return { ok: false, reason: 'netd', message: 'The simulated pyxis-netd service is stopped, so Pyxis Browser will not load pages. Your real network connection is unaffected.' };
  if (!navigator.onLine) return { ok: false, reason: 'offline', message: 'Your browser reports that it is offline.' };
  const rec = await request('browser', 'network.navigate', url);
  if (rec.decision === 'deny') return { ok: false, reason: 'denied', message: `Aegis denied network access: ${rec.reason}` };
  return { ok: true };
}

export function BrowserApp({ win }: AppProps) {
  const state = useStore(browserState);
  useStore(serviceRuntime);
  const tab = activeTab(state);
  const url = currentUrl(tab);
  const [address, setAddress] = useState(url);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [suggestions, setSuggestions] = useState<{ text: string; kind: 'bookmark' | 'history' | 'wikipedia'; url?: string }[]>([]);
  const [activeSug, setActiveSug] = useState(-1);
  const addressRef = useRef<HTMLInputElement>(null);
  const bookmarked = state.bookmarks.some((b) => b.url === url);

  useEffect(() => {
    if (!editing) setAddress(url);
    setError(null);
  }, [url, editing]);

  // Launch arguments from other apps (e.g. the assistant's "search the web").
  useEffect(() => {
    const target = win.props.url;
    if (typeof target === 'string') {
      const r = resolveInput(target);
      if (r.kind !== 'error') openTab(r.url);
    }
  }, [win.props.url, win.props.nonce]);

  // Address bar suggestions: bookmarks and history locally, plus Wikipedia titles when online.
  useEffect(() => {
    const q = address.trim().toLowerCase();
    if (!editing || q.length < 2 || q === url.toLowerCase()) {
      setSuggestions([]);
      return;
    }
    const local = [
      ...state.bookmarks.filter((b) => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)).map((b) => ({ text: b.title, url: b.url, kind: 'bookmark' as const })),
      ...state.history.filter((h) => h.url.toLowerCase().includes(q) || h.title.toLowerCase().includes(q)).map((h) => ({ text: h.title, url: h.url, kind: 'history' as const })),
    ]
      .filter((x, i, arr) => arr.findIndex((y) => y.url === x.url) === i)
      .slice(0, 4);
    setSuggestions(local);
    setActiveSug(-1);
    if (!isRunning('pyxis-netd') || !navigator.onLine || /^[a-z]+:\/\//i.test(q)) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      suggest(address.trim(), ctrl.signal)
        .then((titles) => setSuggestions([...local, ...titles.map((text) => ({ text, kind: 'wikipedia' as const }))]))
        .catch(() => undefined);
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [address, editing, state.bookmarks, state.history, url]);

  const go = (input: string, tabId = tab.id) => {
    const r = resolveInput(input);
    setSuggestions([]);
    setEditing(false);
    if (r.kind === 'error') {
      setError(r.message);
      return;
    }
    setError(null);
    navigate(tabId, r.url);
    addressRef.current?.blur();
  };

  const reload = () => setReloads((m) => ({ ...m, [tab.id]: (m[tab.id] ?? 0) + 1 }));

  const onKeyDown = (e: React.KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (e.ctrlKey && !e.altKey && k === 'l') {
      e.preventDefault();
      addressRef.current?.focus();
      addressRef.current?.select();
    } else if (e.ctrlKey && !e.altKey && k === 'r') {
      e.preventDefault();
      reload();
    } else if (e.ctrlKey && !e.altKey && k === 'd') {
      e.preventDefault();
      toggleBookmark(url, tab.title);
    } else if (e.altKey && !e.shiftKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      goBack(tab.id);
    } else if (e.altKey && !e.shiftKey && e.key === 'ArrowRight') {
      e.preventDefault();
      goForward(tab.id);
    } else if (e.altKey && !e.shiftKey && k === 'n') {
      e.preventDefault();
      openTab();
    } else if (e.altKey && !e.shiftKey && k === 'q') {
      e.preventDefault();
      closeTab(tab.id);
    }
  };

  const isWeb = url.startsWith('http');

  return (
    <div className="browser" onKeyDown={onKeyDown}>
      <div className="browser-tabs" role="tablist" aria-label="Browser tabs">
        {state.tabs.map((t) => (
          <div key={t.id} className={`browser-tab${t.id === tab.id ? ' active' : ''}`}>
            <button role="tab" aria-selected={t.id === tab.id} className="browser-tab-label" onClick={() => selectTab(t.id)} title={currentUrl(t)}>
              {loading[t.id] && <span className="spinner" aria-label="Loading" />}
              <span className="truncate">{t.title || titleFor(currentUrl(t))}</span>
            </button>
            <button className="tab-close" aria-label={`Close tab ${t.title}`} title="Close tab (Alt+Q)" onClick={() => closeTab(t.id)}>
              <Icon.close size={12} />
            </button>
          </div>
        ))}
        <button className="icon-btn" aria-label="New tab" title="New tab (Alt+N)" onClick={() => openTab()} disabled={state.tabs.length >= 12}>
          <Icon.plus size={15} />
        </button>
      </div>
      <div className="browser-bar">
        <button className="icon-btn" aria-label="Back" title="Back (Alt+←)" onClick={() => goBack(tab.id)} disabled={tab.index === 0}>
          <Icon.arrowLeft size={15} />
        </button>
        <button className="icon-btn" aria-label="Forward" title="Forward (Alt+→)" onClick={() => goForward(tab.id)} disabled={tab.index >= tab.stack.length - 1}>
          <Icon.arrowRight size={15} />
        </button>
        <button className="icon-btn" aria-label="Reload" title="Reload (Ctrl+R)" onClick={reload}>
          <Icon.refresh size={15} />
        </button>
        <button className="icon-btn" aria-label="Home" title="Home" onClick={() => go(HOME_URL)}>
          <Icon.home size={15} />
        </button>
        <form
          className="browser-address"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            const s = activeSug >= 0 ? suggestions[activeSug] : undefined;
            go(s ? s.url ?? searchUrl(s.text) : address);
          }}
        >
          {isWeb ? <Icon.lock size={13} /> : <Icon.search size={13} />}
          <input
            ref={addressRef}
            value={address}
            onChange={(e) => {
              setEditing(true);
              setAddress(e.target.value);
            }}
            onFocus={(e) => {
              setEditing(true);
              e.target.select();
            }}
            onBlur={() => setTimeout(() => setEditing(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && suggestions.length) {
                e.preventDefault();
                setActiveSug((i) => Math.min(suggestions.length - 1, i + 1));
              } else if (e.key === 'ArrowUp' && suggestions.length) {
                e.preventDefault();
                setActiveSug((i) => Math.max(-1, i - 1));
              } else if (e.key === 'Escape') {
                setEditing(false);
                setAddress(url);
                setSuggestions([]);
              }
            }}
            aria-label="Address or search"
            aria-autocomplete="list"
            aria-controls="browser-suggestions"
            aria-activedescendant={activeSug >= 0 ? `bsug-${activeSug}` : undefined}
            placeholder="Search with DuckDuckGo & Wikipedia, or enter an address"
            spellCheck={false}
            autoComplete="off"
            data-autofocus
          />
          {editing && suggestions.length > 0 && (
            <ul className="browser-suggest" id="browser-suggestions" role="listbox">
              {suggestions.map((s, i) => (
                <li key={`${s.kind}-${s.text}-${i}`} id={`bsug-${i}`} role="option" aria-selected={i === activeSug} className={i === activeSug ? 'active' : ''} onPointerDown={(e) => {
                  e.preventDefault();
                  go(s.url ?? searchUrl(s.text));
                }}>
                  {s.kind === 'bookmark' ? <Icon.bookmarkFilled size={13} /> : s.kind === 'history' ? <Icon.history size={13} /> : <Icon.search size={13} />}
                  <span className="truncate">{s.text}</span>
                  <span className="muted small">{s.kind === 'wikipedia' ? 'Wikipedia suggestion' : s.url}</span>
                </li>
              ))}
            </ul>
          )}
        </form>
        <button className="icon-btn" aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this page'} aria-pressed={bookmarked} title="Bookmark (Ctrl+D)" onClick={() => toggleBookmark(url, tab.title)}>
          {bookmarked ? <Icon.bookmarkFilled size={15} /> : <Icon.bookmark size={15} />}
        </button>
        <button
          className="icon-btn"
          aria-label="Open in a real browser tab"
          title="Open in a new browser tab"
          disabled={!isWeb && searchQuery(url) === null}
          onClick={() => openExternal(isWeb ? url : duckDuckGoUrl(searchQuery(url) ?? ''))}
        >
          <Icon.external size={15} />
        </button>
      </div>
      {error && (
        <div className="banner banner-err" role="alert">
          {error}
        </div>
      )}
      <div className="browser-views">
        {state.tabs.map((t) => (
          <TabView
            key={t.id}
            tab={t}
            active={t.id === tab.id}
            nonce={reloads[t.id] ?? 0}
            onLoading={(v) => setLoading((m) => (m[t.id] === v ? m : { ...m, [t.id]: v }))}
            go={(u) => go(u, t.id)}
          />
        ))}
      </div>
    </div>
  );
}

function TabView({ tab, active, nonce, onLoading, go }: { tab: Tab; active: boolean; nonce: number; onLoading: (v: boolean) => void; go: (u: string) => void }) {
  const url = currentUrl(tab);
  const [gateResult, setGateResult] = useState<Gate | null>(null);
  const [slow, setSlow] = useState(false);
  const needsNetwork = url.startsWith('http') || (searchQuery(url) ?? '') !== '';
  useStore(serviceRuntime);
  const netd = isRunning('pyxis-netd');

  useEffect(() => {
    if (!needsNetwork) {
      setGateResult({ ok: true });
      return;
    }
    let cancelled = false;
    setGateResult(null);
    void gate(url).then((g) => !cancelled && setGateResult(g));
    return () => {
      cancelled = true;
    };
  }, [url, nonce, needsNetwork, netd]);

  const framed = url.startsWith('http') && !isFrameBlocked(url) && gateResult?.ok;
  useEffect(() => {
    if (!framed) {
      onLoading(false);
      return;
    }
    onLoading(true);
    setSlow(false);
    const t = setTimeout(() => setSlow(true), 10000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, nonce, framed]);

  let body: JSX.Element;
  if (gateResult && !gateResult.ok) {
    body = (
      <div className="browser-page center">
        <EmptyState icon={<Icon.wifiOff size={30} />} title={gateResult.reason === 'netd' ? 'Network service stopped' : gateResult.reason === 'offline' ? 'You are offline' : 'Permission denied'}>
          {gateResult.message}
        </EmptyState>
        <div className="row gap-2">
          {gateResult.reason === 'netd' && (
            <button className="btn" onClick={() => wm.open('services')}>
              Open Service Manager
            </button>
          )}
          {gateResult.reason === 'denied' && (
            <button className="btn" onClick={() => wm.open('aegis')}>
              Open Aegis Security Center
            </button>
          )}
        </div>
      </div>
    );
  } else if (!gateResult) {
    body = <div className="browser-page center muted">Checking permissions…</div>;
  } else if (url.startsWith('pyxis://')) {
    body = <InternalPage url={url} go={go} nonce={nonce} />;
  } else if (isFrameBlocked(url)) {
    const host = new URL(url).hostname;
    body = (
      <div className="browser-page center">
        <EmptyState icon={<Icon.external size={30} />} title={`${host} cannot be shown inside PyxisOS`}>
          This site sends an X-Frame-Options or Content-Security-Policy header that forbids embedding in other pages. Browsers enforce this, so PyxisOS-Web does not try to work around it.
        </EmptyState>
        <button className="btn primary" onClick={() => openExternal(url)}>
          Open {host} in a new browser tab <Icon.external size={13} />
        </button>
      </div>
    );
  } else {
    body = (
      <>
        <iframe
          key={`${url}#${nonce}`}
          className="browser-frame"
          src={url}
          title={tab.title}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="strict-origin-when-cross-origin"
          allow=""
          onLoad={() => {
            onLoading(false);
            setSlow(false);
          }}
        />
        <div className="browser-note small">
          Embedded with your browser’s engine in a sandboxed frame. Links you follow inside the page are not visible to PyxisOS (cross-origin), so the address bar shows the last address opened here.{' '}
          {slow && <strong>Still loading — the site may refuse embedding. </strong>}
          <button className="linklike" onClick={() => openExternal(url)}>
            Open in new tab ↗
          </button>
        </div>
      </>
    );
  }
  return (
    <div className="browser-view" hidden={!active} role="tabpanel" aria-label={tab.title}>
      {body}
    </div>
  );
}

function InternalPage({ url, go, nonce }: { url: string; go: (u: string) => void; nonce: number }) {
  const page = url.slice(8).split(/[?#/]/)[0];
  const q = searchQuery(url);
  if (q !== null) return <SearchPage q={q} go={go} nonce={nonce} />;
  if (page === 'history') return <HistoryPage go={go} />;
  if (page === 'bookmarks') return <BookmarksPage go={go} />;
  if (page === 'about') return <AboutBrowser go={go} />;
  return <StartPage go={go} />;
}

function StartPage({ go }: { go: (u: string) => void }) {
  const { bookmarks, history } = useStore(browserState);
  const [q, setQ] = useState('');
  return (
    <div className="browser-page start">
      <h2>Pyxis Browser</h2>
      <form
        className="start-search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) go(q);
        }}
      >
        <Icon.search size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search DuckDuckGo and Wikipedia" aria-label="Search the web" />
        <button className="btn primary small" type="submit">
          Search
        </button>
      </form>
      <section>
        <h3 className="section-title">Bookmarks</h3>
        <div className="bm-grid">
          {bookmarks.map((b) => (
            <button key={b.url} className="bm-tile" onClick={() => go(b.url)} title={b.url}>
              <strong className="truncate">{b.title}</strong>
              <span className="muted small truncate">{b.url}</span>
            </button>
          ))}
          {!bookmarks.length && <span className="muted">No bookmarks yet. Press Ctrl+D on a page to add one.</span>}
        </div>
      </section>
      {history.length > 0 && (
        <section>
          <h3 className="section-title">Recently visited</h3>
          <ul className="plain-list">
            {history.slice(0, 6).map((h, i) => (
              <li key={`${h.url}-${i}`}>
                <button className="linklike" onClick={() => go(h.url)}>
                  {h.title}
                </button>{' '}
                <span className="muted small">{timeAgo(h.time)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="muted small">
        <button className="linklike" onClick={() => go('pyxis://history')}>
          History
        </button>{' '}
        ·{' '}
        <button className="linklike" onClick={() => go('pyxis://bookmarks')}>
          Bookmarks
        </button>{' '}
        ·{' '}
        <button className="linklike" onClick={() => go('pyxis://about')}>
          How this browser works
        </button>
      </p>
    </div>
  );
}

function SearchPage({ q, go, nonce }: { q: string; go: (u: string) => void; nonce: number }) {
  const [res, setRes] = useState<SearchResponse | null>(null);
  useEffect(() => {
    if (!q) return;
    const ctrl = new AbortController();
    setRes(null);
    void search(q, ctrl.signal).then((r) => !ctrl.signal.aborted && setRes(r));
    return () => ctrl.abort();
  }, [q, nonce]);
  if (!q) return <StartPage go={go} />;
  return (
    <div className="browser-page results">
      <div className="row gap-2 results-head">
        <h2 className="truncate">Results for “{q}”</h2>
        <span className="toolbar-spacer" />
        <button className="btn small" onClick={() => openExternal(duckDuckGoUrl(q))}>
          Full DuckDuckGo results <Icon.external size={13} />
        </button>
      </div>
      <p className="muted small">
        Results from the DuckDuckGo Instant Answer API and Wikipedia search, requested directly by your browser. DuckDuckGo’s full results page refuses embedding, so it opens in a real tab.
      </p>
      {!res && (
        <div className="muted" role="status">
          <span className="spinner" /> Searching…
        </div>
      )}
      {res?.answer && (
        <article className="card answer">
          <div className="card-head">
            <strong>{res.answer.heading}</strong>
            <span className="muted small">via {res.answer.source} (DuckDuckGo Instant Answer)</span>
          </div>
          <p>{res.answer.text}</p>
          {res.answer.url && (
            <button className="linklike" onClick={() => go(res.answer!.url)}>
              {res.answer.url}
            </button>
          )}
        </article>
      )}
      {res && (
        <ol className="result-list">
          {res.results.map((r, i) => {
            const blocked = isFrameBlocked(r.url);
            return (
              <li key={`${r.url}-${i}`} className="result">
                <button className="result-title linklike" onClick={() => go(r.url)}>
                  {r.title}
                </button>
                <span className="result-url mono small">
                  {r.url} · {r.source}
                  {blocked && ' · opens in a new tab'}
                </span>
                <p>{r.snippet}</p>
              </li>
            );
          })}
        </ol>
      )}
      {res && !res.results.length && !res.answer && <EmptyState title="No instant results">Try “Full DuckDuckGo results” for the complete web search.</EmptyState>}
      {res?.errors.map((e) => (
        <div key={e} className="banner banner-warn small">
          {e}
        </div>
      ))}
    </div>
  );
}

function HistoryPage({ go }: { go: (u: string) => void }) {
  const { history } = useStore(browserState);
  const [filter, setFilter] = useState('');
  const shown = useMemo(() => history.filter((h) => !filter || h.title.toLowerCase().includes(filter.toLowerCase()) || h.url.toLowerCase().includes(filter.toLowerCase())), [history, filter]);
  return (
    <div className="browser-page">
      <div className="row gap-2">
        <h2>History</h2>
        <span className="toolbar-spacer" />
        <div className="search-field">
          <Icon.search size={14} />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter history" aria-label="Filter history" />
        </div>
        <button
          className="btn small danger"
          disabled={!history.length}
          onClick={async () => {
            if (await confirmDialog('Clear browsing history?', { message: `Removes ${history.length} entries stored by Pyxis Browser in this browser. Bookmarks and open tabs are kept. Your real browser's history is not affected.`, confirmLabel: 'Clear history', danger: true })) clearHistory();
          }}
        >
          Clear history
        </button>
      </div>
      <table className="table">
        <tbody>
          {shown.map((h, i) => (
            <tr key={`${h.url}-${h.time}-${i}`}>
              <td className="mono muted nowrap small">{new Date(h.time).toLocaleString()}</td>
              <td>
                <button className="linklike" onClick={() => go(h.url)}>
                  {h.title}
                </button>
                <div className="muted small truncate">{h.url}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!shown.length && <EmptyState title="No history">{history.length ? 'Nothing matches the filter.' : 'Pages you open here are listed.'}</EmptyState>}
    </div>
  );
}

function BookmarksPage({ go }: { go: (u: string) => void }) {
  const { bookmarks } = useStore(browserState);
  return (
    <div className="browser-page">
      <h2>Bookmarks</h2>
      <table className="table">
        <tbody>
          {bookmarks.map((b) => (
            <tr key={b.url}>
              <td>
                <button className="linklike" onClick={() => go(b.url)}>
                  {b.title}
                </button>
                <div className="muted small truncate">{b.url}</div>
              </td>
              <td className="right">
                <button className="btn small ghost" onClick={() => removeBookmark(b.url)} aria-label={`Remove bookmark ${b.title}`}>
                  <Icon.trash size={13} /> Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!bookmarks.length && <EmptyState title="No bookmarks">Use the bookmark button or Ctrl+D on any page.</EmptyState>}
    </div>
  );
}

function AboutBrowser({ go }: { go: (u: string) => void }) {
  return (
    <div className="browser-page prose">
      <h2>How Pyxis Browser works</h2>
      <p>
        Pyxis Browser is a PyxisOS-style shell around <strong>your own browser’s engine</strong>. It is not Firefox and not a separate browser engine; a static website cannot ship or embed one.
      </p>
      <dl className="kv">
        <dt>Pages</dt>
        <dd>
          Loaded by your browser in a sandboxed iframe <Badge kind="LIVE" />. Scripts run, but the page cannot navigate or script PyxisOS.
        </dd>
        <dt>Search</dt>
        <dd>
          DuckDuckGo Instant Answer API and Wikipedia search API, called directly from your browser (both allow cross-origin requests) <Badge kind="LIVE" />. DuckDuckGo is the search provider, not a browser engine.
        </dd>
        <dt>Blocked sites</dt>
        <dd>Sites that forbid embedding (X-Frame-Options / frame-ancestors) open in a new tab of your real browser. Known examples: {FRAME_BLOCKED_HOSTS.slice(0, 8).join(', ')}…</dd>
        <dt>Tabs, history, bookmarks</dt>
        <dd>Stored by PyxisOS-Web in this browser’s storage and restored when you reopen the app.</dd>
        <dt>Limitations</dt>
        <dd>Navigation inside an embedded page (clicking its links) is invisible to PyxisOS because of the same-origin policy, so back/forward cover addresses opened from PyxisOS. Cookies and logins inside frames follow your browser’s third-party cookie rules.</dd>
        <dt>Requirements</dt>
        <dd>
          The simulated <span className="mono">pyxis-netd</span> service must be running and Aegis must allow <span className="mono">network.navigate</span> for the browser.
        </dd>
      </dl>
      <button className="btn" onClick={() => go(HOME_URL)}>
        Back to start
      </button>
    </div>
  );
}
