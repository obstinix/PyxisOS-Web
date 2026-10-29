# Implementation status

_Last updated: 2026-10-29_

## Current state

**0.1.0 beta, expanded to 36 features.** All work is on `main`. The pre-expansion state is commit `bc2eb78` (see [docs/RECOVERY.md](docs/RECOVERY.md)); a verified local backup with a git bundle and SHA-256 manifest was made before any change.

## Baseline before the expansion (commit `bc2eb78`)

| Check | Result |
| --- | --- |
| `npm test` | 4 files, 72 tests passed |
| `npm run typecheck` | passed |
| `npm run build` | passed (JS ≈ 302 kB, 96 kB gzip) |
| Deployment | https://obstinix.github.io/PyxisOS-Web/ live (run 40851534192) |

## Feature status

Statuses: **Complete and verified** = implemented, covered by automated tests and/or exercised in a real browser (Chromium); **Existing and verified** = present before, re-checked; **Implemented, partially verified** = works, but some paths were not exercised in a browser.

| # | Feature | Status | Main files | Verification | Limitations |
| --- | --- | --- | --- | --- | --- |
| 1 | Boot sequence | Implemented, partially verified | `core/system.ts`, `core/modules.ts`, `shell/Session.tsx` | Stages, timings, `[SIM]` label and skip checked in browser; replay flag not exercised in a browser | Firmware stage is narrative (labelled) |
| 2 | Window manager | Existing and verified (extended) | `core/windows.ts`, `shell/Window.tsx` | Unit + UI tests; title-bar menu and workspace moves checked in browser | — |
| 3 | Dock | Complete and verified | `shell/Desktop.tsx`, `core/userstate.ts` | Pin from launcher checked in browser; favourites persisted | — |
| 4 | System tray & quick settings | Complete and verified | `shell/Tray.tsx` | Live network type, battery, site storage, DND toggle checked in browser | Battery/connection type only where the browser exposes them (labelled) |
| 5 | Command palette | Complete and verified | `shell/Palette.tsx`, `core/actions.ts`, `core/fuzzy.ts` | UI test; sentence → action in browser | Only allowlisted actions |
| 6 | File Explorer | Complete and verified | `apps/Files.tsx`, `core/trash.ts` | Trash, Undo, restore-from-Trash in browser; unit tests | Text files only; `rm` in the terminal is permanent |
| 7 | Terminal | Complete and verified | `terminal/commands.ts` | Unit tests for new commands; `ls`, `services` in browser | Built-in commands only, never host commands |
| 8 | System Settings | Complete and verified | `apps/Settings.tsx` | 9 sections rendered; theme changes applied in browser | — |
| 9 | System Monitor | Existing and verified | `apps/Monitor.tsx` | Opened via assistant in browser; unchanged | Simulated load labelled |
| 10 | Application launcher | Complete and verified | `shell/Launcher.tsx` | UI test; grid, categories, recents in browser | — |
| 11 | System Doctor | Complete and verified | `apps/Doctor.tsx`, `core/diagnostics.ts` | Failure → explanation → one-click recovery → re-run in browser | Tests the web demo only |
| 12 | Astral Consensus Visualizer | Complete and verified | `apps/Consensus.tsx`, `core/consensus.ts` | Port reproduces all outcome types (unit test); playback in browser | Demo proposals; not connected to PyxisOS |
| 13 | Aegis Security Center | Complete and verified | `apps/Aegis.tsx`, `core/aegis.ts` | Unit tests for every decision basis; fail-closed browser denial in browser | Application-level, not kernel isolation |
| 14 | Lunar Core Architecture Explorer | Existing and verified (content updated) | `apps/Architecture.tsx` | Rendered in tour; content updated from obstinix/PyxisOS docs | — |
| 15 | System Information Center | Complete and verified | `apps/SysInfo.tsx`, `core/version.ts` | Rendered in browser; values sourced from central metadata | — |
| 16 | Workspaces | Complete and verified | `core/windows.ts`, `shell/Tray.tsx` | Unit + UI tests; Alt+1–4 and persistence in browser | 4 fixed workspaces |
| 17 | Notification Center | Complete and verified | `core/notifications.ts`, `shell/Desktop.tsx` | Grouping, read toggle, filters, DND in browser | — |
| 18 | Wallpaper engine | Implemented, partially verified | `core/settings.ts`, `styles/features.css` | Static wallpaper change verified; animated and time-of-day wallpapers not visually reviewed | — |
| 19 | Theme Customization Studio | Complete and verified | `core/settings.ts`, `apps/Settings.tsx` | Radius/opacity tokens applied in browser; self-test | — |
| 20 | Context menus | Complete and verified | `shell/ui.tsx` and apps | Desktop, title bar, dock, files, launcher menus in browser | — |
| 21 | Boot log viewer (System Journal) | Complete and verified | `apps/Misc.tsx` (`EventsApp`), `core/events.ts` | Boot filter opened by tour; terminal `journal` tested | Session journal keeps the latest 500 events |
| 22 | Service Manager | Complete and verified | `apps/Services.tsx`, `core/services.ts` | Dependency rules unit-tested; failure injection in browser | Simulated daemons only |
| 23 | Process Explorer | Implemented, partially verified | `apps/Processes.tsx`, `core/processes.ts` | Tree and end-process unit-tested; app rendered in browser; End button not clicked in a browser | Resource figures are simulated |
| 24 | Configuration Editor | Complete and verified | `apps/Config.tsx`, `core/config.ts` | Invalid value blocked, save/apply, history, persisted across reload in browser | Three configuration files |
| 25 | Kernel & Boot Lab | Complete and verified | `apps/BootLab.tsx` | Playback and Long Mode failure scenario in browser | Educational model |
| 26 | Pyxis System Assistant | Complete and verified | `core/astral.ts`, `apps/Astral.tsx` | Unit tests; command, approval and refusal in browser | Rule-based, offline |
| 27 | Natural-language commands | Complete and verified | `core/intents.ts` | 10 phrase tests incl. refusals; palette and assistant in browser | Fixed patterns |
| 28 | Explainable diagnostics | Complete and verified | `core/diagnostics.ts` | Every check has what/why/condition/remediation (self-test asserts it) | — |
| 29 | Event correlation | Complete and verified | `core/correlation.ts`, `apps/Correlation.tsx` | Cascade (high) and fail-closed rules unit-tested; incident shown in browser | Correlation, not causation (stated in UI) |
| 30 | AI activity & permissions dashboard | Complete and verified | `apps/Activity.tsx`, `core/intents.ts` | Proposed/completed records and Aegis decisions in browser | — |
| 31 | Persistent user state | Complete and verified | `core/persisted.ts`, `core/system.ts` | Round-trip, corruption backup and mid-boot save tests; production reload restored tabs, bookmarks, onboarding and layout | See "Known issues" for the dev server |
| 32 | First-run setup | Complete and verified | `shell/Guide.tsx` | Steps, skip and persistence in browser | — |
| 33 | Guided demo | Complete and verified | `shell/Guide.tsx` | All 10 steps opened the right apps in browser | — |
| 34 | Accessibility | Implemented, partially verified | `shell/ui.tsx`, `styles/features.css`, all apps | Focus trap and restore, labelled controls, keyboard menus, reduced motion, high contrast, no overflow at 375 px | No screen-reader session or automated contrast audit was run |
| 35 | Self-Test & Recovery Center | Implemented, partially verified | `apps/SelfTest.tsx`, `core/selftest.ts` | 11/11 self-tests pass in Chromium; reset paths unit-tested at runtime level | Reset buttons not clicked in a browser |
| 36 | Pyxis Browser | Implemented to the feasible level, verified | `apps/Browser.tsx`, `core/browser.ts` | Live Wikipedia suggestions and results, embedded Wikipedia page, tabs, bookmark and restore after reload, fail-closed denial — all in browser | Frame-blocking sites open in a real tab; in-frame navigation is invisible ([docs/BROWSER.md](docs/BROWSER.md)) |

## Tests (2026-10-29)

| Check | Result |
| --- | --- |
| `npm test` | 5 files, **95 tests passed** |
| `npm run typecheck` | passed |
| `npm run build` | passed (JS ≈ 496 kB, 155 kB gzip) |
| Lint | No linter is configured in this project (TypeScript strict mode is the static check) |
| In-app self-test (Chromium, production build) | 11/11 passed |
| Browser console (production build) | no errors |

## Known issues and limitations

- **Dev server only:** after editing a core module, Vite's HMR can leave two instances of a module (one imported with a `?t=` stamp), so state changed in the UI may not be what the runtime saves until the dev server restarts. Production builds have a single instance; persistence was verified on `npm run preview`.
- DuckDuckGo Instant Answers return nothing for many queries; full results open in a real tab.
- Earlier versions could overwrite saved data if the tab was hidden during boot; fixed in `2c436de` with regression tests.
- See README → "Known limitations" for simulation boundaries.

## Resume development

```bash
git clone https://github.com/obstinix/PyxisOS-Web.git
cd PyxisOS-Web
git config user.name obstinix
git config user.email 139326479+obstinix@users.noreply.github.com
npm install
npm test && npm run typecheck && npm run build
npm run dev
```

Before continuing, read this file, run `git status` and `git log --oneline -10`.
