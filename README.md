# PyxisOS-Web

**Live demo:** https://obstinix.github.io/PyxisOS-Web/

**LUNAR-PYXIS // BETA · VERSION 0.1.0**

PyxisOS-Web is a browser-based **simulation** of the PyxisOS desktop environment. It demonstrates the PyxisOS desktop and makes the project's system concepts explorable in the browser, while the native operating system — the x86_64 kernel and the Lunar Core microkernel — is developed separately in [obstinix/PyxisOS](https://github.com/obstinix/PyxisOS).

It is not an emulator and it does not boot a kernel. Everything runs as a single-page web application. Windows, files, the terminal, settings, diagnostics and the browser are real, working features of this app; kernel, hardware, daemon and process behaviour is **simulated and labelled** in the interface.

## What is real and what is simulated

Every value and feature is labelled with one of these badges:

| Label | Meaning | Examples |
| --- | --- | --- |
| **LIVE** | Read from your browser, or a real operation of this web app | Uptime, logical CPUs, storage quota, battery (where exposed), files, windows, browser tabs |
| **PROJECT** | Verified metadata of the native PyxisOS project | Release, architecture, component status |
| **SIMULATED** | Behaviour modelled for the demo | Kernel label, services (`pyxis-netd`, `aegis-policyd`…), process resources, consensus rounds, Aegis policy |
| **UNAVAILABLE** | Not possible in a browser | Lunar Core kernel link, device access |

Simulated operations never touch your computer: stopping a "service" changes the demo's model, and the terminal never runs host commands.

## Features

### Desktop
| Feature | What works |
| --- | --- |
| Boot sequence | Real initialisation stages with timings (storage, settings, filesystem, user state, services, diagnostics); firmware handoff marked `[SIM]`; skip with Esc; replay from Settings or the Boot Lab. |
| Window manager | Open, close, drag, 8-edge resize, minimise/maximise, focus and stacking, edge and keyboard snapping, title-bar context menu, compact (phone) mode, per-window crash recovery. |
| Workspaces | Four virtual workspaces with independent arrangements; switch with Alt+1–4 or the top bar; move windows with Alt+Shift+1–4 or the window menu. Saved with the session. |
| Dock | Favourites (pin/unpin), running and active indicators, instance menus, tooltips, arrow-key navigation, bottom/left/right, auto-hide. |
| System tray & quick settings | Clock, storage, network (online state and connection type), battery (where the browser exposes it), notifications, quick toggles (theme, do-not-disturb, reduced motion, high contrast), notification sound, wallpaper, site storage. Unavailable readings are labelled. |
| Command palette | Ctrl+K: fuzzy search over allowlisted actions, apps and files; typed sentences are matched to actions ("open the process explorer"). |
| Launcher | Alt+Space: app grid with search, categories, favourites, recents and keyboard navigation. |
| Notification center | Read/unread, dismiss, filters, grouping by app, do-not-disturb; only real app events and results. |
| Wallpapers & Theme Studio | Seven wallpapers (including animated and time-of-day), accent colours, typeface, corner radius, density, window opacity, blur, light/dark — all applied through design tokens. |
| Context menus | Desktop, title bars, dock items, files, launcher apps — keyboard accessible (Shift+F10). |
| First-run setup & guided demo | Short, skippable onboarding and a 10-step walkthrough; both replayable. |

### Applications (22)
| App | Highlights |
| --- | --- |
| Files | Places, breadcrumbs, sorting, search (names and contents), create/rename/copy/move, **Trash with restore and undo**, previews, metadata, import/export. |
| Pyxis Terminal | `psh` with pipes, redirection, `;`/`&&`, history, Tab completion; 40+ commands including `sysinfo`, `doctor`, `services`, `ps`, `kill`, `journal`. |
| Text Editor | Tabs, line numbers, conflict detection, unsaved-change guards. |
| Configuration Editor | `settings.json`, `services.json`, `aegis-policy.json`: JSON highlighting, validation, save-and-apply, revert, change history with restore. Read-only mirrors in `/system/config`. |
| Pyxis Browser | Tabs, back/forward, reload, home, bookmarks, history, suggestions; search via DuckDuckGo and Wikipedia; pages in sandboxed frames. See [docs/BROWSER.md](docs/BROWSER.md). |
| System Doctor | Explainable diagnostics: what was checked, why, condition, evidence, severity, simulated or not, remediation (one click where safe), export or save to Documents. |
| System Monitor | Frame rate, event-loop lag, JS heap (LIVE where available) and labelled simulated load. |
| Process Explorer | Process tree (windows and tabs are real objects; daemons are modelled), search, sorting, details, end process. |
| Service Manager | Live subsystems (read-only) and simulated daemons with dependencies, start/stop/restart, enable at boot, failure injection, journal history. |
| System Journal | Searchable boot and system log with severity, component and actual/simulated filters, details, copy and export. |
| Event Correlation | Deterministic rules group related events into incidents with confidence, evidence and an explicit "correlation is not causation" note. |
| System Information | Project, build, runtime and browser data from central metadata, labelled by origin. |
| Architecture Explorer | Interactive map of PyxisOS components with native vs web status and links to related apps. |
| Kernel & Boot Lab | Step-through of the native x86_64 boot path from `docs/architecture/boot-flow.md`, with failure scenarios. |
| Astral Consensus Visualizer | TypeScript port of the PyxisOS deterministic arbitrator: agent votes, domain weighting, security veto, conflicts, escalation; demo scenarios and custom proposals. |
| Aegis Security Center | Per-app capability declarations, policy (allow/ask/deny), request simulator and audit log. |
| Astral Intelligence | Offline rule-based assistant: explains components and diagnostics, and proposes allowlisted actions that you approve. No AI model or network service. |
| Assistant Activity | What the assistant proposed, which capability each action needed, approvals, outcomes and permission history. |
| Self-Test & Recovery | 11 functional self-tests on isolated instances, plus targeted resets that explain what they remove. |
| Settings, System Center, About | Appearance, desktop, accessibility, shortcuts, notifications, privacy, storage, session and help. |

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+K` / `Ctrl+Shift+P` | Command palette |
| `Alt+Space` | Launcher |
| `Alt+1`…`Alt+4` / `Alt+Shift+1`…`4` | Switch workspace / move focused window |
| `Alt+T` / `Alt+E` / `Alt+,` | Terminal / Files / Settings |
| `Alt+W` / `Alt+M` / `` Alt+` `` | Close / minimise / cycle windows |
| `Alt+Shift+←/→/↑/↓` | Snap left / right, maximise, minimise |
| `Shift+F10` | Context menu for the focused window or dock item |
| Browser `Ctrl+L`, `Ctrl+R`, `Ctrl+D`, `Alt+←/→`, `Alt+N`, `Alt+Q` | Address bar, reload, bookmark, back/forward, new tab, close tab |

Browsers reserve some shortcuts (such as Ctrl+T and Ctrl+W), so PyxisOS uses Alt-based alternatives.

## Terminal commands

```
Files    ls cd pwd cat mkdir touch rm rmdir cp mv tree find stat
Text     echo grep head tail wc sort
Shell    help clear history env export exit
System   whoami hostname date uptime uname neofetch open edit (nano, vi)
PyxisOS  pyxis <--version|info|doctor|status|runtime|hardware|apps|open>
         sysinfo  doctor  services [start|stop|restart|enable|disable <id>]
         ps (processes)  kill <pid>  journal [-n N] [-p warn|error] [-u source]
```

`help` is generated from the command registry. Filesystem commands share the same virtual filesystem as Files and the editor. `rm` deletes permanently (Files uses the Trash).

## Natural-language commands

The assistant and command palette map sentences to a fixed allowlist of actions — for example "open the system monitor", "show me the boot warnings", "find configuration files", "change the wallpaper to lattice", "run the system doctor", "show active services", "stop pyxis-netd", "search the web for microkernels". Anything else is refused. Actions that need a capability wait for your approval; destructive ones always ask for confirmation. Every proposal and outcome is recorded in Assistant Activity.

## Persistence

| Data | Storage |
| --- | --- |
| Virtual filesystem, settings, window layout and workspaces | IndexedDB (localStorage or memory fallback) |
| Favourites, recents, onboarding, browser tabs/history/bookmarks, service config, Aegis policy and audit, assistant activity, config history, Trash index | Versioned records `{ v, data }` in the same store |

Records are validated on load. Invalid or newer-schema records fall back to defaults while the original is kept under `<key>.backup`; the boot log and System Doctor report it. Saving is disabled until boot has finished loading, so hiding the tab during boot cannot overwrite data. Export and import a full profile from Settings.

## Architecture

```
src/
  core/        framework-free system layer (unit tested)
    store.ts, persisted.ts     observable stores; versioned persisted state
    system.ts, modules.ts      runtime and boot stages; composition root
    vfs.ts, path.ts, trash.ts  virtual filesystem and Trash
    windows.ts                 window manager and workspaces
    apps.ts, capabilities.ts   app registry with declared capabilities
    actions.ts, intents.ts     allowlisted actions; natural-language intents
    aegis.ts                   capability broker and audit log
    services.ts, processes.ts  service model and process table
    diagnostics.ts, selftest.ts, correlation.ts
    config.ts, browser.ts, consensus.ts, settings.ts, notifications.ts, events.ts
  terminal/    psh parser, sessions and commands
  shell/       desktop, window chrome, dock, launcher, palette, tray, onboarding
  apps/        application UIs registered in apps/index.tsx
  styles/      design tokens, base controls, shell, apps, feature styles
tests/         Vitest unit and Testing Library integration tests
docs/          BROWSER.md (browser decision), RECOVERY.md
```

All apps read the same stores. A file created in Files appears in the terminal's `ls`; a service stopped in the terminal shows in the Service Manager, the Process Explorer, the Doctor and the journal; the palette, launcher, dock and assistant all launch apps through the same window manager.

## Getting started

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit + integration tests
npm run typecheck
npm run build      # production build into dist/
npm run preview    # serve the production build
```

The build is static (relative asset paths). The `CI` workflow runs typecheck, tests and build on every push and pull request and deploys `main` to GitHub Pages (Settings → Pages → Source: GitHub Actions).

Supported browsers: current Chrome, Edge, Firefox and Safari. The JS heap metric and battery status are only available in Chromium-based browsers.

## Security and privacy

- No analytics, tracking or telemetry. The only network requests are those Pyxis Browser makes when you search or open a page (DuckDuckGo Instant Answer API, Wikipedia API and the sites you open).
- No `eval` or dynamic code execution; user content is rendered as text.
- The terminal and assistant cannot run host commands; actions come from an allowlist.
- Paths are normalised so `..` cannot escape the virtual root; `/system` is read-only.
- Browser frames are sandboxed without top-navigation; non-http(s) URLs and PyxisOS-Web's own origin are refused.
- Aegis checks are application-level controls inside this page — not kernel isolation and not a replacement for browser or OS security.

## Known limitations

- The Lunar Core kernel is not booted; nothing runs on bare metal.
- Files live in this browser profile's storage, not on your disk. Clearing site data erases them; export a backup first.
- Only text files are supported (1 MiB per file, 25 MiB total).
- Pyxis Browser cannot embed sites that forbid framing, and cannot see navigation inside embedded pages ([details](docs/BROWSER.md)).
- Process resources and simulated service states are models, not measurements.
- Astral Intelligence is deterministic and rule-based, not a language model.

## Recovery

See [docs/RECOVERY.md](docs/RECOVERY.md) for in-app resets and for returning the source to its pre-expansion state.

## Licensing and attribution

PyxisOS-Web is licensed under the **GNU Affero General Public License v3.0** (see [LICENSE](LICENSE)). If you host a modified version for others over a network, the AGPL requires you to offer them the corresponding source.

The desktop concept is inspired by [NautilusOS](https://github.com/nautilus-os/NautilusOS) (AGPL-3.0); no NautilusOS code is included. The consensus port and boot-path content derive from [obstinix/PyxisOS](https://github.com/obstinix/PyxisOS) (Apache-2.0). See [NOTICE.md](NOTICE.md) for provenance and third-party licences.

## Project status

Current progress, the feature-by-feature status and test results are in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).
