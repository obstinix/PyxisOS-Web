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
import { BrowserApp } from './Browser';
import { DoctorApp } from './Doctor';
import { ServicesApp } from './Services';
import { ProcessesApp } from './Processes';
import { ConfigApp } from './Config';
import { SysInfoApp } from './SysInfo';
import { ConsensusApp } from './Consensus';
import { AegisApp } from './Aegis';
import { BootLabApp } from './BootLab';
import { CorrelationApp } from './Correlation';
import { ActivityApp } from './Activity';
import { SelfTestApp } from './SelfTest';
import { setSelfTestComponentProbe } from '../core/selftest';

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
  browser: BrowserApp,
  doctor: DoctorApp,
  services: ServicesApp,
  processes: ProcessesApp,
  config: ConfigApp,
  sysinfo: SysInfoApp,
  consensus: ConsensusApp,
  aegis: AegisApp,
  bootlab: BootLabApp,
  correlation: CorrelationApp,
  activity: ActivityApp,
  selftest: SelfTestApp,
};

setComponentRegistryProbe(() => Object.keys(APP_COMPONENTS));
setSelfTestComponentProbe(() => Object.keys(APP_COMPONENTS));
