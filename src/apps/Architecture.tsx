import { useState } from 'react';
import { AppProps } from './types';
import { wm } from '../core/windows';
import { AppId } from '../core/apps';
import { Badge, BadgeKind } from '../shell/ui';

interface Component {
  id: string;
  name: string;
  layer: 'Experience' | 'Intelligence' | 'System' | 'Kernel';
  native: string;
  web: BadgeKind;
  webDetail: string;
  role: string;
  links?: { label: string; app: AppId }[];
  depends: string[];
}

/**
 * Component model. "native" describes the role in the PyxisOS project;
 * "web" describes what this browser build actually provides.
 */
const COMPONENTS: Component[] = [
  {
    id: 'desktop',
    name: 'Desktop environment',
    layer: 'Experience',
    native: 'Graphical shell of PyxisOS: windows, dock, launcher and system UI.',
    web: 'IMPLEMENTED',
    webDetail: 'Fully implemented in this web build: window manager, dock, launcher, notifications, settings and applications.',
    role: 'Presents the system to the user and hosts applications.',
    links: [
      { label: 'Settings', app: 'settings' },
      { label: 'System Center', app: 'system-center' },
    ],
    depends: ['services', 'cli'],
  },
  {
    id: 'cli',
    name: 'Pyxis CLI',
    layer: 'Experience',
    native: 'Command interface for administering and inspecting PyxisOS.',
    web: 'SIMULATED',
    webDetail: 'psh in the Pyxis Terminal implements file, text and pyxis commands against the virtual filesystem. It cannot run host commands.',
    role: 'Scriptable access to system state and services.',
    links: [{ label: 'Open Terminal', app: 'terminal' }],
    depends: ['services'],
  },
  {
    id: 'astral-ui',
    name: 'Astral Intelligence',
    layer: 'Intelligence',
    native: 'Planned system-intelligence layer that explains state and recommends actions.',
    web: 'SIMULATED',
    webDetail: 'A local, rule-based assistant that reads real diagnostic results and runtime state. No language model is involved.',
    role: 'Explains diagnostics and suggests next steps.',
    links: [{ label: 'Open Astral', app: 'astral' }],
    depends: ['consensus', 'services'],
  },
  {
    id: 'consensus',
    name: 'Astral Consensus Engine',
    layer: 'Intelligence',
    native: 'Proposed engine for combining multiple signals or evaluators into a single decision.',
    web: 'NOT IMPLEMENTED',
    webDetail: 'Not present in this build. Shown here to document the planned architecture only.',
    role: 'Decision aggregation for Astral (proposed).',
    depends: ['services'],
  },
  {
    id: 'aegis',
    name: 'Aegis integration',
    layer: 'Intelligence',
    native: 'Proposed security and policy integration concept for PyxisOS.',
    web: 'PLANNED',
    webDetail: 'Concept only. The web build enforces its own simple rules (read-only /system, protected directories, path validation).',
    role: 'Policy and protection boundary (proposed).',
    depends: ['services', 'kernel'],
  },
  {
    id: 'services',
    name: 'System services',
    layer: 'System',
    native: 'User-space services: storage, sessions, events, notifications, diagnostics.',
    web: 'SIMULATED',
    webDetail: 'Implemented as JavaScript modules: IndexedDB persistence, virtual filesystem, event journal, notifications, diagnostics and metrics sampling.',
    role: 'Shared state and capabilities for every application.',
    links: [
      { label: 'System Monitor', app: 'monitor' },
      { label: 'Event Journal', app: 'events' },
    ],
    depends: ['kernel'],
  },
  {
    id: 'vfs',
    name: 'Virtual filesystem',
    layer: 'System',
    native: 'Filesystem services provided by the native OS.',
    web: 'SIMULATED',
    webDetail: 'In-memory tree persisted to IndexedDB; shared by Terminal, Files and Text Editor; enforces size quota and protected paths.',
    role: 'Single source of truth for files.',
    links: [{ label: 'Files', app: 'files' }],
    depends: ['kernel'],
  },
  {
    id: 'kernel',
    name: 'Lunar Core',
    layer: 'Kernel',
    native: 'The PyxisOS microkernel, developed natively and separately from this web build.',
    web: 'UNAVAILABLE',
    webDetail: 'Not booted in the browser. Kernel identifiers displayed by uname and pyxis are simulation labels (lunar-core 0.1.0-sim).',
    role: 'Scheduling, memory and IPC on real hardware.',
    depends: [],
  },
];

const LAYERS: Component['layer'][] = ['Experience', 'Intelligence', 'System', 'Kernel'];

export function ArchitectureApp(_: AppProps) {
  const [selected, setSelected] = useState<string>('desktop');
  const sel = COMPONENTS.find((c) => c.id === selected)!;
  const related = new Set([...sel.depends, ...COMPONENTS.filter((c) => c.depends.includes(sel.id)).map((c) => c.id)]);

  return (
    <div className="arch">
      <div className="arch-map app-scroll" role="list" aria-label="PyxisOS components by layer">
        <div className="arch-legend small">
          <Badge kind="IMPLEMENTED" /> in this web build
          <Badge kind="SIMULATED" /> browser stand-in
          <Badge kind="UNAVAILABLE" /> native only
          <Badge kind="PLANNED" /> / <Badge kind="NOT IMPLEMENTED" /> not built
        </div>
        {LAYERS.map((layer) => (
          <div key={layer} className="arch-layer">
            <div className="arch-layer-label mono">{layer.toUpperCase()}</div>
            <div className="arch-nodes">
              {COMPONENTS.filter((c) => c.layer === layer).map((c) => (
                <button
                  key={c.id}
                  role="listitem"
                  className={`arch-node web-${c.web.toLowerCase().replace(' ', '-')}${c.id === selected ? ' active' : ''}${related.has(c.id) ? ' related' : ''}`}
                  onClick={() => setSelected(c.id)}
                  aria-pressed={c.id === selected}
                >
                  <strong>{c.name}</strong>
                  <Badge kind={c.web} />
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="muted small note">
          Highlighted outlines show components directly connected to the selection. The browser build replaces the kernel layer with
          JavaScript services; nothing here runs on bare metal.
        </p>
      </div>
      <aside className="arch-detail app-scroll" aria-live="polite">
        <div className="eyebrow">{sel.layer} layer</div>
        <h2>{sel.name}</h2>
        <Badge kind={sel.web} />
        <h3>Role</h3>
        <p>{sel.role}</p>
        <h3>In PyxisOS</h3>
        <p>{sel.native}</p>
        <h3>In this web build</h3>
        <p>{sel.webDetail}</p>
        {sel.depends.length > 0 && (
          <>
            <h3>Depends on</h3>
            <div className="chip-row">
              {sel.depends.map((d) => (
                <button key={d} className="chip" onClick={() => setSelected(d)}>
                  {COMPONENTS.find((c) => c.id === d)?.name}
                </button>
              ))}
            </div>
          </>
        )}
        {sel.links && (
          <>
            <h3>Try it</h3>
            <div className="chip-row">
              {sel.links.map((l) => (
                <button key={l.app} className="btn small" onClick={() => wm.open(l.app)}>
                  {l.label}
                </button>
              ))}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
