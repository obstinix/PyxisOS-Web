import { CommandContext, CommandRegistry, CommandSpec } from './shell';
import { parseFlags } from './parser';
import { displayPath } from '../core/path';
import { Entry } from '../core/vfs';
import { APPS, AppId, getApp } from '../core/apps';
import { runtime } from '../core/system';
import { runDiagnostics, CheckStatus } from '../core/diagnostics';
import { events } from '../core/events';
import { wm } from '../core/windows';
import { readStaticInfo } from '../core/metrics';
import { settingsStore } from '../core/settings';
import { BUILD_DATE, BUILD_NAME, CHANNEL, CODENAME, LICENSE, OS_NAME, REPO_URL, SIM_KERNEL, VERSION } from '../core/version';

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / 1048576).toFixed(1)} MiB`;
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m ${sec}s`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function fmtDate(t: number): string {
  const d = new Date(t);
  const mon = d.toLocaleString('en', { month: 'short' });
  return `${mon} ${String(d.getDate()).padStart(2)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Read input either from file operands or stdin. */
function readInputs(ctx: CommandContext, files: string[]): string | null {
  if (files.length === 0) {
    if (ctx.stdin === null) {
      ctx.err('missing file operand');
      return null;
    }
    return ctx.stdin;
  }
  const parts: string[] = [];
  for (const f of files) parts.push(ctx.fs.readFile(ctx.resolve(f)));
  return parts.join('');
}

function needArgs(ctx: CommandContext, n: number, usage: string): boolean {
  if (ctx.args.length < n) {
    ctx.err(`missing operand\nusage: ${usage}`);
    return false;
  }
  return true;
}

const statusTone: Record<CheckStatus, 'ok' | 'warn' | 'err' | 'muted'> = {
  pass: 'ok',
  warn: 'warn',
  fail: 'err',
  skip: 'muted',
};

const statusLabel: Record<CheckStatus, string> = { pass: 'PASS', warn: 'WARN', fail: 'FAIL', skip: 'SKIP' };

// ------------------------------------------------------------------ files

const ls: CommandSpec = {
  name: 'ls',
  summary: 'List directory contents',
  usage: 'ls [-l] [-a] [path...]',
  group: 'Files',
  run(ctx) {
    const { flags, rest } = parseFlags(ctx.args);
    const targets = rest.length ? rest : ['.'];
    let status = 0;
    targets.forEach((t, idx) => {
      const path = ctx.resolve(t);
      let entries: Entry[];
      try {
        const st = ctx.fs.stat(path);
        entries = st.type === 'dir' ? ctx.fs.list(path) : [st];
      } catch (e) {
        ctx.err(`cannot access '${t}': ${(e as Error).message.split(': ').pop()}`);
        status = 1;
        return;
      }
      if (!flags.has('a')) entries = entries.filter((e) => !e.name.startsWith('.'));
      if (targets.length > 1) ctx.out(`${t}:`, 'accent');
      if (flags.has('l')) {
        for (const e of entries) {
          const perms = (e.type === 'dir' ? 'd' : '-') + (e.readonly ? 'r--r--r--' : 'rw-r--r--');
          const size = e.type === 'dir' ? '-' : formatBytes(e.size);
          ctx.out(`${perms}  ${pad(size, 10)} ${fmtDate(e.mtime)}  ${e.name}${e.type === 'dir' ? '/' : ''}`);
        }
      } else if (entries.length) {
        ctx.out(entries.map((e) => (e.type === 'dir' ? e.name + '/' : e.name)).join('  '));
      }
      if (targets.length > 1 && idx < targets.length - 1) ctx.out('');
    });
    return status;
  },
};

const cd: CommandSpec = {
  name: 'cd',
  summary: 'Change the working directory',
  usage: 'cd [dir | - | ~]',
  group: 'Files',
  run(ctx) {
    const arg = ctx.args[0];
    const target = arg === undefined ? ctx.session.env.HOME : arg === '-' ? ctx.session.prevCwd : ctx.resolve(arg);
    if (!ctx.fs.exists(target)) {
      ctx.err(`${arg}: No such file or directory`);
      return 1;
    }
    if (!ctx.fs.isDir(target)) {
      ctx.err(`${arg}: Not a directory`);
      return 1;
    }
    ctx.session.prevCwd = ctx.session.cwd;
    ctx.session.cwd = target;
    if (arg === '-') ctx.out(displayPath(target));
    return 0;
  },
};

const pwd: CommandSpec = {
  name: 'pwd',
  summary: 'Print the working directory',
  usage: 'pwd',
  group: 'Files',
  run(ctx) {
    ctx.out(ctx.session.cwd);
  },
};

const cat: CommandSpec = {
  name: 'cat',
  summary: 'Print file contents',
  usage: 'cat [-n] <file...>',
  group: 'Files',
  run(ctx) {
    const { flags, rest } = parseFlags(ctx.args);
    let status = 0;
    const chunks: string[] = [];
    if (rest.length === 0) {
      if (ctx.stdin === null) {
        ctx.err('missing file operand\nusage: cat [-n] <file...>');
        return 1;
      }
      chunks.push(ctx.stdin);
    }
    for (const f of rest) {
      try {
        chunks.push(ctx.fs.readFile(ctx.resolve(f)));
      } catch (e) {
        ctx.err(`${f}: ${(e as Error).message.split(': ').pop()}`);
        status = 1;
      }
    }
    let text = chunks.join('');
    if (text.endsWith('\n')) text = text.slice(0, -1);
    if (!chunks.length) return status;
    if (flags.has('n')) text = text.split('\n').map((l, i) => `${String(i + 1).padStart(5)}  ${l}`).join('\n');
    ctx.out(text);
    return status;
  },
};

const mkdir: CommandSpec = {
  name: 'mkdir',
  summary: 'Create directories',
  usage: 'mkdir [-p] <dir...>',
  group: 'Files',
  run(ctx) {
    const { flags, rest } = parseFlags(ctx.args, { parents: 'p' });
    if (!rest.length) {
      ctx.err('missing operand\nusage: mkdir [-p] <dir...>');
      return 1;
    }
    let status = 0;
    for (const d of rest) {
      try {
        ctx.fs.mkdir(ctx.resolve(d), { parents: flags.has('p') });
      } catch (e) {
        ctx.err(`cannot create directory '${d}': ${(e as Error).message.split(': ').pop()}`);
        status = 1;
      }
    }
    return status;
  },
};

const touch: CommandSpec = {
  name: 'touch',
  summary: 'Create files or update timestamps',
  usage: 'touch <file...>',
  group: 'Files',
  run(ctx) {
    if (!needArgs(ctx, 1, this.usage)) return 1;
    let status = 0;
    for (const f of ctx.args) {
      try {
        ctx.fs.touch(ctx.resolve(f));
      } catch (e) {
        ctx.err(`cannot touch '${f}': ${(e as Error).message.split(': ').pop()}`);
        status = 1;
      }
    }
    return status;
  },
};

const rm: CommandSpec = {
  name: 'rm',
  summary: 'Remove files or directories',
  usage: 'rm [-r] [-f] <path...>',
  group: 'Files',
  run(ctx) {
    const { flags, rest } = parseFlags(ctx.args, { recursive: 'r', force: 'f' });
    const recursive = flags.has('r') || flags.has('R');
    if (!rest.length) {
      if (flags.has('f')) return 0;
      ctx.err('missing operand\nusage: rm [-r] [-f] <path...>');
      return 1;
    }
    let status = 0;
    for (const p of rest) {
      const path = ctx.resolve(p);
      try {
        if (!ctx.fs.exists(path)) {
          if (flags.has('f')) continue;
          throw new Error('No such file or directory');
        }
        if (ctx.fs.isDir(path) && !recursive) throw new Error('Is a directory (use -r)');
        ctx.fs.remove(path, { recursive });
      } catch (e) {
        ctx.err(`cannot remove '${p}': ${(e as Error).message.split(': ').pop()}`);
        status = 1;
      }
    }
    return status;
  },
};

const rmdir: CommandSpec = {
  name: 'rmdir',
  summary: 'Remove empty directories',
  usage: 'rmdir <dir...>',
  group: 'Files',
  run(ctx) {
    if (!needArgs(ctx, 1, this.usage)) return 1;
    let status = 0;
    for (const d of ctx.args) {
      const path = ctx.resolve(d);
      try {
        if (!ctx.fs.isDir(path)) throw new Error(ctx.fs.exists(path) ? 'Not a directory' : 'No such file or directory');
        ctx.fs.remove(path);
      } catch (e) {
        ctx.err(`failed to remove '${d}': ${(e as Error).message.split(': ').pop()}`);
        status = 1;
      }
    }
    return status;
  },
};

function copyOrMove(ctx: CommandContext, mode: 'cp' | 'mv'): number {
  const { flags, rest } = parseFlags(ctx.args, { recursive: 'r' });
  if (rest.length < 2) {
    ctx.err(`missing destination operand\nusage: ${mode === 'cp' ? 'cp [-r] <src...> <dest>' : 'mv <src...> <dest>'}`);
    return 1;
  }
  const dest = ctx.resolve(rest[rest.length - 1]);
  const sources = rest.slice(0, -1);
  if (sources.length > 1 && !ctx.fs.isDir(dest)) {
    ctx.err(`target '${rest[rest.length - 1]}' is not a directory`);
    return 1;
  }
  let status = 0;
  for (const s of sources) {
    try {
      if (mode === 'cp') ctx.fs.copy(ctx.resolve(s), dest, { recursive: flags.has('r') || flags.has('R') });
      else ctx.fs.move(ctx.resolve(s), dest);
    } catch (e) {
      ctx.err(`cannot ${mode === 'cp' ? 'copy' : 'move'} '${s}': ${(e as Error).message.split(': ').pop()}`);
      status = 1;
    }
  }
  return status;
}

const cp: CommandSpec = {
  name: 'cp',
  summary: 'Copy files and directories',
  usage: 'cp [-r] <src...> <dest>',
  group: 'Files',
  run: (ctx) => copyOrMove(ctx, 'cp'),
};

const mv: CommandSpec = {
  name: 'mv',
  summary: 'Move or rename files',
  usage: 'mv <src...> <dest>',
  group: 'Files',
  run: (ctx) => copyOrMove(ctx, 'mv'),
};

const tree: CommandSpec = {
  name: 'tree',
  summary: 'Show a directory tree',
  usage: 'tree [path]',
  group: 'Files',
  run(ctx) {
    const root = ctx.resolve(ctx.args[0] ?? '.');
    if (!ctx.fs.isDir(root)) {
      ctx.err(`${ctx.args[0] ?? '.'}: Not a directory`);
      return 1;
    }
    const lines: string[] = [displayPath(root)];
    let dirs = 0;
    let files = 0;
    const walk = (path: string, prefix: string, depth: number) => {
      const entries = ctx.fs.list(path);
      entries.forEach((e, i) => {
        const last = i === entries.length - 1;
        lines.push(`${prefix}${last ? '└── ' : '├── '}${e.name}${e.type === 'dir' ? '/' : ''}`);
        if (e.type === 'dir') {
          dirs++;
          if (depth < 8) walk(e.path, prefix + (last ? '    ' : '│   '), depth + 1);
        } else files++;
      });
    };
    walk(root, '', 0);
    lines.push('', `${dirs} directories, ${files} files`);
    ctx.out(lines.join('\n'));
  },
};

const find: CommandSpec = {
  name: 'find',
  summary: 'Search for files by name (and content with -c)',
  usage: 'find [path] <query> [-c]',
  group: 'Files',
  run(ctx) {
    const { flags, rest } = parseFlags(ctx.args);
    if (!rest.length) {
      ctx.err(`missing query\nusage: ${this.usage}`);
      return 1;
    }
    const [root, query] = rest.length > 1 ? [ctx.resolve(rest[0]), rest[1]] : [ctx.session.cwd, rest[0]];
    const results = ctx.fs.search(query, root, { content: flags.has('c') });
    if (!results.length) {
      ctx.out(`no matches for '${query}'`, 'muted');
      return 1;
    }
    ctx.out(results.map((r) => displayPath(r.path) + (r.type === 'dir' ? '/' : '')).join('\n'));
  },
};

const stat: CommandSpec = {
  name: 'stat',
  summary: 'Show file metadata',
  usage: 'stat <path>',
  group: 'Files',
  run(ctx) {
    if (!needArgs(ctx, 1, this.usage)) return 1;
    const e = ctx.fs.stat(ctx.resolve(ctx.args[0]));
    ctx.out(
      [
        `  Path: ${e.path}`,
        `  Type: ${e.type === 'dir' ? 'directory' : 'regular file'}`,
        `  Size: ${e.type === 'dir' ? `${e.size} entries` : formatBytes(e.size)}`,
        `Access: ${e.readonly ? 'read-only' : 'read-write'}`,
        `Modify: ${new Date(e.mtime).toLocaleString()}`,
      ].join('\n'),
    );
  },
};

// ------------------------------------------------------------------ text

const echo: CommandSpec = {
  name: 'echo',
  summary: 'Print text',
  usage: 'echo [-n] [text...]',
  group: 'Text',
  run(ctx) {
    const args = ctx.args[0] === '-n' ? ctx.args.slice(1) : ctx.args;
    ctx.out(args.join(' '));
  },
};

const grep: CommandSpec = {
  name: 'grep',
  summary: 'Print lines matching a pattern',
  usage: 'grep [-i] [-n] [-v] <pattern> [file...]',
  group: 'Text',
  run(ctx) {
    const { flags, rest } = parseFlags(ctx.args);
    if (!rest.length) {
      ctx.err(`missing pattern\nusage: ${this.usage}`);
      return 2;
    }
    const [pattern, ...files] = rest;
    const input = readInputs(ctx, files);
    if (input === null) return 2;
    const needle = flags.has('i') ? pattern.toLowerCase() : pattern;
    const lines = input.replace(/\n$/, '').split('\n');
    const matches = lines
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => (flags.has('i') ? l.toLowerCase() : l).includes(needle) !== flags.has('v'));
    if (!matches.length) return 1;
    ctx.out(matches.map(({ l, i }) => (flags.has('n') ? `${i + 1}:${l}` : l)).join('\n'));
  },
};

function headTail(ctx: CommandContext, which: 'head' | 'tail'): number {
  let n = 10;
  const files: string[] = [];
  for (let i = 0; i < ctx.args.length; i++) {
    const a = ctx.args[i];
    if (a === '-n') n = parseInt(ctx.args[++i] ?? '', 10);
    else if (/^-\d+$/.test(a)) n = parseInt(a.slice(1), 10);
    else files.push(a);
  }
  if (!Number.isFinite(n) || n < 0) {
    ctx.err('invalid number of lines');
    return 1;
  }
  const input = readInputs(ctx, files);
  if (input === null) return 1;
  const lines = input.replace(/\n$/, '').split('\n');
  const slice = which === 'head' ? lines.slice(0, n) : lines.slice(Math.max(0, lines.length - n));
  ctx.out(slice.join('\n'));
  return 0;
}

const head: CommandSpec = {
  name: 'head',
  summary: 'Print the first lines of input',
  usage: 'head [-n N] [file...]',
  group: 'Text',
  run: (ctx) => headTail(ctx, 'head'),
};

const tail: CommandSpec = {
  name: 'tail',
  summary: 'Print the last lines of input',
  usage: 'tail [-n N] [file...]',
  group: 'Text',
  run: (ctx) => headTail(ctx, 'tail'),
};

const wc: CommandSpec = {
  name: 'wc',
  summary: 'Count lines, words and bytes',
  usage: 'wc [file...]',
  group: 'Text',
  run(ctx) {
    const input = readInputs(ctx, ctx.args);
    if (input === null) return 1;
    const lines = input === '' ? 0 : input.split('\n').length - (input.endsWith('\n') ? 1 : 0);
    const words = input.split(/\s+/).filter(Boolean).length;
    const bytes = new TextEncoder().encode(input).length;
    ctx.out(`${String(lines).padStart(7)} ${String(words).padStart(7)} ${String(bytes).padStart(7)}${ctx.args.length === 1 ? ' ' + ctx.args[0] : ''}`);
  },
};

const sort: CommandSpec = {
  name: 'sort',
  summary: 'Sort lines of input',
  usage: 'sort [-r] [file...]',
  group: 'Text',
  run(ctx) {
    const { flags, rest } = parseFlags(ctx.args);
    const input = readInputs(ctx, rest);
    if (input === null) return 1;
    const lines = input.replace(/\n$/, '').split('\n').sort((a, b) => a.localeCompare(b));
    if (flags.has('r')) lines.reverse();
    ctx.out(lines.join('\n'));
  },
};

// ------------------------------------------------------------------ shell

const help: CommandSpec = {
  name: 'help',
  summary: 'List available commands',
  usage: 'help [command]',
  group: 'Shell',
  run(ctx) {
    const reg = ctx.session.registry;
    if (ctx.args[0]) {
      const spec = reg.get(ctx.args[0]);
      if (!spec) {
        ctx.err(`no help for '${ctx.args[0]}'`);
        return 1;
      }
      ctx.out(`${spec.name} — ${spec.summary}`, 'accent');
      ctx.out(`usage: ${spec.usage}`);
      return 0;
    }
    ctx.out('Pyxis shell (psh) — commands operate on the virtual filesystem and simulation runtime.', 'muted');
    const groups = ['Files', 'Text', 'Shell', 'System', 'PyxisOS'] as const;
    for (const g of groups) {
      const specs = reg.list().filter((s) => s.group === g);
      if (!specs.length) continue;
      ctx.out('');
      ctx.out(g.toUpperCase(), 'accent');
      ctx.out(specs.map((s) => `  ${pad(s.name, 10)} ${s.summary}`).join('\n'));
    }
    ctx.out('');
    ctx.out("Operators: |  >  >>  ;  &&     Keys: ↑/↓ history · Tab complete · Ctrl+L clear · Ctrl+C cancel line", 'muted');
    ctx.out("Run 'help <command>' for usage.", 'muted');
  },
};

const clear: CommandSpec = {
  name: 'clear',
  summary: 'Clear the terminal screen',
  usage: 'clear',
  group: 'Shell',
  run(ctx) {
    ctx.host.clear();
  },
};

const history: CommandSpec = {
  name: 'history',
  summary: 'Show command history (-c to clear)',
  usage: 'history [-c] [N]',
  group: 'Shell',
  run(ctx) {
    if (ctx.args[0] === '-c') {
      ctx.session.history = [];
      return 0;
    }
    const n = ctx.args[0] ? parseInt(ctx.args[0], 10) : ctx.session.history.length;
    const start = Math.max(0, ctx.session.history.length - (Number.isFinite(n) ? n : 0));
    ctx.out(
      ctx.session.history
        .slice(start)
        .map((h, i) => `${String(start + i + 1).padStart(5)}  ${h}`)
        .join('\n'),
    );
  },
};

const env: CommandSpec = {
  name: 'env',
  summary: 'Show environment variables',
  usage: 'env',
  group: 'Shell',
  run(ctx) {
    const e = { ...ctx.session.env, PWD: ctx.session.cwd };
    ctx.out(Object.entries(e).map(([k, v]) => `${k}=${v}`).join('\n'));
  },
};

const exportCmd: CommandSpec = {
  name: 'export',
  summary: 'Set an environment variable',
  usage: 'export NAME=value',
  group: 'Shell',
  run(ctx) {
    if (!needArgs(ctx, 1, this.usage)) return 1;
    for (const a of ctx.args) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(a);
      if (!m) {
        ctx.err(`'${a}': not a valid identifier`);
        return 1;
      }
      if (m[1] === 'HOME') {
        ctx.err('HOME is read-only in this simulation');
        return 1;
      }
      ctx.session.env[m[1]] = m[2];
    }
  },
};

const exit: CommandSpec = {
  name: 'exit',
  summary: 'Close this terminal window',
  usage: 'exit',
  group: 'Shell',
  run(ctx) {
    ctx.host.exit();
  },
};

// ------------------------------------------------------------------ system

const whoami: CommandSpec = {
  name: 'whoami',
  summary: 'Print the current user',
  usage: 'whoami',
  group: 'System',
  run(ctx) {
    ctx.out(ctx.session.env.USER);
  },
};

const hostname: CommandSpec = {
  name: 'hostname',
  summary: 'Print the simulated host name',
  usage: 'hostname',
  group: 'System',
  run(ctx) {
    ctx.out(ctx.session.env.HOSTNAME);
  },
};

const date: CommandSpec = {
  name: 'date',
  summary: 'Print the current date and time',
  usage: 'date [-u] [-I]',
  group: 'System',
  run(ctx) {
    const { flags } = parseFlags(ctx.args);
    const d = new Date();
    if (flags.has('I')) ctx.out(d.toISOString());
    else ctx.out(flags.has('u') ? d.toUTCString() : d.toString());
  },
};

const uptime: CommandSpec = {
  name: 'uptime',
  summary: 'Show session uptime',
  usage: 'uptime',
  group: 'System',
  run(ctx) {
    ctx.out(`up ${formatDuration(runtime.uptimeMs())}, ${wm.windows.length} window(s) open, ${events.total} events`);
  },
};

const uname: CommandSpec = {
  name: 'uname',
  summary: 'Print system information',
  usage: 'uname [-a] [-s] [-r] [-m] [-n]',
  group: 'System',
  run(ctx) {
    const { flags } = parseFlags(ctx.args, { all: 'a' });
    const all = flags.has('a');
    const parts: string[] = [];
    if (all || flags.has('s') || flags.size === 0) parts.push(OS_NAME);
    if (all || flags.has('n')) parts.push(ctx.session.env.HOSTNAME);
    if (all || flags.has('r')) parts.push(`${SIM_KERNEL.name}-${SIM_KERNEL.release}`);
    if (all || flags.has('v')) parts.push(`${CODENAME} ${CHANNEL} ${BUILD_DATE}`);
    if (all || flags.has('m')) parts.push(SIM_KERNEL.machine);
    ctx.out(parts.join(' '));
  },
};

const LOGO = [
  '      .-""""-.     ',
  "    .'  .--.  '.   ",
  '   /   /    \\   \\  ',
  '  |   |  ()  |   | ',
  '   \\   \\    /   /  ',
  "    '.  '--'  .'   ",
  "      '-....-'     ",
  '                   ',
];

const neofetch: CommandSpec = {
  name: 'neofetch',
  summary: 'Show a system summary',
  usage: 'neofetch',
  group: 'System',
  run(ctx) {
    const info = readStaticInfo();
    const s = settingsStore.get();
    const { files, dirs } = ctx.fs.counts();
    const rows: [string, string][] = [
      ['OS', `${OS_NAME} ${VERSION} ${CODENAME} // ${CHANNEL}`],
      ['Build', `${BUILD_NAME} (browser simulation)`],
      ['Kernel', `${SIM_KERNEL.name} ${SIM_KERNEL.release} [simulated]`],
      ['Uptime', formatDuration(runtime.uptimeMs())],
      ['Shell', 'psh 0.1'],
      ['Desktop', 'Lunar-Pyxis Shell'],
      ['Theme', `${s.theme} / ${s.accent}`],
      ['Apps', `${APPS.length} registered, ${wm.windows.length} open`],
      ['VFS', `${files} files, ${dirs} dirs, ${formatBytes(ctx.fs.totalBytes())}`],
      ['CPU', info.logicalCores ? `${info.logicalCores} logical cores [browser-reported]` : 'unavailable'],
      ['Memory', info.deviceMemoryGb ? `~${info.deviceMemoryGb} GiB [browser-reported, approximate]` : 'unavailable'],
    ];
    const user = `${ctx.session.env.USER}@${ctx.session.env.HOSTNAME}`;
    const right = [user, '-'.repeat(user.length), ...rows.map(([k, v]) => `${k}: ${v}`)];
    const height = Math.max(LOGO.length, right.length);
    const lines: string[] = [];
    for (let i = 0; i < height; i++) lines.push((LOGO[i] ?? ' '.repeat(LOGO[0].length)) + '  ' + (right[i] ?? ''));
    ctx.out(lines.join('\n'), 'accent');
  },
};

const open: CommandSpec = {
  name: 'open',
  summary: 'Open a file or launch an application',
  usage: 'open <file|app-id>',
  group: 'System',
  run(ctx) {
    if (!needArgs(ctx, 1, this.usage)) return 1;
    const target = ctx.args[0];
    const app = getApp(target);
    if (app && !ctx.fs.exists(ctx.resolve(target))) {
      ctx.host.openApp(app.id);
      ctx.out(`Launched ${app.name}`, 'muted');
      return 0;
    }
    const path = ctx.resolve(target);
    if (!ctx.fs.exists(path)) {
      ctx.err(`${target}: no such file or application (see 'pyxis apps')`);
      return 1;
    }
    if (ctx.fs.isDir(path)) ctx.host.openApp('files', { path });
    else ctx.host.openApp('editor', { path });
    return 0;
  },
};

const edit: CommandSpec = {
  name: 'edit',
  summary: 'Open a file in the Text Editor (creates it if missing)',
  usage: 'edit <file>',
  group: 'System',
  run(ctx) {
    if (!needArgs(ctx, 1, this.usage)) return 1;
    const path = ctx.resolve(ctx.args[0]);
    if (ctx.fs.isDir(path)) {
      ctx.err(`${ctx.args[0]}: Is a directory`);
      return 1;
    }
    if (!ctx.fs.exists(path)) ctx.fs.writeFile(path, '');
    ctx.host.openApp('editor', { path });
  },
};

// ------------------------------------------------------------------ pyxis

async function pyxisDoctor(ctx: CommandContext): Promise<number> {
  ctx.out('Running PyxisOS diagnostics…', 'muted');
  const report = await runDiagnostics();
  for (const r of report.results) {
    ctx.out(`  [${statusLabel[r.status]}] ${pad(r.name, 30)} ${r.detail}`, statusTone[r.status]);
  }
  const { pass, warn, fail, skip } = report.summary;
  ctx.out('');
  ctx.out(`${pass} passed · ${warn} warnings · ${fail} failed · ${skip} skipped (${report.results.length} checks executed in-browser)`, fail ? 'err' : warn ? 'warn' : 'ok');
  return fail ? 1 : 0;
}

const pyxis: CommandSpec = {
  name: 'pyxis',
  summary: 'PyxisOS system tool (info, doctor, status, runtime, hardware, apps)',
  usage: 'pyxis <--version | info | doctor | status | runtime | hardware | apps | open <app>>',
  group: 'PyxisOS',
  async run(ctx) {
    const sub = ctx.args[0];
    switch (sub) {
      case '--version':
      case '-v':
      case 'version':
        ctx.out(`${OS_NAME} ${VERSION} (${CODENAME} // ${CHANNEL}) — ${BUILD_NAME} build ${BUILD_DATE}`);
        return 0;
      case 'info': {
        const rows: [string, string][] = [
          ['Name', `${OS_NAME} — ${CODENAME} // ${CHANNEL}`],
          ['Version', VERSION],
          ['Build', `${BUILD_NAME} ${BUILD_DATE}`],
          ['Environment', 'Browser-based simulation of the PyxisOS desktop'],
          ['Kernel', `${SIM_KERNEL.name} ${SIM_KERNEL.release} [SIMULATED — native kernel not running]`],
          ['Storage', `${runtime.storage.kind} [LIVE]`],
          ['License', LICENSE],
          ['Source', REPO_URL],
        ];
        ctx.out(rows.map(([k, v]) => `${pad(k, 13)}${v}`).join('\n'));
        return 0;
      }
      case 'doctor':
        return pyxisDoctor(ctx);
      case 'status': {
        const p = runtime.persistence.get();
        const { files, dirs } = ctx.fs.counts();
        const lines: [string, string, 'ok' | 'warn' | 'err' | 'muted'][] = [
          ['desktop-shell', 'running', 'ok'],
          ['window-manager', `running · ${wm.windows.length} window(s)`, 'ok'],
          ['vfs', `mounted · ${files} files, ${dirs} dirs`, 'ok'],
          ['persistence', p.lastError ? `error · ${p.lastError}` : `${p.backend} · ${p.saves} saves`, p.lastError ? 'err' : p.backend === 'memory' ? 'warn' : 'ok'],
          ['event-journal', `running · ${events.total} events`, 'ok'],
          ['notifications', settingsStore.get().notifications ? 'enabled' : 'muted by user', 'ok'],
          ['lunar-core', 'not available in browser build', 'muted'],
          ['astral-consensus', 'not implemented (planned)', 'muted'],
        ];
        ctx.out(`${pad('SERVICE', 18)}STATE`, 'muted');
        for (const [name, state, tone] of lines) ctx.out(`${pad(name, 18)}${state}`, tone);
        return 0;
      }
      case 'runtime': {
        const mem = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
        const rows: [string, string][] = [
          ['Uptime', `${formatDuration(runtime.uptimeMs())} [LIVE]`],
          ['Boot count', `${runtime.bootCount} [LIVE, stored in browser]`],
          ['Windows open', String(wm.windows.length)],
          ['Events', String(events.total)],
          ['JS heap', mem ? `${formatBytes(mem.usedJSHeapSize)} of ${formatBytes(mem.jsHeapSizeLimit)} [LIVE]` : 'UNAVAILABLE in this browser'],
          ['Storage', `${runtime.storage.kind}`],
          ['VFS size', formatBytes(ctx.fs.totalBytes())],
          ['Scheduler', `${SIM_KERNEL.name} cooperative JS event loop [SIMULATED label]`],
        ];
        ctx.out(rows.map(([k, v]) => `${pad(k, 14)}${v}`).join('\n'));
        return 0;
      }
      case 'hardware': {
        const info = readStaticInfo();
        const rows: [string, string][] = [
          ['Logical CPUs', info.logicalCores ? `${info.logicalCores} [LIVE, navigator.hardwareConcurrency]` : 'UNAVAILABLE'],
          ['Device memory', info.deviceMemoryGb ? `~${info.deviceMemoryGb} GiB [LIVE, rounded by browser]` : 'UNAVAILABLE in this browser'],
          ['Display', `${info.screen} @${info.pixelRatio}x [LIVE]`],
          ['Platform', `${info.platform} [LIVE]`],
          ['Machine', `${SIM_KERNEL.machine} [SIMULATED]`],
          ['Devices', 'No physical device access — browsers sandbox hardware [NOT IMPLEMENTED]'],
        ];
        ctx.out(rows.map(([k, v]) => `${pad(k, 15)}${v}`).join('\n'));
        return 0;
      }
      case 'apps': {
        ctx.out(`${pad('ID', 16)}${pad('NAME', 24)}STATE`, 'muted');
        for (const a of APPS) {
          const open = wm.windows.filter((w) => w.appId === a.id).length;
          ctx.out(`${pad(a.id, 16)}${pad(a.name, 24)}${open ? `running (${open})` : 'available'}`, open ? 'ok' : 'out');
        }
        ctx.out(`\n${APPS.length} applications registered. Launch with 'pyxis open <id>'.`, 'muted');
        return 0;
      }
      case 'open': {
        const id = ctx.args[1];
        const app = id ? getApp(id) : undefined;
        if (!app) {
          ctx.err(`unknown app '${id ?? ''}' — see 'pyxis apps'`);
          return 1;
        }
        ctx.host.openApp(app.id as AppId);
        return 0;
      }
      case undefined:
      case 'help':
      case '--help':
        ctx.out(`usage: ${this.usage}`);
        ctx.out(
          [
            '  --version   Print version',
            '  info        Project and build identity',
            '  doctor      Run in-browser diagnostics',
            '  status      Service status',
            '  runtime     Runtime metrics',
            '  hardware    Browser-reported hardware information',
            '  apps        Registered applications',
            '  open <id>   Launch an application',
          ].join('\n'),
          'muted',
        );
        return sub === undefined ? 1 : 0;
      default:
        ctx.err(`unknown subcommand '${sub}' (try 'pyxis help')`);
        return 1;
    }
  },
};

export function createRegistry(): CommandRegistry {
  const reg = new CommandRegistry();
  [ls, cd, pwd, cat, mkdir, touch, rm, rmdir, cp, mv, tree, find, stat].forEach((c) => reg.register(c));
  [echo, grep, head, tail, wc, sort].forEach((c) => reg.register(c));
  [help, clear, history, env, exportCmd, exit].forEach((c) => reg.register(c));
  [whoami, hostname, date, uptime, uname, neofetch, open].forEach((c) => reg.register(c));
  reg.register(edit, ['nano', 'vi']);
  reg.register(pyxis);
  return reg;
}

