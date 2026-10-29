import { AppProps } from './types';
import { useStore } from '../core/store';
import { runtime } from '../core/system';
import { APPS } from '../core/apps';
import { diagnosticsStore } from '../core/diagnostics';
import { readStaticInfo } from '../core/metrics';
import { PROJECT, BUILD_DATE, BUILD_NAME, CHANNEL, CODENAME, LICENSE, OS_NAME, REPO_URL, SIM_KERNEL, VERSION } from '../core/version';
import { CAPABILITIES } from '../core/capabilities';
import { wm } from '../core/windows';
import { Badge, BadgeKind, useNow } from '../shell/ui';
import { PyxisMark } from '../shell/icons';

type Row = [label: string, value: string, kind: BadgeKind | 'PROJECT'];

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="card">
      <div className="card-head">
        <strong>{title}</strong>
      </div>
      <table className="table kv-table">
        <tbody>
          {rows.map(([k, v, kind]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td>{v}</td>
              <td className="right">{kind === 'PROJECT' ? <span className="badge badge-project" title="Project metadata from src/core/version.ts">PROJECT</span> : <Badge kind={kind} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** System Information Center. Values come from central metadata and are labelled by origin. */
export function SysInfoApp(_: AppProps) {
  const stages = useStore(runtime.stages);
  const report = useStore(diagnosticsStore);
  const now = useNow(5000);
  const info = readStaticInfo();
  const uptime = Math.floor((now - runtime.bootedAt) / 1000);
  const bootMs = stages.reduce((a, s) => a + (s.durationMs ?? 0), 0);

  return (
    <div className="app-scroll sysinfo">
      <div className="about-head">
        <PyxisMark size={48} />
        <div>
          <div className="eyebrow">
            {CODENAME} // {CHANNEL}
          </div>
          <h1>{OS_NAME}</h1>
          <div className="mono muted">
            {BUILD_NAME} {VERSION}
          </div>
        </div>
      </div>
      <p className="muted small">
        <span className="badge badge-project">PROJECT</span> metadata of the PyxisOS project · <Badge kind="LIVE" /> read from your browser now · <Badge kind="SIMULATED" /> produced by the simulation ·{' '}
        <Badge kind="UNAVAILABLE" /> not available in a browser
      </p>
      <div className="sysinfo-grid">
        <Section
          title="Project identity"
          rows={[
            ['Name', `${OS_NAME} — ${CODENAME} // ${CHANNEL}`, 'PROJECT'],
            ['Release', VERSION, 'PROJECT'],
            ['Build', `${BUILD_NAME} (${BUILD_DATE})`, 'PROJECT'],
            ['Architecture', PROJECT.architecture, 'PROJECT'],
            ['Kernel (native)', PROJECT.kernel, 'PROJECT'],
            ['License', LICENSE, 'PROJECT'],
            ['Source', REPO_URL, 'PROJECT'],
          ]}
        />
        <Section
          title="This web build"
          rows={[
            ['Desktop', 'Pyxis desktop shell (React)', 'LIVE'],
            ['Kernel label', `${SIM_KERNEL.name} ${SIM_KERNEL.release}`, 'SIMULATED'],
            ['Machine', SIM_KERNEL.machine, 'SIMULATED'],
            ['Native kernel link', 'Not connected', 'UNAVAILABLE'],
            ['Boot', `#${runtime.bootCount} · ${stages.length} stages in ${bootMs.toFixed(0)} ms${stages.some((s) => s.status === 'warn') ? ' (with warnings)' : ''}`, 'LIVE'],
            ['Uptime', `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`, 'LIVE'],
            ['Diagnostics', report ? `${report.summary.pass} pass, ${report.summary.warn} warn, ${report.summary.fail} fail, ${report.summary.skip} skip` : 'not run', 'LIVE'],
            ['Applications', `${APPS.length} registered`, 'LIVE'],
            ['Capabilities', `${Object.keys(CAPABILITIES).length} Aegis capability types`, 'SIMULATED'],
            ['Storage backend', runtime.storage.kind, 'LIVE'],
          ]}
        />
        <Section
          title="Browser environment"
          rows={[
            ['User agent', navigator.userAgent, 'LIVE'],
            ['Platform', info.platform, 'LIVE'],
            ['Language', navigator.language, 'LIVE'],
            ['Logical CPUs', info.logicalCores ? String(info.logicalCores) : 'not reported', info.logicalCores ? 'LIVE' : 'UNAVAILABLE'],
            ['Device memory', info.deviceMemoryGb ? `~${info.deviceMemoryGb} GiB (rounded by the browser)` : 'not reported', info.deviceMemoryGb ? 'LIVE' : 'UNAVAILABLE'],
            ['Screen', `${info.screen} @${info.pixelRatio}x`, 'LIVE'],
            ['Online', navigator.onLine ? 'yes' : 'no', 'LIVE'],
            ['Cookies enabled', navigator.cookieEnabled ? 'yes' : 'no', 'LIVE'],
          ]}
        />
        <section className="card">
          <div className="card-head">
            <strong>Documentation</strong>
          </div>
          <ul className="plain-list">
            <li>
              <a href={`${REPO_URL}#readme`} target="_blank" rel="noreferrer noopener">
                README — features, shortcuts, simulation boundaries
              </a>
            </li>
            <li>
              <a href={`${REPO_URL}/blob/main/IMPLEMENTATION_STATUS.md`} target="_blank" rel="noreferrer noopener">
                Implementation status and test results
              </a>
            </li>
            <li>
              <button className="linklike" onClick={() => wm.open('architecture')}>
                Architecture Explorer
              </button>{' '}
              ·{' '}
              <button className="linklike" onClick={() => wm.open('bootlab')}>
                Kernel & Boot Lab
              </button>{' '}
              ·{' '}
              <button className="linklike" onClick={() => wm.open('doctor')}>
                System Doctor
              </button>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
