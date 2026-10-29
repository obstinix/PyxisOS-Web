import { ReactNode, SVGProps } from 'react';
import { AppId } from '../core/apps';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

const A = { stroke: 'var(--accent)' };
const AF = { fill: 'var(--accent)', stroke: 'none' };

/** Glyphs used inside app tiles. Accent strokes mark one detail per icon. */
const APP_GLYPHS: Record<AppId, ReactNode> = {
  'system-center': (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 4.5v3M12 16.5v3M4.5 12h3M16.5 12h3" />
      <circle cx="12" cy="12" r="2.4" {...A} />
    </>
  ),
  terminal: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M7.5 10l2.5 2-2.5 2" {...A} />
      <path d="M12.5 15h4" />
    </>
  ),
  files: (
    <>
      <path d="M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2h7.4a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <path d="M3.5 10.5h17" {...A} />
    </>
  ),
  editor: (
    <>
      <path d="M6 3.5h8l4 4v13H6z" />
      <path d="M14 3.5v4h4" />
      <path d="M9 12h6M9 15h6M9 18h3.5" {...A} />
    </>
  ),
  monitor: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M6.5 15l3-4 3 2.5 2.5-5 2.5 3" {...A} />
    </>
  ),
  settings: (
    <>
      <path d="M5 7h8M17 7h2M5 12h3M12 12h7M5 17h10M19 17h0" />
      <circle cx="15" cy="7" r="2" {...A} />
      <circle cx="10" cy="12" r="2" />
      <circle cx="17" cy="17" r="2" />
    </>
  ),
  architecture: (
    <>
      <rect x="9" y="3.5" width="6" height="4.5" rx="1" {...A} />
      <rect x="3.5" y="16" width="6" height="4.5" rx="1" />
      <rect x="14.5" y="16" width="6" height="4.5" rx="1" />
      <path d="M12 8v4M6.5 16v-2h11v2M12 12v2" />
    </>
  ),
  astral: (
    <>
      <path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2-5.2-1.8 5.2-1.8z" />
      <circle cx="18.5" cy="18.5" r="1.6" {...AF} />
      <circle cx="5.5" cy="18.5" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  events: (
    <>
      <path d="M6 4.5h12v15H6z" />
      <path d="M9 9h6M9 12.5h6M9 16h3" />
      <circle cx="17.5" cy="17" r="2.6" fill="var(--surface-2)" {...A} />
    </>
  ),
  about: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 11v5" />
      <circle cx="12" cy="8" r="0.9" {...AF} />
    </>
  ),
  browser: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.4 2.2 3.5 5 3.5 8s-1.1 5.8-3.5 8c-2.4-2.2-3.5-5-3.5-8s1.1-5.8 3.5-8z" />
      <circle cx="17.6" cy="6.4" r="1.6" {...AF} />
    </>
  ),
  doctor: (
    <>
      <path d="M12 20s-7-4.2-7-9.5A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.5C19 15.8 12 20 12 20z" />
      <path d="M8 12.5h2.2l1.3-2.2 1.8 4 1.2-1.8H16" {...A} />
    </>
  ),
  services: (
    <>
      <rect x="4" y="4.5" width="16" height="5" rx="1.2" />
      <rect x="4" y="14.5" width="16" height="5" rx="1.2" />
      <circle cx="7.5" cy="7" r="1" {...AF} />
      <circle cx="7.5" cy="17" r="1" fill="currentColor" stroke="none" />
      <path d="M12 9.5v5" />
    </>
  ),
  processes: (
    <>
      <rect x="9" y="3.5" width="6" height="4" rx="1" />
      <rect x="3.5" y="16.5" width="6" height="4" rx="1" />
      <rect x="14.5" y="16.5" width="6" height="4" rx="1" {...A} />
      <path d="M12 7.5v4.5M6.5 16.5V12h11v4.5" />
    </>
  ),
  config: (
    <>
      <path d="M6 3.5h8l4 4v13H6z" />
      <path d="M10 11l-2 2 2 2M14 11l2 2-2 2" {...A} />
    </>
  ),
  sysinfo: (
    <>
      <rect x="3.5" y="5" width="17" height="11" rx="1.6" />
      <path d="M9 19.5h6M12 16v3.5" />
      <path d="M7 9h5M7 12h8" {...A} />
    </>
  ),
  consensus: (
    <>
      <circle cx="12" cy="5.5" r="2" {...A} />
      <circle cx="5" cy="17" r="2" />
      <circle cx="19" cy="17" r="2" />
      <path d="M10.9 7.3l-4.8 7.9M13.1 7.3l4.8 7.9M7 17h10" />
    </>
  ),
  aegis: (
    <>
      <path d="M12 3.5l7 2.6v5.4c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6.1z" />
      <path d="M9 12l2.2 2.2L15.5 10" {...A} />
    </>
  ),
  bootlab: (
    <>
      <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
      <path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3" />
      <path d="M10 12h4" {...A} />
    </>
  ),
  correlation: (
    <>
      <path d="M4 18h16" />
      <circle cx="7" cy="12" r="1.8" />
      <circle cx="12" cy="8" r="1.8" {...A} />
      <circle cx="17" cy="12.5" r="1.8" />
      <path d="M8.4 10.9l2.2-1.7M13.5 9.2l2.1 2.1" />
    </>
  ),
  activity: (
    <>
      <path d="M12 3.5l1.4 4 4 1.4-4 1.4-1.4 4-1.4-4-4-1.4 4-1.4z" />
      <path d="M5 18.5h8M5 15.5h5" />
      <path d="M15.5 17l1.6 1.6 2.9-3" {...A} />
    </>
  ),
  selftest: (
    <>
      <path d="M9 3.5h6M10 3.5v5.2L5.4 17.4A2 2 0 0 0 7.2 20.5h9.6a2 2 0 0 0 1.8-3.1L14 8.7V3.5" />
      <path d="M7.5 15h9" {...A} />
    </>
  ),
};

export function AppGlyph({ id, size = 22 }: { id: AppId; size?: number }) {
  return <Svg size={size}>{APP_GLYPHS[id]}</Svg>;
}

export function AppTile({ id, size = 40 }: { id: AppId; size?: number }) {
  return (
    <span className="app-tile" style={{ width: size, height: size }}>
      <AppGlyph id={id} size={Math.round(size * 0.56)} />
    </span>
  );
}

/** Lunar-Pyxis mark: a crescent orbit with a single satellite. */
export function PyxisMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.9" />
      <path d="M8.6 23.4A10.5 10.5 0 0 0 26.5 16" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="21.5" cy="10.5" r="2.6" fill="var(--accent-soft)" />
    </svg>
  );
}

export const Icon = {
  close: (p: IconProps) => (
    <Svg {...p}>
      <path d="M7 7l10 10M17 7L7 17" />
    </Svg>
  ),
  minimize: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6.5 12.5h11" />
    </Svg>
  ),
  maximize: (p: IconProps) => (
    <Svg {...p}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
    </Svg>
  ),
  restore: (p: IconProps) => (
    <Svg {...p}>
      <rect x="6" y="9" width="9" height="9" rx="1.5" />
      <path d="M9 6.5h7a1.5 1.5 0 0 1 1.5 1.5v7" />
    </Svg>
  ),
  search: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l4 4" />
    </Svg>
  ),
  bell: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </Svg>
  ),
  power: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 4v7" />
      <path d="M7.5 6.8a7 7 0 1 0 9 0" />
    </Svg>
  ),
  storage: (p: IconProps) => (
    <Svg {...p}>
      <ellipse cx="12" cy="6.5" rx="6.5" ry="2.5" />
      <path d="M5.5 6.5v11c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-11M5.5 12c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5" />
    </Svg>
  ),
  wifi: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 9.5a12 12 0 0 1 16 0M7 13a7.5 7.5 0 0 1 10 0M10 16.5a3 3 0 0 1 4 0" />
      <circle cx="12" cy="19.5" r="0.8" fill="currentColor" />
    </Svg>
  ),
  wifiOff: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 9.5a12 12 0 0 1 4-2.4M13.5 6.6A12 12 0 0 1 20 9.5M10 16.5a3 3 0 0 1 4 0M4 4l16 16" />
    </Svg>
  ),
  folder: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2h7.4a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
    </Svg>
  ),
  file: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6.5 3.5h7l4 4v13h-11z" />
      <path d="M13.5 3.5v4h4" />
    </Svg>
  ),
  fileText: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6.5 3.5h7l4 4v13h-11z" />
      <path d="M13.5 3.5v4h4M9 12h6M9 15h6M9 18h4" />
    </Svg>
  ),
  home: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4.5 11L12 4.5l7.5 6.5V19.5h-5v-5h-5v5h-5z" />
    </Svg>
  ),
  arrowLeft: (p: IconProps) => (
    <Svg {...p}>
      <path d="M14.5 6.5L9 12l5.5 5.5" />
    </Svg>
  ),
  arrowRight: (p: IconProps) => (
    <Svg {...p}>
      <path d="M9.5 6.5L15 12l-5.5 5.5" />
    </Svg>
  ),
  arrowUp: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6.5 14.5L12 9l5.5 5.5" />
    </Svg>
  ),
  plus: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 6v12M6 12h12" />
    </Svg>
  ),
  folderPlus: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2h7.4a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <path d="M12 10.5v5M9.5 13h5" />
    </Svg>
  ),
  filePlus: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6.5 3.5h7l4 4v13h-11z" />
      <path d="M12 11v6M9 14h6" />
    </Svg>
  ),
  trash: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7" />
    </Svg>
  ),
  copy: (p: IconProps) => (
    <Svg {...p}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="1.5" />
      <path d="M15.5 8.5V5.5a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3" />
    </Svg>
  ),
  cut: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="7" cy="17" r="2.5" />
      <circle cx="17" cy="17" r="2.5" />
      <path d="M8.8 15.2L17 5M15.2 15.2L7 5" />
    </Svg>
  ),
  paste: (p: IconProps) => (
    <Svg {...p}>
      <rect x="6" y="5" width="12" height="15" rx="1.5" />
      <path d="M9.5 5V3.5h5V5" />
    </Svg>
  ),
  rename: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="M13 7l4 4" />
    </Svg>
  ),
  download: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 4.5v10M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />
    </Svg>
  ),
  upload: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 15V5M7.5 9.5L12 5l4.5 4.5M5 19.5h14" />
    </Svg>
  ),
  save: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 4.5h11l3 3v12H5z" />
      <path d="M8 4.5v4h7v-4M8 19.5v-6h8v6" />
    </Svg>
  ),
  refresh: (p: IconProps) => (
    <Svg {...p}>
      <path d="M19 12a7 7 0 1 1-2.05-4.95" />
      <path d="M19 4.5V8h-3.5" />
    </Svg>
  ),
  play: (p: IconProps) => (
    <Svg {...p}>
      <path d="M8 5.5v13l10-6.5z" />
    </Svg>
  ),
  check: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5.5 12.5l4 4 9-9" />
    </Svg>
  ),
  alert: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 4l9 15.5H3z" />
      <path d="M12 10v4.5" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" />
    </Svg>
  ),
  x: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
    </Svg>
  ),
  minus: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <path d="M8.5 12h7" />
    </Svg>
  ),
  lock: (p: IconProps) => (
    <Svg {...p}>
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="1.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </Svg>
  ),
  logout: (p: IconProps) => (
    <Svg {...p}>
      <path d="M10 5H5.5v14H10M14.5 8l4 4-4 4M18.5 12H9.5" />
    </Svg>
  ),
  grid: (p: IconProps) => (
    <Svg {...p}>
      <rect x="4.5" y="4.5" width="6" height="6" rx="1" />
      <rect x="13.5" y="4.5" width="6" height="6" rx="1" />
      <rect x="4.5" y="13.5" width="6" height="6" rx="1" />
      <rect x="13.5" y="13.5" width="6" height="6" rx="1" />
    </Svg>
  ),
  send: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4.5 12L19.5 5l-4 14.5-3.5-6z" />
      <path d="M12 13.5l7.5-8.5" />
    </Svg>
  ),
  chevronDown: (p: IconProps) => (
    <Svg {...p}>
      <path d="M7 10l5 5 5-5" />
    </Svg>
  ),
  star: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 4l2.4 5 5.3.6-4 3.6 1.1 5.3L12 15.8l-4.8 2.7 1.1-5.3-4-3.6 5.3-.6z" />
    </Svg>
  ),
  starFilled: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 4l2.4 5 5.3.6-4 3.6 1.1 5.3L12 15.8l-4.8 2.7 1.1-5.3-4-3.6 5.3-.6z" fill="currentColor" />
    </Svg>
  ),
  sliders: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 7h14M5 12h14M5 17h14" />
      <circle cx="9" cy="7" r="1.8" fill="var(--surface-1)" />
      <circle cx="15" cy="12" r="1.8" fill="var(--surface-1)" />
      <circle cx="8" cy="17" r="1.8" fill="var(--surface-1)" />
    </Svg>
  ),
  volume: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 9.5h3l4-3.5v12l-4-3.5H5z" />
      <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M17.8 7.2a6.8 6.8 0 0 1 0 9.6" />
    </Svg>
  ),
  volumeOff: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 9.5h3l4-3.5v12l-4-3.5H5z" />
      <path d="M16 10l4 4M20 10l-4 4" />
    </Svg>
  ),
  battery: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3.5" y="8" width="15" height="8" rx="1.6" />
      <path d="M20.5 11v2" />
    </Svg>
  ),
  moon: (p: IconProps) => (
    <Svg {...p}>
      <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" />
    </Svg>
  ),
  sun: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6" />
    </Svg>
  ),
  command: (p: IconProps) => (
    <Svg {...p}>
      <path d="M9 9V7a2 2 0 1 0-2 2h10a2 2 0 1 0-2-2v10a2 2 0 1 0 2-2H7a2 2 0 1 0 2 2z" />
    </Svg>
  ),
  layers: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 4l8 4-8 4-8-4z" />
      <path d="M4 12l8 4 8-4M4 16l8 4 8-4" />
    </Svg>
  ),
  stop: (p: IconProps) => (
    <Svg {...p}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
    </Svg>
  ),
  help: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <path d="M9.8 9.6a2.3 2.3 0 0 1 4.4.9c0 1.6-2.2 2-2.2 3.4" />
      <circle cx="12" cy="16.6" r="0.6" fill="currentColor" />
    </Svg>
  ),
  bookmark: (p: IconProps) => (
    <Svg {...p}>
      <path d="M7 4.5h10v15l-5-3.5-5 3.5z" />
    </Svg>
  ),
  bookmarkFilled: (p: IconProps) => (
    <Svg {...p}>
      <path d="M7 4.5h10v15l-5-3.5-5 3.5z" fill="currentColor" />
    </Svg>
  ),
  history: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9" />
      <path d="M4.5 4.5V9H9M12 8v4.5l3 1.8" />
    </Svg>
  ),
  undo: (p: IconProps) => (
    <Svg {...p}>
      <path d="M9 7.5L5 11.5l4 4" />
      <path d="M5 11.5h9a5 5 0 0 1 0 10h-2" />
    </Svg>
  ),
  external: (p: IconProps) => (
    <Svg {...p}>
      <path d="M13.5 5.5h5v5M18.5 5.5L11 13M17 14v4.5H5.5V7H10" />
    </Svg>
  ),
};
