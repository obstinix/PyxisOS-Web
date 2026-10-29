import { useEffect, useRef, useState } from 'react';
import { AppProps } from './types';
import { approveProposal, askAstral, AstralAction, AstralProposal, AstralReply, dismissProposal } from '../core/astral';
import { wm } from '../core/windows';
import { Icon } from '../shell/icons';
import { Badge } from '../shell/ui';

type Msg = { id: number; from: 'user' | 'astral'; text: string[]; actions?: AstralAction[]; rule?: string; proposal?: AstralProposal };

const SUGGESTIONS = ['System status', 'Explain diagnostics', 'What should I do?', 'Open the system monitor', 'Show me the boot warnings', 'Change the wallpaper', 'What is Lunar Core?'];
let msgId = 1;

export function AstralApp(_: AppProps) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: msgId++,
      from: 'astral',
      text: [
        'Astral Intelligence — local mode.',
        'I answer with fixed rules over live session data (diagnostics, services, storage, windows) and can run allowlisted actions you ask for. No AI model or network request is used.',
      ],
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    setMessages((m) => [...m, { id: msgId++, from: 'user', text: [q] }]);
    setInput('');
    setBusy(true);
    let reply: AstralReply;
    try {
      reply = await askAstral(q);
    } catch (e) {
      reply = { rule: 'error', text: [`Something went wrong while reading system state: ${(e as Error).message}`] };
    }
    setMessages((m) => [...m, { id: msgId++, from: 'astral', text: reply.text, actions: reply.actions, rule: reply.rule, proposal: reply.proposal }]);
    setBusy(false);
    inputRef.current?.focus();
  };

  const settle = (msg: number, outcome: { ok: boolean; message: string }) =>
    setMessages((list) => list.map((m) => (m.id === msg && m.proposal ? { ...m, proposal: { ...m.proposal, outcome } } : m)));

  const act = (a: AstralAction) => {
    if (a.app) wm.open(a.app, a.props);
    else if (a.prompt) void ask(a.prompt);
  };

  return (
    <div className="astral">
      <div className="astral-head">
        <span className="row gap-2">
          <strong>Astral Intelligence</strong>
          <Badge kind="SIMULATED" title="Rule-based; no language model" />
        </span>
        <span className="muted small">Rule-based · offline · reads live session state</span>
      </div>
      <div className="astral-log app-scroll" ref={scrollRef} role="log" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={`msg msg-${m.from}`}>
            {m.text.map((t, i) => (
              <p key={i}>{t}</p>
            ))}
            {m.actions && (
              <div className="chip-row">
                {m.actions.map((a) => (
                  <button key={a.label} className="chip" onClick={() => act(a)}>
                    {a.label}
                  </button>
                ))}
              </div>
            )}
            {m.proposal && (
              <div className={`proposal${m.proposal.outcome ? (m.proposal.outcome.ok ? ' done' : ' failed') : ''}`}>
                <div className="small">
                  <strong>{m.proposal.outcome ? 'Action' : 'Proposed action'}:</strong> {m.proposal.title}
                  {m.proposal.capability && <span className="mono muted"> · needs {m.proposal.capability}</span>}
                  {m.proposal.destructive && <span className="danger-text"> · destructive</span>}
                </div>
                {m.proposal.outcome ? (
                  <div className="small">{m.proposal.outcome.ok ? '✓ ' : '✗ '}{m.proposal.outcome.message}</div>
                ) : (
                  <div className="row gap-2">
                    <button className="btn primary small" onClick={async () => settle(m.id, await approveProposal(m.proposal!))}>
                      Approve and run
                    </button>
                    <button
                      className="btn ghost small"
                      onClick={() => {
                        dismissProposal(m.proposal!);
                        settle(m.id, { ok: false, message: 'Dismissed — nothing was changed' });
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            )}
            {m.rule && <div className="msg-rule mono">rule: {m.rule}</div>}
          </div>
        ))}
        {busy && <div className="msg msg-astral muted">Reading system state…</div>}
      </div>
      <div className="chip-row astral-suggest">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="chip" onClick={() => void ask(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="astral-input"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <input ref={inputRef} className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question or give a command (e.g. “open the system monitor”)" aria-label="Ask Astral" autoFocus />
        <button className="btn primary" type="submit" disabled={busy || !input.trim()} aria-label="Ask">
          <Icon.send size={15} />
        </button>
      </form>
    </div>
  );
}
