import { useEffect, useMemo, useRef, useState } from 'react';
import { AppProps } from './types';
import { ShellSession, OutputBlock } from '../terminal/shell';
import { createRegistry } from '../terminal/commands';
import { runtime } from '../core/system';
import { wm } from '../core/windows';
import { displayPath } from '../core/path';
import { VERSION, CODENAME, CHANNEL } from '../core/version';

type Line =
  | { id: number; kind: 'prompt'; prompt: string; command: string }
  | { id: number; kind: 'block'; block: OutputBlock };

const MAX_LINES = 2000;
const registry = createRegistry();
let lineId = 0;

export function TerminalApp({ win }: AppProps) {
  const session = useMemo(() => new ShellSession(registry, () => runtime.fs), []);
  const [lines, setLines] = useState<Line[]>(() => [
    { id: lineId++, kind: 'block', block: { text: `${CODENAME} // ${CHANNEL} · psh ${VERSION}`, tone: 'accent' } },
    { id: lineId++, kind: 'block', block: { text: "Simulated shell over the virtual filesystem. Type 'help' to list commands.", tone: 'muted' } },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string[]>([]);
  const historyIndex = useRef<number | null>(null);
  const draft = useRef('');
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [cwd, setCwd] = useState(session.cwd);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, hint]);

  useEffect(() => {
    wm.setTitle(win.id, `Terminal — ${displayPath(cwd)}`);
  }, [cwd, win.id]);

  const append = (newLines: Line[]) =>
    setLines((prev) => {
      const next = prev.concat(newLines);
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
    });

  const promptText = () => {
    const p = session.prompt();
    return `${p.user}@${p.host}:${p.path}$`;
  };

  const run = async (command: string) => {
    const prompt = promptText();
    setHint([]);
    let cleared = false;
    const pending: Line[] = [{ id: lineId++, kind: 'prompt', prompt, command }];
    setBusy(true);
    await session.execute(
      command,
      {
        clear: () => {
          cleared = true;
          pending.length = 0;
        },
        openApp: (id, props) => wm.open(id, props),
        exit: () => wm.close(win.id),
      },
      (block) => pending.push({ id: lineId++, kind: 'block', block }),
    );
    if (cleared) setLines(pending);
    else append(pending);
    setCwd(session.cwd);
    setBusy(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (busy) return;
      const cmd = input;
      setInput('');
      historyIndex.current = null;
      void run(cmd);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const h = session.history;
      if (!h.length) return;
      if (historyIndex.current === null) {
        draft.current = input;
        historyIndex.current = h.length - 1;
      } else historyIndex.current = Math.max(0, historyIndex.current - 1);
      setInput(h[historyIndex.current]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const h = session.history;
      if (historyIndex.current === null) return;
      if (historyIndex.current >= h.length - 1) {
        historyIndex.current = null;
        setInput(draft.current);
      } else {
        historyIndex.current++;
        setInput(h[historyIndex.current]);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const { line, candidates } = session.complete(input);
      setInput(line);
      setHint(candidates);
    } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      setLines([]);
      setHint([]);
    } else if (e.ctrlKey && e.key.toLowerCase() === 'c' && !window.getSelection()?.toString()) {
      e.preventDefault();
      append([{ id: lineId++, kind: 'prompt', prompt: promptText(), command: input + '^C' }]);
      setInput('');
      historyIndex.current = null;
    } else if (e.ctrlKey && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      setInput('');
    }
  };

  const p = session.prompt();

  return (
    <div
      className="terminal"
      onMouseUp={() => {
        if (!window.getSelection()?.toString()) inputRef.current?.focus();
      }}
    >
      <div className="terminal-scroll" ref={scrollRef} role="log" aria-live="polite" aria-label="Terminal output">
        {lines.map((l) =>
          l.kind === 'prompt' ? (
            <div key={l.id} className="t-line">
              <span className="t-prompt">{l.prompt}</span> <span className="t-cmd">{l.command}</span>
            </div>
          ) : (
            <pre key={l.id} className={`t-line t-${l.block.tone}`}>
              {l.block.text}
            </pre>
          ),
        )}
        {hint.length > 0 && <pre className="t-line t-muted">{hint.join('  ')}</pre>}
        <div className="t-input-row">
          <label htmlFor={`term-${win.id}`} className="t-prompt">
            <span className="t-user">
              {p.user}@{p.host}
            </span>
            :<span className="t-path">{p.path}</span>$
          </label>
          <input
            id={`term-${win.id}`}
            ref={inputRef}
            className="t-input"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              historyIndex.current = null;
            }}
            onKeyDown={onKeyDown}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Terminal command input"
            disabled={busy}
          />
        </div>
      </div>
    </div>
  );
}
