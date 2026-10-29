/**
 * Aegis capability names. These describe application-level permissions inside
 * PyxisOS-Web. They are enforced by the demo's own code paths, not by the
 * browser or an operating-system kernel.
 */
export type Capability =
  | 'fs.read'
  | 'fs.write'
  | 'fs.delete'
  | 'settings.write'
  | 'services.control'
  | 'process.control'
  | 'network.navigate'
  | 'notifications.post'
  | 'diagnostics.run'
  | 'system.reset';

export const CAPABILITIES: Record<Capability, { label: string; risk: 'low' | 'medium' | 'high'; description: string }> = {
  'fs.read': { label: 'Read files', risk: 'low', description: 'Read files and directories in the virtual filesystem.' },
  'fs.write': { label: 'Write files', risk: 'medium', description: 'Create or modify files in the virtual filesystem.' },
  'fs.delete': { label: 'Delete files', risk: 'high', description: 'Move files to the Trash or delete them permanently.' },
  'settings.write': { label: 'Change settings', risk: 'medium', description: 'Change desktop preferences such as theme and wallpaper.' },
  'services.control': { label: 'Control services', risk: 'medium', description: 'Start, stop and reconfigure simulated system services.' },
  'process.control': { label: 'Control processes', risk: 'medium', description: 'End demo processes (closing app windows or stopping simulated tasks).' },
  'network.navigate': { label: 'Load web pages', risk: 'medium', description: 'Ask your browser to load third-party web pages and search APIs.' },
  'notifications.post': { label: 'Post notifications', risk: 'low', description: 'Show desktop notifications.' },
  'diagnostics.run': { label: 'Run diagnostics', risk: 'low', description: 'Execute the in-browser health checks.' },
  'system.reset': { label: 'Reset data', risk: 'high', description: 'Erase stored PyxisOS data in this browser.' },
};

export const ALL_CAPABILITIES = Object.keys(CAPABILITIES) as Capability[];
