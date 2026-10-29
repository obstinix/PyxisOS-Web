# Implementation status

_Last updated: 2026-10-29_

## Current state

**Release candidate 0.1.0 (beta).** The desktop, all core applications, persistence and diagnostics are implemented, tested and pushed to `main`. Latest verified implementation commit before this update: `54bce3c`.

## Completed

- Project toolchain: Vite 7, React 18, TypeScript 5.9 (strict), Vitest 4 with jsdom and fake-indexeddb
- Core: observable stores, event journal, notifications, IndexedDB/localStorage/memory persistence, path utilities, virtual filesystem (permissions, quota, validation, search, snapshots)
- Runtime: real boot stages with timings and failure recovery, autosave with error reporting, session restore, lock / sign out / restart / shutdown / factory reset
- Window manager: focus, stacking, minimise/maximise, drag, 8-edge resize, edge and keyboard snapping, viewport clamping, close guards, compact (phone-width) mode
- Desktop shell: boot/login/shutdown screens, top bar, dock (bottom/left/right, auto-hide), launcher with app and file search, desktop icons, context menus, dialogs, toasts, notification panel, keyboard shortcuts, root and per-window error boundaries
- Apps: Pyxis Terminal (psh, 35+ commands, pipes/redirection, completion, history), Files, Text Editor, System Center, System Monitor, Settings, Architecture Explorer, Astral Intelligence (rule-based), Event Journal, About
- Documentation: README, NOTICE (provenance and third-party licences)
- CI: GitHub Actions workflow running typecheck, tests and build on push/PR, with GitHub Pages deployment of `main`
- Live deployment: https://obstinix.github.io/PyxisOS-Web/ (first successful deploy: run 40851314287; earlier deploy failures happened before Pages was enabled)

## Tests (last run 2026-10-29)

| Check | Result |
| --- | --- |
| `npm test` | 4 files, **72 tests passed** |
| `npm run typecheck` | passed |
| `npm run build` | passed (JS ≈ 302 kB, 96 kB gzip) |
| `npm audit` | 0 vulnerabilities |

Manual browser verification (Chromium, 1366×800 and 375×812): boot → login → desktop; terminal `help`, `pyxis info`, `pyxis doctor`, `mkdir`, `echo >`, `cat`, `ls -l`; open file in editor, edit, Ctrl+S, read back from terminal; file manager shows terminal changes and preview; drag and resize by pointer; maximise/restore/minimise and dock toggling; reload keeps files, window layout and settings (theme, dock position); phone width presents maximised windows with no horizontal overflow.

## Known defects / limitations

- No end-to-end browser test suite in CI yet (integration tests run in jsdom; manual browser checks listed above).
- Editor is a plain textarea (no syntax highlighting or undo history beyond the browser's own).
- Only text files are supported in the virtual filesystem.
- See README → "Simulation vs. native capabilities" for intentional simulation boundaries.

## Possible next steps

1. Add Playwright end-to-end tests for drag/resize and persistence in real browsers.
2. Drag-and-drop between Files windows and onto the desktop.
3. Additional utilities (e.g. image viewer for imported images) if they fit the demo.

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
