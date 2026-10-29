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

## Third-party components

| Component | Use | License |
| --- | --- | --- |
| React, React DOM | UI runtime (bundled) | MIT |
| IBM Plex Sans, IBM Plex Mono via `@fontsource` | Typefaces (bundled) | SIL Open Font License 1.1 |
| Vite, @vitejs/plugin-react, TypeScript | Build tooling (not shipped) | MIT / Apache-2.0 |
| Vitest, jsdom, Testing Library, fake-indexeddb | Test tooling (not shipped) | MIT / Apache-2.0 |

All icons, wallpapers and the Lunar-Pyxis mark are original SVG/CSS created for this project.
