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
