import { useEffect, useRef, useState } from 'react';
import { useSignal, useStore } from '../core/store';
import { wm, WindowState, WORKSPACE_COUNT } from '../core/windows';
import { AppId, getApp } from '../core/apps';
import { toggleFavorite, userState } from '../core/userstate';
import { setAskHandler } from '../core/aegis';
import { setConfirmHandler } from '../core/actions';
import { CAPABILITIES } from '../core/capabilities';
import { runtime } from '../core/system';
import { settingsStore } from '../core/settings';
import { notifications } from '../core/notifications';
import { runDiagnostics } from '../core/diagnostics';
import { HOME, joinPath } from '../core/path';
import { CODENAME, CHANNEL } from '../core/version';
import { COMPACT_WIDTH, Window } from './Window';
import { Launcher } from './Launcher';
import { CommandPalette } from './Palette';
import { BatteryIndicator, QuickSettings, WorkspaceSwitcher } from './Tray';
import { Onboarding, Tour } from './Guide';
import { AppTile, Icon, PyxisMark } from './icons';
import { ContextMenuHost, DialogHost, MenuEntry, confirmDialog, openContextMenu, promptDialog, timeAgo, useNow } from './ui';

function formatClock(t: number, h24: boolean, seconds: boolean): string {
  return new Date(t).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: seconds ? '2-digit' : undefined,
    hour12: !h24,
  });
}

function Clock() {
  const s = useStore(settingsStore);
  const now = useNow(s.clockSeconds ? 1000 : 5000);
  const date = new Date(now).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <span className="clock" title={new Date(now).toString()}>
      <span className="clock-date">{date}</span>
      <span className="mono">{formatClock(now, s.clock24h, s.clockSeconds)}</span>
    </span>
  );
}

function StorageIndicator() {
  const p = useStore(runtime.persistence);
  const state = p.lastError ? 'err' : p.pending ? 'pending' : p.backend === 'memory' ? 'warn' : 'ok';
  const label =
    state === 'err'
      ? `Storage error: ${p.lastError}`
      : state === 'warn'
        ? 'Storage unavailable — changes will not persist'
        : state === 'pending'
          ? 'Saving…'
          : `Saved to ${p.backend}${p.lastSaveAt ? ' at ' + new Date(p.lastSaveAt).toLocaleTimeString() : ''}`;
  return (
    <button className={`status-ind storage-${state}`} title={label} aria-label={label} onClick={() => wm.open('monitor')}>
      <Icon.storage size={15} />
    </button>
  );
}

function NetworkIndicator() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  const label = online ? 'Browser reports online (not required)' : 'Offline — the desktop keeps working locally';
  return (
    <span className={`status-ind${online ? '' : ' storage-warn'}`} title={label} aria-label={label} role="img">
      {online ? <Icon.wifi size={15} /> : <Icon.wifiOff size={15} />}
    </span>
  );
}

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const list = useStore(notifications.history);
  const settings = useStore(settingsStore);
  const [grouped, setGrouped] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | 'problems'>('all');
  const now = useNow(30000);
  const shown = list.filter((n) => (filter === 'unread' ? !n.read : filter === 'problems' ? n.level === 'warn' || n.level === 'error' : true));
  const groups = grouped ? [...new Set(shown.map((n) => n.source))].map((src) => ({ src, items: shown.filter((n) => n.source === src) })) : [{ src: '', items: shown }];
  const unread = list.filter((n) => !n.read).length;
  return (
    <div className="panel notif-panel" role="dialog" aria-label="Notification center" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="panel-head">
        <strong>Notifications{unread ? ` · ${unread} unread` : ''}</strong>
        <span className="row gap-1">
          <button className="btn small ghost" onClick={() => notifications.markAllRead()} disabled={!unread}>
            Mark all read
          </button>
          <button className="btn small ghost" onClick={() => notifications.clear()} disabled={!list.length}>
            Clear all
          </button>
        </span>
      </div>
      <div className="notif-tools">
        <div className="seg small" role="radiogroup" aria-label="Filter notifications">
          {(['all', 'unread', 'problems'] as const).map((f) => (
            <button key={f} role="radio" aria-checked={filter === f} className={filter === f ? 'active' : undefined} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'unread' ? 'Unread' : 'Warnings'}
            </button>
          ))}
        </div>
        <label className="check small">
          <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} /> Group by app
        </label>
      </div>
      {settings.dnd && <div className="notif-dnd">Do not disturb is on — notifications are kept here without toasts.</div>}
      <div className="notif-list">
        {shown.length === 0 && <div className="panel-empty">{list.length ? 'Nothing matches this filter.' : 'No notifications this session.'}</div>}
        {groups.map((g) => (
          <div key={g.src || 'all'} role="list" aria-label={g.src || 'Notifications'}>
            {grouped && <div className="notif-group">{g.src}</div>}
            {g.items.map((n) => (
              <div key={n.id} role="listitem" className={`notif notif-${n.level}${n.read ? '' : ' unread'}`}>
                <button className="notif-main" onClick={() => notifications.markRead(n.id, !n.read)} aria-label={`${n.title}${n.read ? '' : ', unread'} — toggle read`}>
                  <span className="notif-title">{n.title}</span>
                  {n.body && <span className="notif-body">{n.body}</span>}
                  <span className="notif-time mono">
                    {n.level.toUpperCase()} · {n.source} · {timeAgo(n.time, now)}
                  </span>
                </button>
                <button className="wc" aria-label={`Dismiss ${n.title}`} onClick={() => notifications.dismiss(n.id)}>
                  <Icon.close size={12} />
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function PowerMenu({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.querySelector('button')?.focus(), []);
  const item = (label: string, icon: JSX.Element, fn: () => void, hint?: string) => (
    <button
      className="menu-item"
      role="menuitem"
      onClick={() => {
        onClose();
        fn();
      }}
    >
      <span className="menu-icon">{icon}</span>
      <span className="menu-label">{label}</span>
      {hint && <kbd>{hint}</kbd>}
    </button>
  );
  return (
    <div ref={ref} className="panel power-panel" role="menu" aria-label="Session" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="power-user">
        <span className="avatar">{settingsStore.get().displayName.slice(0, 1).toUpperCase()}</span>
        <span>
          <strong>{settingsStore.get().displayName}</strong>
          <span className="muted small">Local demonstration profile</span>
        </span>
      </div>
      <div className="menu-sep" />
      {item('Lock', <Icon.lock size={15} />, () => void runtime.lock())}
      {item('Sign out', <Icon.logout size={15} />, () => void runtime.logout())}
      <div className="menu-sep" />
      {item('Restart', <Icon.refresh size={15} />, () => void runtime.restart(), 'reload')}
      {item('Shut down', <Icon.power size={15} />, () => void runtime.shutdown())}
    </div>
  );
}

function Toasts() {
  const toasts = useStore(notifications.toasts);
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.level}`} role="status">
          <div className="toast-text">
            <strong>{t.title}</strong>
            {t.body && <span>{t.body}</span>}
          </div>
          <button className="wc" aria-label="Dismiss notification" onClick={() => notifications.dismissToast(t.id)}>
            <Icon.close size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

function Dock({ windows, focusedId }: { windows: WindowState[]; focusedId: string | null }) {
  const { favorites } = useStore(userState);
  const running = [...new Set(windows.map((w) => w.appId))].filter((id) => !favorites.includes(id));
  const ids: AppId[] = [...favorites, ...running];
  const navRef = useRef<HTMLElement>(null);

  const activate = (id: AppId) => {
    const wins = windows.filter((w) => w.appId === id).sort((a, b) => b.z - a.z);
    if (!wins.length) {
      wm.open(id);
      return;
    }
    const focused = wins.find((w) => w.id === focusedId);
    if (focused) {
      // Cycle between instances, or minimise when there is only one.
      if (wins.length > 1) wm.focus(wins[wins.length - 1].id);
      else wm.minimize(focused.id);
    } else wm.focus(wins[0].id);
  };

  const menu = (id: AppId, x: number, y: number) => {
    const meta = getApp(id)!;
    const wins = windows.filter((w) => w.appId === id);
    const pinned = favorites.includes(id);
    const items: MenuEntry[] = [
      ...wins.map((w) => ({ label: `${w.title} — workspace ${w.workspace + 1}`, icon: <Icon.restore size={14} />, onSelect: () => wm.focus(w.id) })),
      ...(wins.length ? ['separator' as const] : []),
      {
        label: wins.length && meta.singleton ? 'Show window' : 'New window',
        icon: <Icon.plus size={14} />,
        onSelect: () => wm.open(id),
      },
      {
        label: pinned ? 'Remove from dock' : 'Keep in dock',
        icon: pinned ? <Icon.starFilled size={14} /> : <Icon.star size={14} />,
        onSelect: () => toggleFavorite(id),
      },
      {
        label: wins.length > 1 ? `Close ${wins.length} windows` : 'Close',
        icon: <Icon.close size={14} />,
        disabled: !wins.length,
        danger: true,
        onSelect: () => wins.forEach((w) => wm.close(w.id)),
      },
    ];
    openContextMenu(x, y, items);
  };

  // Roving focus: arrow keys move between dock items, Home/End jump.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const items = [...(navRef.current?.querySelectorAll<HTMLButtonElement>('.dock-item') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? Math.max(0, i - 1) : Math.min(items.length - 1, i + 1);
    items[next]?.focus();
  };

  return (
    <nav className="dock" aria-label="Dock" ref={navRef} onKeyDown={onKeyDown}>
      <div className="dock-inner">
        {ids.map((id, i) => {
          const meta = getApp(id)!;
          const count = windows.filter((w) => w.appId === id).length;
          const isFocused = windows.some((w) => w.appId === id && w.id === focusedId && !w.minimized);
          return (
            <span key={id} className="dock-slot">
              {i === favorites.length && running.length > 0 && <span className="dock-sep" aria-hidden="true" />}
              <button
                className={`dock-item${count ? ' running' : ''}${isFocused ? ' focused' : ''}`}
                aria-label={`${meta.name}${count ? `, ${count} open` : ''}${isFocused ? ', active' : ''}`}
                aria-haspopup="menu"
                data-tip={meta.name}
                onClick={() => activate(id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  menu(id, e.clientX, e.clientY);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                    e.preventDefault();
                    const r = e.currentTarget.getBoundingClientRect();
                    menu(id, r.left, r.top - 8);
                  }
                }}
              >
                <AppTile id={id} size={40} />
                <span className="dock-pips" aria-hidden="true">
                  {Array.from({ length: Math.min(count, 3) }, (_, k) => (
                    <i key={k} />
                  ))}
                </span>
              </button>
            </span>
          );
        })}
      </div>
    </nav>
  );
}

function DesktopIcons() {
  const fs = useStore(runtime.fsInstance);
  useSignal(fs.changed);
  const dir = `${HOME}/Desktop`;
  let entries: ReturnType<typeof fs.list> = [];
  try {
    entries = fs.list(dir);
  } catch {
    entries = [];
  }
  return (
    <div className="desktop-icons" aria-label="Desktop files">
      {entries.slice(0, 24).map((e) => (
        <button
          key={e.path}
          className="desktop-icon"
          onDoubleClick={() => wm.open(e.type === 'dir' ? 'files' : 'editor', { path: e.path })}
          onKeyDown={(k) => k.key === 'Enter' && wm.open(e.type === 'dir' ? 'files' : 'editor', { path: e.path })}
          title={`${e.name} — double-click to open`}
        >
          <span className="desktop-icon-glyph">{e.type === 'dir' ? <Icon.folder size={30} /> : <Icon.fileText size={30} />}</span>
          <span className="desktop-icon-label">{e.name}</span>
        </button>
      ))}
    </div>
  );
}

export function Desktop() {
  const { windows, focusedId, viewport, activeWorkspace } = useStore(wm.store);
  const compact = viewport.w < COMPACT_WIDTH;
  const settings = useStore(settingsStore);
  const unread = useStore(notifications.history).filter((n) => !n.read).length;
  const [launcher, setLauncher] = useState(false);
  const [palette, setPalette] = useState(false);
  const [panel, setPanel] = useState<'notifications' | 'power' | 'quick' | null>(null);
  const user = useStore(userState);
  const [onboarding, setOnboarding] = useState(!user.onboardingDone);
  const [tour, setTour] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const focused = windows.find((w) => w.id === focusedId);

  // Keep the window manager informed of the workspace size.
  useEffect(() => {
    const el = workspaceRef.current;
    if (!el) return;
    const update = () => wm.setViewport(el.clientWidth, el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [settings.dockPosition]);

  // Permission prompts and confirmation of destructive actions use the desktop dialog.
  useEffect(() => {
    setAskHandler((subject, cap, reason) =>
      confirmDialog(`Allow ${getApp(subject)?.name ?? subject} to ${CAPABILITIES[cap].label.toLowerCase()}?`, {
        message: `${reason}\n\nAegis policy for this app is set to “ask”. This is an application-level permission inside PyxisOS-Web.`,
        confirmLabel: 'Allow once',
      }),
    );
    setConfirmHandler((title, message) => confirmDialog(`${title}?`, { message, confirmLabel: title, danger: true }));
    const openTour = () => setTour(true);
    const openOnboarding = () => setOnboarding(true);
    const openLauncher = () => setLauncher(true);
    const closeOverlays = () => {
      setLauncher(false);
      setPalette(false);
    };
    window.addEventListener('pyxis:close-overlays', closeOverlays);
    window.addEventListener('pyxis:tour', openTour);
    window.addEventListener('pyxis:onboarding', openOnboarding);
    window.addEventListener('pyxis:launcher', openLauncher);
    return () => {
      window.removeEventListener('pyxis:tour', openTour);
      window.removeEventListener('pyxis:onboarding', openOnboarding);
      window.removeEventListener('pyxis:launcher', openLauncher);
      window.removeEventListener('pyxis:close-overlays', closeOverlays);
    };
  }, []);

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey && !e.altKey && k === 'k') || (e.ctrlKey && e.shiftKey && k === 'p')) {
        e.preventDefault();
        setPalette((v) => !v);
        setLauncher(false);
        setPanel(null);
        return;
      }
      if (e.altKey && !e.ctrlKey && k === ' ') {
        e.preventDefault();
        setLauncher((v) => !v);
        setPalette(false);
        setPanel(null);
        return;
      }
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const fid = wm.state.focusedId;
      // Alt+1..4 switches workspace; Alt+Shift+1..4 moves the focused window there.
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (digit && Number(digit[1]) <= WORKSPACE_COUNT) {
        e.preventDefault();
        const n = Number(digit[1]) - 1;
        if (e.shiftKey && fid) wm.moveToWorkspace(fid, n);
        else if (!e.shiftKey) wm.switchWorkspace(n);
        return;
      }
      const actions: Record<string, () => void> = {
        t: () => wm.open('terminal'),
        e: () => wm.open('files'),
        ',': () => wm.open('settings'),
        w: () => fid && wm.close(fid),
        m: () => fid && wm.minimize(fid),
        '`': () => wm.cycle(),
      };
      if (!e.shiftKey && actions[k]) {
        e.preventDefault();
        actions[k]();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!panel) return;
    const close = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.panel') && !t.closest('[data-panel-toggle]')) setPanel(null);
    };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [panel]);

  const desktopMenu = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains('desktop-icons')) return;
    e.preventDefault();
    const desktopDir = `${HOME}/Desktop`;
    openContextMenu(e.clientX, e.clientY, [
      { label: 'Open Terminal', icon: <Icon.play size={14} />, shortcut: 'Alt+T', onSelect: () => wm.open('terminal') },
      { label: 'Open Files', icon: <Icon.folder size={14} />, shortcut: 'Alt+E', onSelect: () => wm.open('files') },
      'separator',
      {
        label: 'New text file on Desktop',
        icon: <Icon.filePlus size={14} />,
        onSelect: async () => {
          const fs = runtime.fs;
          const name = await promptDialog('New text file', { value: fs.uniqueName(desktopDir, 'untitled.txt'), confirmLabel: 'Create' });
          if (!name) return;
          try {
            fs.writeFile(joinPath(desktopDir, name), '');
            wm.open('editor', { path: joinPath(desktopDir, name) });
          } catch (err) {
            notifications.notify('Could not create file', (err as Error).message, 'error');
          }
        },
      },
      {
        label: 'New folder on Desktop',
        icon: <Icon.folderPlus size={14} />,
        onSelect: async () => {
          const fs = runtime.fs;
          const name = await promptDialog('New folder', { value: fs.uniqueName(desktopDir, 'New folder'), confirmLabel: 'Create' });
          if (!name) return;
          try {
            fs.mkdir(joinPath(desktopDir, name));
          } catch (err) {
            notifications.notify('Could not create folder', (err as Error).message, 'error');
          }
        },
      },
      'separator',
      {
        label: 'Run diagnostics',
        icon: <Icon.check size={14} />,
        onSelect: async () => {
          const r = await runDiagnostics();
          notifications.notify(
            'Diagnostics complete',
            `${r.summary.pass} passed, ${r.summary.warn} warnings, ${r.summary.fail} failed`,
            r.summary.fail ? 'error' : r.summary.warn ? 'warn' : 'success',
          );
        },
      },
      { label: 'Change wallpaper…', icon: <Icon.grid size={14} />, onSelect: () => wm.open('settings', { section: 'appearance' }) },
      { label: 'Command palette', icon: <Icon.command size={14} />, shortcut: 'Ctrl+K', onSelect: () => setPalette(true) },
      {
        label: 'Next workspace',
        icon: <Icon.layers size={14} />,
        onSelect: () => wm.switchWorkspace((wm.state.activeWorkspace + 1) % WORKSPACE_COUNT),
      },
      {
        label: 'Minimize all windows',
        icon: <Icon.minimize size={14} />,
        disabled: !wm.visibleWindows.some((w) => !w.minimized),
        onSelect: () => wm.visibleWindows.forEach((w) => wm.minimize(w.id)),
      },
      {
        label: 'Close all windows',
        icon: <Icon.close size={14} />,
        disabled: !windows.length,
        danger: true,
        onSelect: async () => {
          if (await confirmDialog('Close all windows?', { message: 'Unsaved editor changes will be lost.', confirmLabel: 'Close all', danger: true })) wm.closeAll();
        },
      },
    ]);
  };

  return (
    <div className={`desktop dock-${settings.dockPosition}${settings.dockAutohide ? ' dock-autohide' : ''}`}>
      <div className="wallpaper" aria-hidden="true" />
      <header className="topbar">
        <div className="topbar-left">
          <button
            className="topbar-brand"
            onClick={() => setLauncher((v) => !v)}
            aria-label="Open launcher"
            aria-expanded={launcher}
            title="Launcher (Alt+Space / Ctrl+K)"
          >
            <PyxisMark size={18} />
            <span className="brand-text">
              {CODENAME} <span className="brand-sep">//</span> {CHANNEL}
            </span>
          </button>
          <WorkspaceSwitcher />
          <span className="topbar-focus" aria-live="polite">
            {focused && !focused.minimized ? focused.title : 'Desktop'}
          </span>
        </div>
        <div className="topbar-right">
          <button className="topbar-search" onClick={() => setPalette(true)} aria-label="Search or run a command" title="Command palette (Ctrl+K)">
            <Icon.search size={14} />
            <span>Search or run…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <StorageIndicator />
          <NetworkIndicator />
          <BatteryIndicator />
          <button
            className="status-ind"
            data-panel-toggle
            aria-label="Quick settings"
            aria-expanded={panel === 'quick'}
            title="Quick settings"
            onClick={() => setPanel((p) => (p === 'quick' ? null : 'quick'))}
          >
            <Icon.sliders size={15} />
          </button>
          <button
            className="status-ind"
            data-panel-toggle
            aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
            aria-expanded={panel === 'notifications'}
            onClick={() => setPanel((p) => (p === 'notifications' ? null : 'notifications'))}
          >
            <Icon.bell size={15} />
            {unread > 0 && <span className="notif-count">{unread > 9 ? '9+' : unread}</span>}
          </button>
          <Clock />
          <button
            className="status-ind"
            data-panel-toggle
            aria-label="Session menu"
            aria-expanded={panel === 'power'}
            onClick={() => setPanel((p) => (p === 'power' ? null : 'power'))}
          >
            <Icon.power size={15} />
          </button>
        </div>
      </header>
      <main className="workspace" ref={workspaceRef} onContextMenu={desktopMenu}>
        <DesktopIcons />
        {windows.map((w) => (
          <Window key={w.id} win={w} focused={w.id === focusedId} compact={compact} hidden={w.workspace !== activeWorkspace} />
        ))}
      </main>
      <Dock windows={windows} focusedId={focusedId} />
      {panel === 'notifications' && <NotificationPanel onClose={() => setPanel(null)} />}
      {panel === 'power' && <PowerMenu onClose={() => setPanel(null)} />}
      {panel === 'quick' && <QuickSettings onClose={() => setPanel(null)} onOpenSettings={() => wm.open('settings')} />}
      {launcher && <Launcher onClose={() => setLauncher(false)} />}
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
      {tour && <Tour onExit={() => setTour(false)} />}
      {onboarding && (
        <Onboarding
          onDone={(startTour) => {
            setOnboarding(false);
            if (startTour) setTour(true);
          }}
        />
      )}
      <Toasts />
      <ContextMenuHost />
      <DialogHost />
    </div>
  );
}
