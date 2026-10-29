import { ComponentType } from 'react';
import { AppId } from '../core/apps';
import { setComponentRegistryProbe } from '../core/diagnostics';
import { AppProps } from './types';
import { TerminalApp } from './Terminal';
import { FilesApp } from './Files';
import { EditorApp } from './Editor';
import { SystemCenterApp } from './SystemCenter';
import { MonitorApp } from './Monitor';
import { SettingsApp } from './Settings';
import { ArchitectureApp } from './Architecture';
import { AstralApp } from './Astral';
import { AboutApp, EventsApp } from './Misc';

/** UI component for each registered application. */
export const APP_COMPONENTS: Record<AppId, ComponentType<AppProps>> = {
  'system-center': SystemCenterApp,
  terminal: TerminalApp,
  files: FilesApp,
  editor: EditorApp,
  monitor: MonitorApp,
  settings: SettingsApp,
  architecture: ArchitectureApp,
  astral: AstralApp,
  events: EventsApp,
  about: AboutApp,
};

setComponentRegistryProbe(() => Object.keys(APP_COMPONENTS));
