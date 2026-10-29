import { useEffect, useRef, useState } from 'react';
import { useStore } from '../core/store';
import { ACCENTS, AccentId, settingsStore, updateSettings, WALLPAPERS, WallpaperId } from '../core/settings';
import { setUserFlag } from '../core/userstate';
import { wm } from '../core/windows';
import { AppId } from '../core/apps';
import { Icon, PyxisMark } from './icons';
import { useFocusTrap } from './ui';

/** Short, skippable first-run setup. Completion is persisted in user state. */
export function Onboarding({ onDone }: { onDone: (startTour: boolean) => void }) {
  const s = useStore(settingsStore);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(s.displayName);
  const boxRef = useRef<HTMLDivElement>(null);
  useFocusTrap(boxRef);
  useEffect(() => {
    boxRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, [step]);

  const finish = (tour: boolean) => {
    if (name.trim()) updateSettings({ displayName: name });
    setUserFlag('onboardingDone', true);
    onDone(tour);
  };

  const steps = [
    {
      title: 'Welcome to PyxisOS-Web',
      body: (
        <>
          <p>This is a browser-based simulation of the PyxisOS desktop. Windows, files, the terminal, settings and diagnostics are real features of this web app; kernel, hardware and daemon behaviour are simulated and labelled.</p>
          <ul className="guide-list">
            <li>
              <strong>Stored locally.</strong> Files and preferences live in this browser's storage — not on your computer's disk.
            </li>
            <li>
              <strong>No telemetry.</strong> Nothing is sent anywhere unless you use Pyxis Browser, which loads the pages you ask for.
            </li>
            <li>
              <strong>Not an emulator.</strong> The Lunar Core kernel is not booted; nothing runs on bare metal.
            </li>
          </ul>
        </>
      ),
    },
    {
      title: 'Choose an appearance',
      body: (
        <div className="guide-form">
          <div className="seg" role="radiogroup" aria-label="Theme">
            {(['dark', 'light'] as const).map((t) => (
              <button key={t} role="radio" aria-checked={s.theme === t} className={s.theme === t ? 'active' : undefined} onClick={() => updateSettings({ theme: t })} data-autofocus={s.theme === t || undefined}>
                {t === 'dark' ? 'Dark' : 'Light'}
              </button>
            ))}
          </div>
          <div className="swatches" role="radiogroup" aria-label="Accent colour">
            {(Object.keys(ACCENTS) as AccentId[]).map((a) => (
              <button key={a} role="radio" aria-checked={s.accent === a} aria-label={ACCENTS[a].label} title={ACCENTS[a].label} className={`swatch${s.accent === a ? ' active' : ''}`} style={{ background: s.theme === 'dark' ? ACCENTS[a].dark : ACCENTS[a].light }} onClick={() => updateSettings({ accent: a })} />
            ))}
          </div>
          <label className="field">
            <span>Wallpaper</span>
            <select className="input" value={s.wallpaper} onChange={(e) => updateSettings({ wallpaper: e.target.value as WallpaperId })}>
              {Object.entries(WALLPAPERS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={s.motion === 'reduced'} onChange={(e) => updateSettings({ motion: e.target.checked ? 'reduced' : 'system' })} /> Reduce motion
          </label>
        </div>
      ),
    },
    {
      title: 'Desktop controls',
      body: (
        <table className="kbd-table">
          <tbody>
            {[
              ['Ctrl+K', 'Command palette — run actions, open apps, find files'],
              ['Alt+Space', 'Application launcher'],
              ['Alt+1 … Alt+4', 'Switch workspace (Alt+Shift+number moves the window)'],
              ['Alt+Shift+←/→/↑', 'Snap left / right, maximise'],
              ['Alt+W / Alt+M', 'Close / minimise the focused window'],
              ['Alt+T / Alt+E', 'Terminal / Files'],
              ['Right-click', 'Context menus on the desktop, title bars, dock and files'],
            ].map(([k, v]) => (
              <tr key={k}>
                <td>
                  <kbd>{k}</kbd>
                </td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    },
    {
      title: 'Last step',
      body: (
        <div className="guide-form">
          <label className="field">
            <span>Display name</span>
            <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} data-autofocus />
          </label>
          <p className="muted">You can replay this setup and the guided demo any time from Settings → Help or the command palette.</p>
        </div>
      ),
    },
  ];
  const cur = steps[step];
  const last = step === steps.length - 1;

  return (
    <div className="guide-backdrop">
      <div ref={boxRef} className="guide" role="dialog" aria-modal="true" aria-labelledby="guide-title">
        <div className="guide-head">
          <PyxisMark size={22} />
          <span className="muted small">
            Setup {step + 1} of {steps.length}
          </span>
          <button className="btn ghost small" onClick={() => finish(false)}>
            Skip
          </button>
        </div>
        <h2 id="guide-title">{cur.title}</h2>
        <div className="guide-body">{cur.body}</div>
        <div className="guide-progress" aria-hidden="true">
          {steps.map((_, i) => (
            <i key={i} className={i <= step ? 'on' : ''} />
          ))}
        </div>
        <div className="guide-actions">
          <button className="btn ghost" onClick={() => setStep((n) => n - 1)} disabled={step === 0}>
            Back
          </button>
          {last ? (
            <span className="row gap-2">
              <button className="btn" onClick={() => finish(false)}>
                Finish
              </button>
              <button className="btn primary" onClick={() => finish(true)} data-autofocus={undefined}>
                Finish and take the tour
              </button>
            </span>
          ) : (
            <button className="btn primary" onClick={() => setStep((n) => n + 1)} data-autofocus={step === 0 || undefined}>
              Next <Icon.arrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface TourStep {
  title: string;
  text: string;
  app?: AppId;
  props?: Record<string, unknown>;
  event?: string;
}

export const TOUR: TourStep[] = [
  { title: 'Boot experience', text: 'Every boot stage you saw did real work — opening storage, mounting the filesystem, starting simulated services, running diagnostics — and is recorded in the journal. Firmware and service stages are labelled as simulated.', app: 'events', props: { source: 'boot', level: '' } },
  { title: 'Desktop overview', text: 'The top bar shows workspaces, status indicators and quick settings. The dock holds your favourite apps; right-click anything for its menu. Alt+1…4 switches workspaces.' },
  { title: 'Application launcher', text: 'All applications by category, with favourites and recently used apps. Open it with Alt+Space; Ctrl+K opens the command palette for actions and files.', event: 'pyxis:launcher' },
  { title: 'File Explorer', text: 'A virtual filesystem stored in your browser. Create, rename, copy, move, delete to the Trash and restore. Everything is shared with the terminal and editor.', app: 'files' },
  { title: 'Terminal', text: 'psh supports pipes, redirection and history. Try “ls”, “sysinfo”, “services”, “ps” or “doctor”. It only runs built-in commands — never commands on your computer.', app: 'terminal' },
  { title: 'System Doctor', text: 'Each check explains what it inspected, why it matters, the evidence and how to fix it. Remediations run through the same permission checks as everything else.', app: 'doctor' },
  { title: 'System Information', text: 'Project identity, build, runtime and browser environment — with every value labelled as project metadata, live browser data or simulation.', app: 'sysinfo' },
  { title: 'Architecture Explorer', text: 'An interactive map of PyxisOS components, showing what this web build implements and what belongs to the native system.', app: 'architecture' },
  { title: 'Browser', text: 'Pyxis Browser searches with DuckDuckGo and Wikipedia and embeds pages that allow it. Sites that forbid embedding open in a real browser tab instead.', app: 'browser' },
  { title: 'That’s the tour', text: 'Explore the Service Manager, Aegis Security Center, Kernel & Boot Lab and Self-Test & Recovery from the launcher. Replay this tour from the command palette (“Start guided demo”).' },
];

/** Non-modal guided walkthrough docked in the corner. */
export function Tour({ onExit }: { onExit: () => void }) {
  const [i, setI] = useState(0);
  const step = TOUR[i];
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('pyxis:close-overlays'));
    if (step.app) wm.open(step.app, step.props ?? {});
    if (step.event) window.dispatchEvent(new CustomEvent(step.event));
  }, [i, step]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('.tour-next')?.focus({ preventScroll: true });
  }, [i]);

  const exit = () => {
    setUserFlag('tourDone', true);
    onExit();
  };

  return (
    <aside ref={ref} className="tour" role="dialog" aria-label="Guided demo" aria-live="polite" onKeyDown={(e) => e.key === 'Escape' && exit()}>
      <div className="tour-head">
        <span className="mono small muted">
          {i + 1} / {TOUR.length}
        </span>
        <button className="wc" aria-label="Exit guided demo" onClick={exit}>
          <Icon.close size={13} />
        </button>
      </div>
      <h3>{step.title}</h3>
      <p>{step.text}</p>
      <div className="tour-bar" role="progressbar" aria-valuemin={1} aria-valuemax={TOUR.length} aria-valuenow={i + 1}>
        <span style={{ width: `${((i + 1) / TOUR.length) * 100}%` }} />
      </div>
      <div className="tour-actions">
        <button className="btn ghost small" onClick={() => setI((n) => n - 1)} disabled={i === 0}>
          Back
        </button>
        {i < TOUR.length - 1 ? (
          <button className="btn primary small tour-next" onClick={() => setI((n) => n + 1)}>
            Next
          </button>
        ) : (
          <button className="btn primary small tour-next" onClick={exit}>
            Finish
          </button>
        )}
      </div>
    </aside>
  );
}
