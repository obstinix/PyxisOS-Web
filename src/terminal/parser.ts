/**
 * Shell parser. Supports single/double quotes, backslash escapes, `$VAR`
 * expansion (not inside single quotes), pipes `|`, output redirection `>` and
 * `>>`, and command lists joined with `;` or `&&`.
 */

export interface SimpleCommand {
  argv: string[];
  redirect?: { path: string; append: boolean };
}

export interface Pipeline {
  commands: SimpleCommand[];
  /** How this pipeline is joined to the previous one. */
  joiner: ';' | '&&' | null;
}

export class ParseError extends Error {}

type Token = { kind: 'word'; value: string } | { kind: 'op'; value: '|' | '>' | '>>' | ';' | '&&' };

export function tokenize(input: string, env: Record<string, string> = {}): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let word = '';
  let inWord = false;
  const push = () => {
    if (inWord) tokens.push({ kind: 'word', value: word });
    word = '';
    inWord = false;
  };
  const expand = (start: number): [string, number] => {
    // `start` points at the character after `$`.
    if (input[start] === '{') {
      const end = input.indexOf('}', start);
      if (end === -1) throw new ParseError('bad substitution: missing }');
      return [env[input.slice(start + 1, end)] ?? '', end + 1];
    }
    const m = /^[A-Za-z_][A-Za-z0-9_]*|^\?/.exec(input.slice(start));
    if (!m) return ['$', start];
    return [env[m[0]] ?? '', start + m[0].length];
  };

  while (i < input.length) {
    const c = input[i];
    if (c === ' ' || c === '\t' || c === '\n') {
      push();
      i++;
    } else if (c === "'") {
      const end = input.indexOf("'", i + 1);
      if (end === -1) throw new ParseError('unterminated single quote');
      word += input.slice(i + 1, end);
      inWord = true;
      i = end + 1;
    } else if (c === '"') {
      inWord = true;
      i++;
      while (i < input.length && input[i] !== '"') {
        if (input[i] === '\\' && i + 1 < input.length && '"\\$'.includes(input[i + 1])) {
          word += input[i + 1];
          i += 2;
        } else if (input[i] === '$') {
          const [val, next] = expand(i + 1);
          word += val;
          i = next;
        } else {
          word += input[i++];
        }
      }
      if (i >= input.length) throw new ParseError('unterminated double quote');
      i++;
    } else if (c === '\\') {
      if (i + 1 < input.length) {
        word += input[i + 1];
        inWord = true;
      }
      i += 2;
    } else if (c === '$') {
      const [val, next] = expand(i + 1);
      word += val;
      inWord = true;
      i = next;
    } else if (c === '|' || c === ';') {
      push();
      tokens.push({ kind: 'op', value: c });
      i++;
    } else if (c === '&' && input[i + 1] === '&') {
      push();
      tokens.push({ kind: 'op', value: '&&' });
      i += 2;
    } else if (c === '>') {
      push();
      if (input[i + 1] === '>') {
        tokens.push({ kind: 'op', value: '>>' });
        i += 2;
      } else {
        tokens.push({ kind: 'op', value: '>' });
        i++;
      }
    } else {
      word += c;
      inWord = true;
      i++;
    }
  }
  push();
  return tokens;
}

export function parse(input: string, env: Record<string, string> = {}): Pipeline[] {
  const tokens = tokenize(input, env);
  const pipelines: Pipeline[] = [];
  let current: Pipeline = { commands: [], joiner: null };
  let cmd: SimpleCommand = { argv: [] };

  const endCommand = () => {
    if (cmd.argv.length === 0) {
      if (cmd.redirect) throw new ParseError('missing command before redirection');
      return false;
    }
    current.commands.push(cmd);
    cmd = { argv: [] };
    return true;
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === 'word') {
      cmd.argv.push(t.value);
      continue;
    }
    switch (t.value) {
      case '>':
      case '>>': {
        const target = tokens[i + 1];
        if (!target || target.kind !== 'word') throw new ParseError(`syntax error near '${t.value}'`);
        cmd.redirect = { path: target.value, append: t.value === '>>' };
        i++;
        break;
      }
      case '|':
        if (!endCommand()) throw new ParseError("syntax error near '|'");
        if (!tokens[i + 1] || tokens[i + 1].kind !== 'word') throw new ParseError("syntax error near '|'");
        break;
      case ';':
      case '&&': {
        const had = endCommand();
        if (!had && current.commands.length === 0 && t.value === '&&') throw new ParseError("syntax error near '&&'");
        if (current.commands.length) pipelines.push(current);
        current = { commands: [], joiner: t.value };
        break;
      }
    }
  }
  endCommand();
  if (current.commands.length) pipelines.push(current);
  else if (current.joiner === '&&') throw new ParseError("syntax error: expected command after '&&'");
  return pipelines;
}

/** Split argv into flags (single-letter, combinable) and positional args. */
export function parseFlags(args: string[], longMap: Record<string, string> = {}): { flags: Set<string>; rest: string[] } {
  const flags = new Set<string>();
  const rest: string[] = [];
  let endOfFlags = false;
  for (const a of args) {
    if (endOfFlags || a === '-' || !a.startsWith('-')) {
      rest.push(a);
    } else if (a === '--') {
      endOfFlags = true;
    } else if (a.startsWith('--')) {
      flags.add(longMap[a.slice(2)] ?? a.slice(2));
    } else {
      for (const ch of a.slice(1)) flags.add(ch);
    }
  }
  return { flags, rest };
}
