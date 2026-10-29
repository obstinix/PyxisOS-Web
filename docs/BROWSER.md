# Pyxis Browser — architecture decision

_Decided 2026-10-29. Applies to the static GitHub Pages deployment._

## Decision

Pyxis Browser is a **browser shell around the host browser's own engine** (option B in the brief):

- Web pages load in a **sandboxed `<iframe>`** rendered by the user's browser.
- **Search** calls two public APIs that allow cross-origin requests: the **DuckDuckGo Instant Answer API** and the **Wikipedia search API**. Suggestions come from Wikipedia OpenSearch plus local history and bookmarks.
- Sites that refuse embedding open in a **real browser tab** (`window.open` with `noopener,noreferrer`), and the app says so instead of showing a broken frame.

It is not Firefox, not a separate engine and not a proxy. DuckDuckGo is the search provider, not a browser engine.

## Options considered

| Option | Verdict | Why |
| --- | --- | --- |
| A. Embedded Firefox | Rejected | A static website cannot ship or embed a browser engine. It would need a native wrapper (Electron/Tauri/GeckoView), which would replace the GitHub Pages deployment and require installation. An external hand-off already exists ("Open in new tab"). |
| B. Shell + DuckDuckGo/Wikipedia + iframes | **Chosen** | Works on GitHub Pages with no backend, no secrets and no cost. Real pages and real search results. |
| C. Server-side proxy / remote engine | Rejected | Needs a paid backend and creates SSRF and abuse risk; stripping frame-blocking headers would defeat site security. Out of scope for a static site. |

## Measured constraints (2026-10-29)

Checked with response headers (`curl -I`):

| Target | Result |
| --- | --- |
| `duckduckgo.com`, `html.duckduckgo.com`, `lite.duckduckgo.com` | `X-Frame-Options: SAMEORIGIN` — cannot be embedded |
| `api.duckduckgo.com` (Instant Answers) | `Access-Control-Allow-Origin: *` — usable from the page |
| `duckduckgo.com/ac` (autocomplete) | no CORS header — not usable |
| `en.wikipedia.org/wiki/*`, `www.wikipedia.org`, `example.com` | no frame restriction — embeddable |
| `en.wikipedia.org/w/api.php?origin=*` | CORS allowed — search and suggestions |
| GitHub, Google, YouTube, X, Reddit, Stack Overflow, MDN, Hacker News, Bing, OpenStreetMap | `X-Frame-Options` / `frame-ancestors` — cannot be embedded |

The Instant Answer API returns an empty, unreadable body for queries it has no answer for; the browser reports that as a network error, so the app shows "no instant answer" and offers the full DuckDuckGo results in a real tab.

## What works where

| Capability | Where it happens |
| --- | --- |
| Search results (DuckDuckGo instant answers + Wikipedia results) | In the app |
| Opening embeddable pages (Wikipedia, many documentation and personal sites) | In the app, sandboxed iframe |
| Opening frame-blocking sites | Real browser tab |
| Full DuckDuckGo results page | Real browser tab |
| Tabs (up to 12), per-tab back/forward, reload, home, bookmarks, history, suggestions | In the app; persisted in IndexedDB |

## Limitations

- **Cross-origin navigation is invisible.** When you click a link inside an embedded page, the frame navigates but PyxisOS cannot read the new address (same-origin policy). The address bar and back/forward reflect addresses opened from PyxisOS.
- **Frame blocking cannot always be detected.** Known blocking hosts are listed in `src/core/browser.ts`; for others, a slow-load hint and an "Open in new tab" link are shown.
- Cookies and logins inside frames follow the browser's third-party cookie rules.

## Security

- Only `http:` and `https:` are accepted; `javascript:`, `data:`, `file:`, `blob:`, `about:` and URLs containing credentials are rejected.
- PyxisOS-Web's own origin cannot be framed, so an embedded page can never be same-origin with the desktop.
- `sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"` — no `allow-top-navigation`, so pages cannot navigate or script the desktop.
- Every page load asks the Aegis broker for `network.navigate` (recorded in the audit log) and requires the simulated `pyxis-netd` service. Neither affects your real network.
- No proxy, no API keys, no server.

## Deployment

The GitHub Pages deployment is unchanged: no backend, build step or hosting change was needed.
