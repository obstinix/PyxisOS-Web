import { useEffect, useMemo, useState } from 'react';
import { AppProps } from './types';
import { useStore } from '../core/store';
import { AGENTS, arbitrate, Evidence, PRIORITIES, Priority, Proposal, SCENARIOS, Target, TARGETS } from '../core/consensus';
import { isRunning, serviceRuntime } from '../core/services';
import { events } from '../core/events';
import { wm } from '../core/windows';
import { prefersReducedMotion, settingsStore } from '../core/settings';
import { Icon } from '../shell/icons';
import { Badge } from '../shell/ui';

const STEPS = ['Proposal submitted', 'Evidence attached', 'Security agent votes', 'Resource agent votes', 'Logic agent votes', 'Weighted score', 'Decision'];

/** Step-through visualizer for the ported deterministic Astral Consensus arbitrator. */
export function ConsensusApp(_: AppProps) {
  useStore(serviceRuntime);
  const settings = useStore(settingsStore);
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const [custom, setCustom] = useState<Proposal>({ ...SCENARIOS[0].proposal, id: 'prop-custom' });
  const [pressure, setPressure] = useState(false);
  const [offline, setOffline] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const daemon = isRunning('astral-consensusd');

  const scenario = SCENARIOS.find((s) => s.id === scenarioId);
  const proposal = scenario ? scenario.proposal : custom;
  const evidence: Evidence[] = useMemo(
    () => [
      ...(scenario ? scenario.evidence : []),
      ...(pressure && !scenario?.evidence.length ? [{ id: 'ev-manual', proposalId: proposal.id, provider: 'telemetry', category: 'ResourceConstraint' as const, summary: 'Injected: memory utilisation above 90%', confidence: 0.9 }] : []),
    ],
    [scenario, pressure, proposal.id],
  );
  const decision = useMemo(() => arbitrate(proposal, evidence, offline), [proposal, evidence, offline]);

  useEffect(() => {
    setStep(0);
    setPlaying(false);
  }, [scenarioId, custom, pressure, offline]);

  useEffect(() => {
    if (!playing) return;
    if (step >= STEPS.length - 1) {
      setPlaying(false);
      events.log('consensus', `${proposal.id}: ${decision.outcome} (score ${decision.score.toFixed(2)})`, decision.outcome === 'Accepted' ? 'success' : 'warn', {
        simulated: true,
        data: { proposal: proposal.id, outcome: decision.outcome },
      });
      return;
    }
    const t = setTimeout(() => setStep((s) => s + 1), prefersReducedMotion(settings) ? 150 : 700);
    return () => clearTimeout(t);
  }, [playing, step]);

  const play = () => {
    if (!daemon) return;
    setStep(0);
    setPlaying(true);
  };

  const shownVotes = decision.votes.filter((_, i) => step >= 2 + i);

  return (
    <div className="consensus">
      <div className="toolbar wrap">
        <select className="select" value={scenarioId} onChange={(e) => setScenarioId(e.target.value)} aria-label="Scenario">
          {SCENARIOS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
          <option value="custom">Custom proposal…</option>
        </select>
        <button className="btn primary small" onClick={play} disabled={!daemon || playing}>
          <Icon.play size={13} /> Run round
        </button>
        <button className="btn small" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={playing || step === 0}>
          Step back
        </button>
        <button className="btn small" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} disabled={!daemon || playing || step === STEPS.length - 1}>
          Step
        </button>
        <span className="toolbar-spacer" />
        <Badge kind="SIMULATED" title="Algorithm ported from PyxisOS native/consensus; inputs are demo proposals" />
      </div>
      {!daemon && (
        <div className="banner banner-warn small">
          The simulated <span className="mono">astral-consensusd</span> service is not running, so new rounds cannot start.{' '}
          <button className="linklike" onClick={() => wm.open('services')}>
            Open Service Manager
          </button>
        </div>
      )}
      <div className="consensus-body">
        <section className="consensus-input">
          <h4 className="section-title">Proposal</h4>
          {scenario ? (
            <dl className="kv small">
              <dt>ID</dt>
              <dd className="mono">{proposal.id}</dd>
              <dt>Target</dt>
              <dd>{proposal.target}</dd>
              <dt>Action</dt>
              <dd className="mono">{proposal.action}</dd>
              <dt>Priority</dt>
              <dd>{proposal.priority}</dd>
              <dt>Capability</dt>
              <dd className="mono">{proposal.requiredCapability}</dd>
              <dt>Parameters</dt>
              <dd className="mono">{proposal.parameters.map(([k, v]) => `${k}=${v}`).join(', ') || '—'}</dd>
            </dl>
          ) : (
            <div className="guide-form small">
              <label className="field">
                <span>Action</span>
                <input className="input" value={custom.action} onChange={(e) => setCustom({ ...custom, action: e.target.value.slice(0, 80) })} />
              </label>
              <label className="field">
                <span>Target subsystem</span>
                <select className="input" value={custom.target} onChange={(e) => setCustom({ ...custom, target: e.target.value as Target })}>
                  {TARGETS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Priority</span>
                <select className="input" value={custom.priority} onChange={(e) => setCustom({ ...custom, priority: e.target.value as Priority })}>
                  {PRIORITIES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Capability token</span>
                <input className="input" type="number" min={0} max={1000} value={custom.requiredCapability} onChange={(e) => setCustom({ ...custom, requiredCapability: Math.max(0, Math.min(1000, Number(e.target.value) || 0)) })} />
              </label>
              <label className="field">
                <span>alloc_pages</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={custom.parameters.find(([k]) => k === 'alloc_pages')?.[1] ?? ''}
                  onChange={(e) => setCustom({ ...custom, parameters: e.target.value ? [['alloc_pages', String(Math.max(0, Number(e.target.value) || 0))]] : [] })}
                />
              </label>
            </div>
          )}
          <h4 className="section-title">Failure scenarios</h4>
          <label className="check small">
            <input type="checkbox" checked={pressure || !!scenario?.evidence.length} disabled={!!scenario?.evidence.length} onChange={(e) => setPressure(e.target.checked)} /> Resource-pressure evidence
          </label>
          {AGENTS.map((a) => (
            <label key={a.id} className="check small">
              <input type="checkbox" checked={offline.includes(a.id)} onChange={(e) => setOffline((o) => (e.target.checked ? [...o, a.id] : o.filter((x) => x !== a.id)))} /> {a.name} offline
            </label>
          ))}
        </section>
        <section className="consensus-stage" aria-live="polite">
          <ol className="timeline">
            {STEPS.map((s, i) => (
              <li key={s} className={i < step ? 'done' : i === step ? 'current' : ''}>
                {s}
              </li>
            ))}
          </ol>
          <div className="agents">
            {AGENTS.map((a, i) => {
              const v = shownVotes[i];
              return (
                <div key={a.id} className={`agent-node${v ? ` voted stance-${v.stance}` : ''}`}>
                  <strong>{a.name}</strong>
                  <span className="muted small">
                    domain {a.domain}
                    {a.domain === proposal.target ? ' · weight 2.5×' : ' · weight 1×'}
                  </span>
                  {v ? (
                    <>
                      <span className="stance">
                        {v.stance} · {v.confidence.toFixed(2)}
                      </span>
                      <span className="small">{v.rationale}</span>
                      {v.conditions.length > 0 && <span className="mono small">if {v.conditions.join(', ')}</span>}
                    </>
                  ) : (
                    <span className="muted small">waiting…</span>
                  )}
                </div>
              );
            })}
          </div>
          {step >= 1 && (
            <div className="small">
              <strong>Evidence:</strong> {evidence.length ? evidence.map((e) => `${e.category} (${e.confidence}) — ${e.summary}`).join('; ') : 'none attached'}
            </div>
          )}
          {step >= 5 && (
            <div className="score">
              Weighted approval score <strong className="mono">{decision.score.toFixed(3)}</strong> · approvals {decision.approve} · rejections {decision.reject}
              {decision.conflict && <div className="danger-text small">{decision.conflictDetails}</div>}
            </div>
          )}
          {step >= 6 && (
            <div className={`decision outcome-${decision.outcome}`} role="status">
              <strong>{decision.outcome}</strong>
              <span className="small">{decision.securityVeto ? 'Security agent veto — rejected regardless of score.' : decision.rationale}</span>
            </div>
          )}
        </section>
        <aside className="consensus-log">
          <h4 className="section-title">Diagnostic output</h4>
          <pre className="mono small">
            {[
              `round ${proposal.id} target=${proposal.target} priority=${proposal.priority}`,
              ...(step >= 1 ? [`evidence: ${evidence.length} item(s)`] : []),
              ...shownVotes.map((v) => `vote ${v.agent.padEnd(8)} ${v.stance.padEnd(19)} conf=${v.confidence.toFixed(2)} w=${v.weight}`),
              ...(step >= 5 ? [`score=${decision.score.toFixed(3)} conflict=${decision.conflict}`] : []),
              ...(step >= 6 ? [`outcome=${decision.outcome}`] : []),
            ].join('\n')}
          </pre>
          <p className="muted small">
            Rules ported from <span className="mono">native/consensus/src/deterministic.rs</span>: domain weight 2.5×, conditional approvals count 0.8×, security reject is a veto, conflict = high-confidence (≥0.85) approve and reject; accepted when score ≥ 0.65 and approvals ≥ rejections.
          </p>
        </aside>
      </div>
    </div>
  );
}
