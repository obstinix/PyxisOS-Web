/**
 * Composition root for the system layer. Importing this module registers
 * every persisted store (so boot can load them) and the boot stages that
 * depend on higher-level modules.
 */
import { registerBootHook } from './system';
import { startEnabledServices } from './services';
import { startConfigMirror } from './config';
import { runDiagnostics } from './diagnostics';
import './userstate';
import './browser';
import './trash';
import './aegis';
import './intents';

registerBootHook({ id: 'services', label: 'Starting system services', run: async () => `sim:${startEnabledServices()}` });
registerBootHook({
  id: 'config',
  label: 'Publishing configuration',
  run: async () => {
    startConfigMirror();
    return 'Read-only mirrors in /system/config';
  },
});
registerBootHook({
  id: 'diagnostics',
  label: 'Running startup diagnostics',
  run: async () => {
    const r = await runDiagnostics();
    const s = `${r.summary.pass} passed, ${r.summary.warn} warnings, ${r.summary.fail} failed, ${r.summary.skip} skipped`;
    return r.summary.fail || r.summary.warn ? `warn:${s}` : s;
  },
});
