/**
 * THE MEDIA-INCLUDE DIRECTIVE ALLOWLIST — what `rules.apply` lets reach the web server.
 *
 * WHY THIS EXISTS. The include is free text the paired engine renders and root PARSES:
 * the agent's one sudo grant runs `apachectl -t` / `nginx -t` as root over it, and the
 * polkit reload makes the root master process load it. A free-text include is therefore a
 * root door unless its directives are closed: Apache `LoadModule` (dlopen as root at -t),
 * `Include*` (reads any file as config), `ErrorLog`/`CustomLog "|cmd"` (piped loggers root
 * starts on reload); nginx `load_module`, `include`, `error_log`/`access_log` (files the
 * root master opens). The stamp check (D5) cannot close that: any caller can compute a
 * matching stamp. So the include may carry ONLY the directives phase 1's renderers emit
 * (src/core/media/publication_host_rules.ts), each with its value grammar, and every path
 * it names must sit inside MEDIA_ROOT. Anything else is refused BEFORE a byte is written
 * or a command runs.
 *
 * HELD TO THE ENGINE'S RENDERERS by test/unit/publication_host_rules_allowlist_tripwire.test.ts:
 * every include the engine can render passes; a renderer that grows a directive is red
 * there, never a production refusal.
 *
 * RESIDUAL TRUST (stated, spec §2.6): what passes runs at REQUEST time as the web-server
 * user (rewrite, headers, `<If>` expressions), which is the trust D5 already gives the
 * paired engine. Nothing that passes executes, loads or opens anything as root.
 *
 * ZERO-DEPENDENCY: imports nothing, so the root-repo tripwire can load it.
 */

export type RulesServer = 'apache' | 'nginx';

export interface DirectiveRefusal {
  /** 1-based line of the offending directive in the submitted text. */
  readonly line: number;
  readonly directive: string;
  readonly why: string;
}

type Check = (args: readonly string[], mediaRoot: string | null) => string | null;

/** A path the include names must be MEDIA_ROOT or inside it; with no MEDIA_ROOT, none may be named. */
function confined(path: string | undefined, mediaRoot: string | null): string | null {
  if (mediaRoot === null) return 'this host has no MEDIA_ROOT, so the include may name no path';
  if (path === undefined) return 'a path is required';
  if (path.split('/').some(segment => segment === '..' || segment === '.')) return `path '${path}' has a '.' or '..' segment`;
  return path === mediaRoot || path.startsWith(`${mediaRoot}/`) ? null : `path '${path}' is outside MEDIA_ROOT`;
}

const exactly =
  (count: number, why: string): Check =>
  args =>
    args.length === count ? null : why;

/* ── Apache ───────────────────────────────────────────────────────────────────────── */

const REWRITE_FLAGS = /^\[(?:L|NC|R=404)(?:,(?:L|NC|R=404))*\]$/;
const COND_FLAGS = /^\[(?:NC|OR)(?:,(?:NC|OR))*\]$/;
const MODULE_TEST = /^!?mod_[a-z0-9_]+\.c$/;

const APACHE_DIRECTIVES: Readonly<Record<string, Check>> = Object.freeze({
  alias: (args, root) => (args.length === 2 ? confined(args[1], root) : 'takes a URL and a path'),
  allowoverride: args => (args.length === 1 && args[0]?.toLowerCase() === 'none' ? null : "only 'AllowOverride None'"),
  require: args =>
    args.length === 2 && args[0] === 'all' && (args[1] === 'granted' || args[1] === 'denied')
      ? null
      : "only 'Require all granted|denied'",
  sethandler: args => (args.length === 1 && args[0]?.toLowerCase() === 'none' ? null : "only 'SetHandler none'"),
  addhandler: args =>
    args.length >= 2 && args[0] === 'default-handler' ? null : "only 'AddHandler default-handler <ext>...'",
  options: args =>
    args.length > 0 && args.every(arg => /^-[A-Za-z]+$/.test(arg)) ? null : 'only negative options (-Indexes, -ExecCGI)',
  header: args => (args.length >= 2 ? null : 'takes an action and a header'),
  rewriteengine: args => (args.length === 1 && /^(on|off)$/i.test(args[0] ?? '') ? null : "only 'RewriteEngine On|Off'"),
  rewritecond: args =>
    args.length === 2 || (args.length === 3 && COND_FLAGS.test(args[2] ?? '')) ? null : 'a test string, a pattern and [NC,OR] flags only',
  rewriterule: args =>
    (args.length === 2 || args.length === 3) && args[1] === '-' && (args.length === 2 || REWRITE_FLAGS.test(args[2] ?? ''))
      ? null
      : "substitution '-' and [L,NC,R=404] flags only (no proxy, no redirect target)",
});

const APACHE_SECTIONS: Readonly<Record<string, Check>> = Object.freeze({
  directory: (args, root) => (args.length === 1 ? confined(args[0], root) : 'takes one path'),
  filesmatch: exactly(1, 'takes one pattern'),
  ifmodule: args => (args.length === 1 && MODULE_TEST.test(args[0] ?? '') ? null : 'takes one [!]mod_<name>.c'),
  if: exactly(1, 'takes one quoted expression'),
});

/** Apache argument words: whitespace-separated, double quotes grouped and stripped. */
function apacheWords(text: string): string[] | null {
  const words: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i] as string;
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }
    if (ch === '"') {
      let word = '';
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < text.length) i++;
        word += text[i];
        i++;
      }
      if (i >= text.length) return null;
      i++;
      words.push(word);
      continue;
    }
    let word = '';
    while (i < text.length && text[i] !== ' ' && text[i] !== '\t') word += text[i++];
    words.push(word);
  }
  return words;
}

function refuseApache(text: string, mediaRoot: string | null): DirectiveRefusal | null {
  const open: string[] = [];
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = index + 1;
    const raw = (lines[index] as string).replace(/\r$/, '').trim();
    if (raw === '' || raw.startsWith('#')) continue;
    if (raw.endsWith('\\')) return { line, directive: '(continuation)', why: 'line continuations are not accepted' };
    if (raw.startsWith('</')) {
      const name = raw.slice(2).replace(/>$/, '').trim().toLowerCase();
      if (!raw.endsWith('>') || open.pop() !== name) return { line, directive: raw, why: 'unbalanced section' };
      continue;
    }
    const isSection = raw.startsWith('<');
    const body = isSection ? raw.slice(1).replace(/>$/, '') : raw;
    if (isSection && !raw.endsWith('>')) return { line, directive: raw, why: 'unterminated section' };
    const words = apacheWords(body);
    if (words === null || words.length === 0) return { line, directive: raw, why: 'unbalanced quote' };
    const [name = '', ...args] = words;
    const piped = args.find(arg => arg.startsWith('|'));
    if (piped !== undefined) return { line, directive: name, why: 'a value starting with | (a piped program) is never accepted' };
    const check = (isSection ? APACHE_SECTIONS : APACHE_DIRECTIVES)[name.toLowerCase()];
    if (check === undefined) {
      return { line, directive: name, why: `not a ${isSection ? 'section' : 'directive'} the media include may carry` };
    }
    const why = check(args, mediaRoot);
    if (why !== null) return { line, directive: name, why };
    if (isSection) open.push(name.toLowerCase());
  }
  return open.length === 0 ? null : { line: lines.length, directive: `<${open.at(-1)}>`, why: 'unclosed section' };
}

/* ── nginx ────────────────────────────────────────────────────────────────────────── */

interface NginxDirective {
  readonly block: boolean;
  readonly check: Check;
}

const NGINX_DIRECTIVES: Readonly<Record<string, NginxDirective>> = Object.freeze({
  location: { block: true, check: args => (args.length === 1 || args.length === 2 ? null : 'takes [modifier] uri') },
  if: { block: true, check: args => (args.length > 0 ? null : 'takes a condition') },
  return: { block: false, check: args => (args.length === 1 && /^\d{3}$/.test(args[0] ?? '') ? null : 'only a status code') },
  deny: { block: false, check: args => (args.length === 1 && args[0] === 'all' ? null : "only 'deny all'") },
  alias: { block: false, check: (args, root) => (args.length === 1 ? confined(args[0], root) : 'takes one path') },
  add_header: {
    block: false,
    check: args => (args.length === 2 || (args.length === 3 && args[2] === 'always') ? null : 'name value [always]'),
  },
  mp4: { block: false, check: exactly(0, 'takes no argument') },
});

type NginxToken = { readonly kind: 'word' | '{' | '}' | ';'; readonly text: string; readonly line: number };

function nginxTokens(text: string): NginxToken[] | DirectiveRefusal {
  const tokens: NginxToken[] = [];
  let line = 1;
  let i = 0;
  while (i < text.length) {
    const ch = text[i] as string;
    if (ch === '\n') {
      line++;
      i++;
    } else if (ch === ' ' || ch === '\t' || ch === '\r') {
      i++;
    } else if (ch === '#') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (ch === '{' || ch === '}' || ch === ';') {
      tokens.push({ kind: ch, text: ch, line });
      i++;
    } else if (ch === '"' || ch === "'") {
      const start = line;
      let word = '';
      i++;
      while (i < text.length && text[i] !== ch) {
        if (text[i] === '\\' && i + 1 < text.length) word += text[i++];
        if (text[i] === '\n') line++;
        word += text[i++];
      }
      if (i >= text.length) return { line: start, directive: '(quote)', why: 'unbalanced quote' };
      i++;
      tokens.push({ kind: 'word', text: word, line: start });
    } else {
      let word = '';
      while (i < text.length && !/[\s{};]/.test(text[i] as string)) {
        if (text[i] === '$' && text[i + 1] === '{') {
          const close = text.indexOf('}', i);
          if (close === -1) return { line, directive: '(variable)', why: 'unterminated ${variable}' };
          word += text.slice(i, close + 1);
          i = close + 1;
        } else {
          word += text[i++];
        }
      }
      tokens.push({ kind: 'word', text: word, line });
    }
  }
  return tokens;
}

function refuseNginx(text: string, mediaRoot: string | null): DirectiveRefusal | null {
  const tokens = nginxTokens(text);
  if (!Array.isArray(tokens)) return tokens;
  let depth = 0;
  let words: NginxToken[] = [];
  for (const token of tokens) {
    if (token.kind === 'word') {
      words.push(token);
      continue;
    }
    if (token.kind === '}') {
      if (words.length > 0 || depth === 0) return { line: token.line, directive: '}', why: 'unbalanced block' };
      depth--;
      continue;
    }
    const [head, ...rest] = words;
    if (head === undefined) return { line: token.line, directive: token.text, why: 'empty statement' };
    const rule = NGINX_DIRECTIVES[head.text];
    if (rule === undefined) return { line: head.line, directive: head.text, why: 'not a directive the media include may carry' };
    if (rule.block !== (token.kind === '{')) {
      return { line: head.line, directive: head.text, why: rule.block ? 'must open a block' : 'must not open a block' };
    }
    const why = rule.check(
      rest.map(word => word.text),
      mediaRoot,
    );
    if (why !== null) return { line: head.line, directive: head.text, why };
    if (token.kind === '{') depth++;
    words = [];
  }
  if (words.length > 0) return { line: words[0]?.line ?? 0, directive: words[0]?.text ?? '', why: 'statement without ;' };
  return depth === 0 ? null : { line: tokens.at(-1)?.line ?? 0, directive: '{', why: 'unclosed block' };
}

/** The first directive the include may not carry, or null when every one is allowed. */
export function refuseDirectives(server: RulesServer, text: string, mediaRoot: string | null): DirectiveRefusal | null {
  return server === 'apache' ? refuseApache(text, mediaRoot) : refuseNginx(text, mediaRoot);
}
