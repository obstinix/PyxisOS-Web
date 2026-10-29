export const OS_NAME = 'PyxisOS';
export const BUILD_NAME = 'PyxisOS-Web';
export const CODENAME = 'LUNAR-PYXIS';
export const CHANNEL = 'BETA';
export const VERSION = '0.1.0';
export const BUILD_DATE = '2026-10-29';
export const REPO_URL = 'https://github.com/obstinix/PyxisOS-Web';
export const LICENSE = 'AGPL-3.0-only';

/**
 * Simulated kernel identity. The browser build does not run the Lunar Core
 * microkernel; these values describe the simulation layer and are labelled as
 * such wherever they are displayed.
 */
export const SIM_KERNEL = {
  name: 'lunar-core',
  release: '0.1.0-sim',
  arch: 'wasm-less/js',
  machine: 'browser-sim',
} as const;

/**
 * Verified metadata of the native PyxisOS project, taken from
 * https://github.com/obstinix/PyxisOS (README, VERSION and docs/architecture,
 * reviewed 2026-10-29). Shown as PROJECT data, distinct from this web build.
 */
export const PROJECT = {
  repo: 'https://github.com/obstinix/PyxisOS',
  license: 'Apache-2.0',
  version: '0.1.0',
  architecture: 'x86_64 — physical hardware target (reference: ThinkPad X1 Carbon 5th Gen)',
  kernel: 'Track B freestanding x86_64 kernel (C, Rust no_std, assembly); Lunar Core no_std microkernel crate is experimental',
  substrate: 'Track A runs on a Linux substrate with KDE Plasma 6 / Wayland',
  components: [
    { name: 'pyxis CLI and diagnostics', status: 'Working', path: 'cli/pyxis' },
    { name: 'Astral Consensus', status: 'In development', path: 'native/consensus/' },
    { name: 'Lunar Core', status: 'Experimental', path: 'native/lunar-core/' },
    { name: 'Aegis', status: 'Planned', path: 'native/aegis/' },
    { name: 'Celestial Automation', status: 'Planned', path: 'docs/PROJECT_VISION.md' },
  ],
} as const;
