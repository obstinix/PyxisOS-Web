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
  external: (p: IconProps) => (
    <Svg {...p}>
      <path d="M13.5 5.5h5v5M18.5 5.5L11 13M17 14v4.5H5.5V7H10" />
    </Svg>
  ),
};
