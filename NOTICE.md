# Notices and provenance

## PyxisOS-Web

Copyright (C) 2026 obstinix and PyxisOS-Web contributors.
Licensed under the GNU Affero General Public License v3.0 only (`AGPL-3.0-only`). See `LICENSE`.

## Relationship to NautilusOS

The idea of a browser-based desktop with boot, login, windows, dock and terminal was inspired by
[NautilusOS](https://github.com/nautilus-os/NautilusOS), which is licensed under AGPL-3.0.

The NautilusOS source (`index.html`, `style.css`, `js/main.js`, themes and assets) was reviewed before
implementation. It was not reused because:

- it is a single ~18,000-line script with global state and no build or test tooling;
- its terminal writes user input into the page with `innerHTML` (an HTML-injection risk) and returns
  hard-coded output rather than operating on a filesystem;
- much of its functionality (web proxies, tab cloaking, an app store fetching remote code) is outside the
  scope of a PyxisOS demonstration.

PyxisOS-Web is therefore an independent implementation written for this project. It contains no
NautilusOS code, styles, images or fonts. Because both projects use the AGPL-3.0, this attribution is kept
for transparency; should any NautilusOS-derived code be added in the future, its copyright notices must be
preserved and recorded here.

## Material derived from the PyxisOS project

PyxisOS-Web describes and models the native PyxisOS project
([obstinix/PyxisOS](https://github.com/obstinix/PyxisOS), Apache License 2.0,
Copyright 2026 The PyxisOS Authors). The following parts are derived from it
(reviewed 2026-10-29); Apache-2.0 material may be included in an AGPL-3.0 work.

| PyxisOS-Web file | Derived from | Nature |
| --- | --- | --- |
| `src/core/consensus.ts` | `native/consensus/src/deterministic.rs`, `types.rs` | TypeScript port of the deterministic arbitrator (agent rules, weighting, outcomes) |
| `src/apps/BootLab.tsx` | `docs/architecture/boot-flow.md` | Summary of the documented x86_64 boot stages |
| `src/apps/Aegis.tsx`, `src/apps/Architecture.tsx`, `src/core/version.ts` (`PROJECT`) | `README.md`, `native/aegis/`, `docs/architecture/` | Factual descriptions of components and their status |

No PyxisOS source is executed by this web build.

## Third-party components

| Component | Use | License |
| --- | --- | --- |
| React, React DOM | UI runtime (bundled) | MIT |
| IBM Plex Sans, IBM Plex Mono via `@fontsource` | Typefaces (bundled) | SIL Open Font License 1.1 |
| Vite, @vitejs/plugin-react, TypeScript | Build tooling (not shipped) | MIT / Apache-2.0 |
| Vitest, jsdom, Testing Library, fake-indexeddb | Test tooling (not shipped) | MIT / Apache-2.0 |

## External services (Pyxis Browser only)

Pyxis Browser asks your browser to contact these services only when you search or open a page:
the DuckDuckGo Instant Answer API (`api.duckduckgo.com`), the Wikipedia API
(`en.wikipedia.org/w/api.php`) and whatever sites you open. Their terms and privacy policies apply.
Nothing else in PyxisOS-Web makes network requests.

All icons, wallpapers and the Lunar-Pyxis mark are original SVG/CSS created for this project.
