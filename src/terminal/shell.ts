import { HOME, displayPath, resolvePath } from '../core/path';
import { VfsError, VirtualFS } from '../core/vfs';
import { AppId } from '../core/apps';
import { ParseError, parse } from './parser';

export type Tone = 'out' | 'err' | 'muted' | 'accent' | 'ok' | 'warn';

export interface OutputBlock {
  text: string;
  tone: Tone;
}

/** Host hooks the terminal UI provides to commands with side effects. */
export interface ShellHost {
  clear(): void;
  openApp(id: AppId, props?: Record<string, unknown>): void;
  exit(): void;
}

export interface CommandContext {
  argv: string[];
  args: string[];
  stdin: string | null;
  session: ShellSession;
  fs: VirtualFS;
  host: ShellHost;
  /** Write to stdout (redirectable/pipeable). */
  out(text: string, tone?: Tone): void;
  /** Write to stderr (always shown in the terminal). */
  err(text: string): void;
  resolve(path: string): string;
}

export interface CommandSpec {
  name: string;
  summary: string;
  usage: string;
  /** Category used to group `help` output. */
  group: 'Files' | 'Text' | 'System' | 'Shell' | 'PyxisOS';
  run(ctx: CommandContext): number | void | Promise<number | void>;
}

export class CommandRegistry {
  private commands = new Map<string, CommandSpec>();
  private aliases = new Map<string, string>();

  register(spec: CommandSpec, aliases: string[] = []): void {
    this.commands.set(spec.name, spec);
    aliases.forEach((a) => this.aliases.set(a, spec.name));
  }

  get(name: string): CommandSpec | undefined {
    return this.commands.get(this.aliases.get(name) ?? name);
  }

  list(): CommandSpec[] {
    return [...this.commands.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  names(): string[] {
    return [...this.commands.keys(), ...this.aliases.keys()].sort();
  }
}

const MAX_HISTORY = 500;

/**
 * One shell session per terminal window. Sessions share the filesystem but
 * keep their own working directory, environment and history.
 */
export class ShellSession {
  cwd = HOME;
  prevCwd = HOME;
  history: string[] = [];
  lastStatus = 0;
  env: Record<string, string>;
  startedAt = Date.now();

  constructor(
    readonly registry: CommandRegistry,
    private getFs: () => VirtualFS,
    user = 'pyxis',
  ) {
    this.env = { HOME, USER: user, SHELL: '/system/bin/psh', HOSTNAME: 'lunar-pyxis', TERM: 'pyxis-term' };
  }

  get fs(): VirtualFS {
    return this.getFs();
  }

  prompt(): { user: string; host: string; path: string } {
    return { user: this.env.USER, host: this.env.HOSTNAME, path: displayPath(this.cwd) };
  }

  private envForExpansion(): Record<string, string> {
    return { ...this.env, PWD: this.cwd, OLDPWD: this.prevCwd, '?': String(this.lastStatus) };
  }

  /** Execute a command line, streaming output blocks to `emit`. */
  async execute(line: string, host: ShellHost, emit: (b: OutputBlock) => void): Promise<number> {
    const trimmed = line.trim();
    if (!trimmed) return this.lastStatus;
    if (this.history[this.history.length - 1] !== trimmed) {
      this.history.push(trimmed);
      if (this.history.length > MAX_HISTORY) this.history.shift();
    }

    let pipelines;
    try {
      pipelines = parse(trimmed, this.envForExpansion());
    } catch (e) {
      emit({ text: `psh: ${e instanceof ParseError ? e.message : String(e)}`, tone: 'err' });
      return (this.lastStatus = 2);
    }

    let status = 0;
    for (const pipeline of pipelines) {
      if (pipeline.joiner === '&&' && status !== 0) continue;
      status = await this.runPipeline(pipeline.commands, host, emit);
      this.lastStatus = status;
    }
    return status;
  }

  private async runPipeline(
    commands: { argv: string[]; redirect?: { path: string; append: boolean } }[],
    host: ShellHost,
    emit: (b: OutputBlock) => void,
  ): Promise<number> {
    let stdin: string | null = null;
    let status = 0;
    for (let i = 0; i < commands.length; i++) {
      const { argv, redirect } = commands[i];
      const isLast = i === commands.length - 1;
      const captured: OutputBlock[] = [];
      const capture = !isLast || !!redirect;
      const spec = this.registry.get(argv[0]);
      if (!spec) {
        emit({ text: `psh: command not found: ${argv[0]}  (type 'help' for available commands)`, tone: 'err' });
        return 127;
      }
      const ctx: CommandContext = {
        argv,
        args: argv.slice(1),
        stdin,
        session: this,
        fs: this.fs,
        host,
        out: (text, tone = 'out') => (capture ? captured.push({ text, tone }) : emit({ text, tone })),
        err: (text) => emit({ text: `${argv[0]}: ${text}`, tone: 'err' }),
        resolve: (p) => resolvePath(p, this.cwd, this.env.HOME),
      };
      try {
        status = (await spec.run(ctx)) ?? 0;
      } catch (e) {
        if (e instanceof VfsError) ctx.err(e.message);
        else ctx.err(e instanceof Error ? e.message : String(e));
        status = 1;
      }
      const text = captured.map((b) => b.text).join('\n');
      if (redirect) {
        try {
          const target = ctx.resolve(redirect.path);
          const content = text.length ? text + '\n' : '';
          this.fs.writeFile(target, content, { append: redirect.append });
        } catch (e) {
          emit({ text: `psh: ${e instanceof Error ? e.message : String(e)}`, tone: 'err' });
          return 1;
        }
        stdin = '';
      } else {
        stdin = text;
      }
    }
    return status;
  }

  /** Tab completion: returns the completed line and any candidate list. */
  complete(line: string): { line: string; candidates: string[] } {
    const m = /(\S*)$/.exec(line)!;
    const partial = m[1];
    const before = line.slice(0, line.length - partial.length);
    const isCommand = before.trim() === '' || /(\||;|&&)\s*$/.test(before);
    let candidates: string[];
    let prefixDir = '';
    if (isCommand) {
      candidates = this.registry.names().filter((n) => n.startsWith(partial));
    } else {
      const slash = partial.lastIndexOf('/');
      prefixDir = slash >= 0 ? partial.slice(0, slash + 1) : '';
      const namePart = slash >= 0 ? partial.slice(slash + 1) : partial;
      const dir = resolvePath(prefixDir || '.', this.cwd, this.env.HOME);
      try {
        candidates = this.fs
          .list(dir)
          .filter((e) => e.name.startsWith(namePart))
          .map((e) => (e.type === 'dir' ? e.name + '/' : e.name));
      } catch {
        candidates = [];
      }
    }
    if (candidates.length === 0) return { line, candidates };
    if (candidates.length === 1) {
      const c = candidates[0];
      const suffix = isCommand || !c.endsWith('/') ? ' ' : '';
      return { line: before + prefixDir + quoteIfNeeded(c) + suffix, candidates: [] };
    }
    const common = candidates.reduce((a, b) => {
      let i = 0;
      while (i < a.length && a[i] === b[i]) i++;
      return a.slice(0, i);
    });
    return { line: before + prefixDir + common, candidates };
  }
}

function quoteIfNeeded(s: string): string {
  return /\s/.test(s) ? `"${s}"` : s;
}
