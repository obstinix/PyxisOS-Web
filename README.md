# PyxisOS-Web

**LUNAR-PYXIS // BETA · VERSION 0.1.0**

PyxisOS-Web is a browser-based **simulation** of the PyxisOS desktop environment. It demonstrates the PyxisOS desktop experience and exposes its system concepts through a working browser environment while the native operating system — including the Lunar Core microkernel — continues development separately.

It is not an emulator and it does not boot a kernel. Everything runs as a single-page web application: windows, files, the terminal and diagnostics are real, working browser-side features, and anything that is simulated is labelled as such in the interface.

## Features

| Area | What works |
| --- | --- |
| **Boot & session** | Boot sequence driven by real initialisation stages (storage, settings, filesystem mount, app registry) with measured timings; local demonstration profile; lock, sign out, restart and shut down; recovery screens if startup or the shell fails. |
| **Desktop shell** | Top bar (launcher, focused app, storage and network status, notifications, clock, session menu), dock with running indicators and per-app menus (bottom/left/right, optional auto-hide), desktop icons for `~/Desktop`, desktop context menu, toasts and notification history. |
| **Window manager** | Open, close, focus, stacking, minimise, maximise/restore, drag, 8-edge resize, edge snapping, keyboard snapping, viewport clamping, multiple instances, session restore of window layout. |
| **Pyxis Terminal** | `psh` shell with quoting, `$VAR` expansion, pipes, `>`/`>>` redirection, `;` and `&&`, history (↑/↓), Tab completion, Ctrl+L / Ctrl+C / Ctrl+U, independent sessions per window. 35+ commands (below). |
| **Virtual filesystem** | Home, Documents, Projects, Downloads, Desktop, read-only `/system`, `/tmp`. Create, rename, copy, move, delete, search (name and content), size quota, path validation. Persisted in IndexedDB with localStorage/memory fallbacks. Shared live by all apps. |
| **Files** | Places sidebar, back/forward/up, breadcrumbs, search, multi-select, clipboard (copy/cut/paste), duplicate, rename, delete with confirmation, text preview, import from and export to your device. |
| **Text Editor** | Tabs, line numbers, cursor position, unsaved indicators, Save / Save as, Ctrl+S, read-only system files, conflict detection when a file is changed elsewhere, close guards for unsaved work. |
| **System Center** | Identity, uptime, registry, filesystem and persistence tiles, diagnostics, services, recent events, architecture summary, known limitations and tool shortcuts. |
| **System Monitor** | Frame rate, event-loop lag and JS heap (LIVE where the browser exposes them), simulated scheduler load (labelled SIMULATED), running tasks with end-task, event sources, browser environment details. |
| **Settings** | Dark/light theme, accent colours, wallpapers, display scale, motion preference, dock position and auto-hide, clock format, notifications, display name, session restore, profile export/import, restore defaults, erase all data. |
| **Architecture Explorer** | Interactive layered map of Lunar Core, system services, Pyxis CLI, desktop, Astral Intelligence, Astral Consensus Engine and Aegis integration, each labelled implemented / simulated / unavailable / planned. |
| **Astral Intelligence** | Local, rule-based assistant that explains real diagnostic results, summarises status and recommends actions. It shows which rule produced each answer. No AI model or network request is used. |
| **Event Journal** | Filterable, exportable journal of system events recorded during the session. |

### Terminal commands

```
Files    ls cd pwd cat mkdir touch rm rmdir cp mv tree find stat
Text     echo grep head tail wc sort
Shell    help clear history env export exit
System   whoami hostname date uptime uname neofetch open edit (nano, vi)
PyxisOS  pyxis --version | info | doctor | status | runtime | hardware | apps | open <id>
```

`help` is generated from the command registry, so it always matches what is implemented. `pyxis doctor` runs the same in-browser checks as System Center and never reports a check that was not executed.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Alt+Space` or `Ctrl+K` | Launcher (apps and files) |
| `Alt+T` / `Alt+E` / `Alt+,` | Terminal / Files / Settings |
| `Alt+W` / `Alt+M` | Close / minimise focused window |
| `` Alt+` `` | Cycle windows |
| `Alt+Shift+←/→/↑/↓` | Snap left / right, maximise, minimise |

## Simulation vs. native capabilities

| Shown in PyxisOS-Web | Source |
| --- | --- |
| Uptime, frame rate, event-loop lag, JS heap, logical CPU count, approximate device memory, storage quota | **LIVE** — read from browser APIs. Values a browser does not expose are shown as **UNAVAILABLE**. |
| Kernel name and release (`lunar-core 0.1.0-sim`), machine type, scheduler load | **SIMULATED** — labels and figures produced by the simulation, not host measurements. |
| Lunar Core kernel link, physical device access | **UNAVAILABLE** in a browser build. |
| Astral Consensus Engine, Aegis integration | **PLANNED / NOT IMPLEMENTED** — documented in the Architecture Explorer only. |

Known limitations:

- The Lunar Core microkernel is not booted; nothing runs on bare metal.
- Files live in browser storage for this site and browser profile — not on the host filesystem. Clearing site data erases them (use Settings → Session & data → Export to back up).
- The terminal executes only built-in `psh` commands. It never runs host shell commands and has no network access.
- Only text files are supported (1 MiB per file, 25 MiB virtual disk).
- Astral Intelligence is deterministic and rule-based, not a language model.

## Architecture

```
src/
  core/          framework-free system layer (unit tested)
    store.ts         observable stores shared by all apps
    path.ts, vfs.ts  path normalisation and the virtual filesystem
    persistence.ts   IndexedDB / localStorage / memory backends
    system.ts        runtime: boot stages, autosave, session lifecycle
    windows.ts       window manager state
    apps.ts          application registry metadata and search
    settings.ts      validated preferences applied as CSS tokens
    diagnostics.ts   executable health checks
    metrics.ts       on-demand browser metrics sampler
    services.ts      service status model
    events.ts, notifications.ts, astral.ts, version.ts
  terminal/      psh parser, shell sessions and command registry
  shell/         desktop shell UI: boot/login, desktop, window chrome, launcher, menus, dialogs, icons
  apps/          application UIs, registered in apps/index.tsx
  styles/        design tokens, base controls, shell and app styles
tests/           Vitest unit and React Testing Library integration tests
```

Every application reads the same stores, so a file created in the terminal appears immediately in Files and in an open editor tab, and the System Center reflects the window manager and persistence state as it changes. The metrics sampler runs only while a monitor view is open.

## Getting started

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # type-check and production build into dist/
npm run preview    # serve the production build
npm test           # unit + integration tests
npm run typecheck
```

The production build is static (relative asset paths), so `dist/` can be hosted on any static file host, including GitHub Pages. After the first load the desktop works offline; fonts are bundled locally and the app makes no network requests.

Supported browsers: current Chrome, Edge, Firefox and Safari. The JS heap metric is only available in Chromium-based browsers.

## Security and privacy

- No analytics, tracking, telemetry or third-party requests.
- No `eval`/dynamic code execution; user content is rendered as text (never as HTML).
- Filesystem paths are normalised so `..` cannot escape the virtual root; `/system` and core home directories are protected; names are validated.
- Persisted data (settings, filesystem snapshots, profile imports) is validated before use, and corrupted data is replaced with defaults instead of crashing the boot.

## Licensing and attribution

PyxisOS-Web is licensed under the **GNU Affero General Public License v3.0** (see [LICENSE](LICENSE)). If you host a modified version for others to use over a network, the AGPL requires you to offer those users the corresponding source code.

The desktop concept is inspired by [NautilusOS](https://github.com/nautilus-os/NautilusOS) (also AGPL-3.0). PyxisOS-Web is an independent implementation: no NautilusOS source code, styles or assets are included. See [NOTICE.md](NOTICE.md) for provenance and third-party licences (React, Vite and IBM Plex fonts under the SIL Open Font License 1.1).

## Project status

Release **0.1.0 beta**. Current progress, test results and resume instructions are tracked in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).
