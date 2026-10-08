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

/* ── the host-wide nginx media map (spec §13.3) ───────────────────────────────────── */

/**
 * THE HOST MAP GRAMMAR. nginx's http{}-level map defines `$dedalo_auth_key`,
 * `$dedalo_svg_disposition` and `$dedalo_svg_csp` ONCE per host, and ROOT loads it (the
 * root renderer src/rules/host_map_main.ts writes it, nginx's master parses it). So the
 * text an engine pushes (`rules.map`) is admitted only in the exact shape the engine's
 * buildNginxMap() renders (src/core/media/protection.ts): a leading comment block with ONE
 * `# config-hash:`, then exactly three `map` blocks with pinned sources and targets, the
 * pinned auth entry, one or more image-envelope prefixes of a fixed template, and the
 * quarantine entry and header values of ONE admitted pin set. No `include`, `hostnames`,
 * `volatile`, no other variable, no other value, no unquoted pattern: nothing that loads,
 * includes, logs or executes reaches root. Held to the engine by
 * test/unit/publication_host_rules_allowlist_tripwire.test.ts.
 */

/** One admitted set of the values the engine pins (svg_safety.ts), newest LAST, APPEND-ONLY. */
export interface NginxMapPins {
  /** The id a contribution carries (`pinsId`); never reused. */
  readonly id: string;
  /** The contribution grammar this pin set needs: a renderer refuses a higher one (map_contribution_newer). */
  readonly grammar: number;
  /** svgQuarantinePcre(). */
  readonly quarantine: string;
  /** SVG_QUARANTINE_DISPOSITION. */
  readonly disposition: string;
  /** SVG_ENVELOPE_CSP. */
  readonly envelopeCsp: string;
  /** SVG_QUARANTINE_CSP. */
  readonly quarantineCsp: string;
}

export const NGINX_MAP_PINS: readonly NginxMapPins[] = Object.freeze([
  Object.freeze({
    id: 'pins-1',
    grammar: 1,
    quarantine: '\\.(?:svg|xml|xsl|xslt)$',
    disposition: 'attachment',
    envelopeCsp:
      "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'none'; form-action 'none'; base-uri 'none'",
    quarantineCsp: "default-src 'none'; sandbox",
  }),
]);

/** The highest contribution grammar this code reads (and renders). */
export const MAP_GRAMMAR: number = Math.max(...NGINX_MAP_PINS.map(pins => pins.grammar));

/** The auth cookie the first map reads (protection.ts MEDIA_AUTH_COOKIE) and its pinned entries. */
export const MAP_AUTH_COOKIE = 'dedalo_media_auth';
export const MAP_AUTH_PATTERN = '~^(?<h>[a-f0-9]{128})$';
export const MAP_AUTH_INVALID = '_invalid_';
/** The three blocks, in order: [source, target]. */
export const MAP_BLOCKS = Object.freeze([
  Object.freeze([`$cookie_${MAP_AUTH_COOKIE}`, '$dedalo_auth_key'] as const),
  Object.freeze(['$uri', '$dedalo_svg_disposition'] as const),
  Object.freeze(['$uri', '$dedalo_svg_csp'] as const),
]);

/** One envelope path segment as imageEnvelopePcre writes it: `.` escaped as `\.`, nothing else escaped. */
const ENVELOPE_SEGMENT = '((?:[A-Za-z0-9_-]|\\\\\\.)+)';
/** The image-envelope PCRE template (svg_safety.ts imageEnvelopePcre): ^/dedalo/<mediaDir>/<imageFolder>/…svg/…\.svg$ */
const ENVELOPE_TEMPLATE = new RegExp(
  `^\\^/dedalo/${ENVELOPE_SEGMENT}/${ENVELOPE_SEGMENT}/\\(\\?:\\[\\^/\\]\\+/\\)\\*svg/\\(\\?:\\[\\^/\\]\\+/\\)\\*\\[\\^/\\]\\+\\\\\\.svg\\$$`,
);
const SEGMENT_MAX = 64;

/** Why `pattern` is not an image-envelope PCRE of the template, or null when it is. */
export function envelopeProblem(pattern: string): string | null {
  const match = ENVELOPE_TEMPLATE.exec(pattern);
  if (match === null) return 'not the image-envelope pattern (^/dedalo/<media dir>/<image folder>/…svg/…\\.svg$)';
  for (const raw of [match[1] ?? '', match[2] ?? '']) {
    const segment = raw.replace(/\\\./g, '.');
    if (segment.length > SEGMENT_MAX) return `a segment longer than ${SEGMENT_MAX} characters`;
    if (segment === '.' || segment === '..') return "a '.' or '..' segment";
  }
  return null;
}

/** The PCRE of one envelope, written exactly as the engine writes it (for the renderer and the tests). */
export function envelopePcre(mediaDir: string, imageFolder: string): string {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `^${escape(`/dedalo/${mediaDir}`)}/${escape(imageFolder)}/(?:[^/]+/)*svg/(?:[^/]+/)*[^/]+\\.svg$`;
}

const CONFIG_HASH_LINE = /^# config-hash: ([0-9a-f]{64})$/;

/**
 * The hash stamped in the text's LEADING comment block (consecutive `#` lines from line 1),
 * or null when there is none or more than one. A stamp further down is not a stamp: the
 * renderers write it on line 3, and accepting it anywhere would let one file carry a second,
 * contradicting claim. THE one definition: rules.apply (src/rules/apply.ts) re-exports it.
 */
export function stampedHash(text: string): string | null {
  const found: string[] = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('#')) break;
    const match = CONFIG_HASH_LINE.exec(line);
    if (match?.[1]) found.push(match[1]);
  }
  return found.length === 1 ? (found[0] ?? null) : null;
}

export interface ParsedNginxMap {
  readonly hash: string;
  /** The envelope PCREs, in file order (identical in the two SVG maps). */
  readonly envelopes: readonly string[];
  /** The NGINX_MAP_PINS id the quarantine entry and the header values match. */
  readonly pinsId: string;
}

interface MapLine {
  readonly line: number;
  readonly text: string;
}

const MAP_OPEN = /^map\s+(\S+)\s+(\S+)\s*\{$/;
const MAP_ENTRY = /^"([^"]*)"\s+("[^"]*"|\$h);$/;
const MAP_DEFAULT = /^default\s+("[^"]*");$/;

function firstWord(text: string): string {
  return text.split(/\s+/)[0] ?? text;
}

/** Each structural line of the body (comments and blank lines dropped), 1-based. */
function mapLines(text: string): MapLine[] {
  const out: MapLine[] = [];
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const trimmed = (lines[index] as string).trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    out.push({ line: index + 1, text: trimmed });
  }
  return out;
}

class MapRefused {
  constructor(readonly refusal: DirectiveRefusal) {}
}

function refuseAt(at: MapLine | undefined, why: string, fallbackLine: number): never {
  throw new MapRefused({ line: at?.line ?? fallbackLine, directive: at === undefined ? '(end)' : firstWord(at.text), why });
}

/** One `map <source> <target> {` … `}` block; returns its entries [pattern, value] and the default value. */
function readBlock(
  lines: readonly MapLine[],
  at: { i: number },
  source: string,
  target: string,
  lastLine: number,
): { entries: { line: MapLine; pattern: string; value: string }[]; fallback: string } {
  const open = lines[at.i];
  const head = open === undefined ? null : MAP_OPEN.exec(open.text);
  if (head === null) refuseAt(open, `expected 'map ${source} ${target} {'`, lastLine);
  if (head[1] !== source || head[2] !== target) refuseAt(open, `expected 'map ${source} ${target} {'`, lastLine);
  at.i++;
  const entries: { line: MapLine; pattern: string; value: string }[] = [];
  for (;;) {
    const current = lines[at.i];
    if (current === undefined) refuseAt(current, 'unclosed map block', lastLine);
    const fallback = MAP_DEFAULT.exec(current.text);
    if (fallback !== null) {
      at.i++;
      const close = lines[at.i];
      if (close?.text !== '}') refuseAt(close, "expected '}' after the default entry", lastLine);
      at.i++;
      return { entries, fallback: (fallback[1] as string).slice(1, -1) };
    }
    const entry = MAP_ENTRY.exec(current.text);
    if (entry === null) {
      refuseAt(current, 'not a map entry the host map may carry (a quoted "~pattern" and a quoted value)', lastLine);
    }
    const value = entry[2] as string;
    entries.push({ line: current, pattern: entry[1] as string, value: value === '$h' ? value : value.slice(1, -1) });
    at.i++;
  }
}

function pinsFor(quarantine: string, disposition: string): NginxMapPins | null {
  return NGINX_MAP_PINS.find(pins => pins.quarantine === quarantine && pins.disposition === disposition) ?? null;
}

function parseMapBody(text: string): ParsedNginxMap {
  const lastLine = text.split('\n').length;
  const hash = stampedHash(text);
  if (hash === null) {
    throw new MapRefused({
      line: 1,
      directive: '# config-hash',
      why: 'the map must carry exactly one `# config-hash: <64 hex>` line in its leading comment block',
    });
  }
  const lines = mapLines(text);
  const at = { i: 0 };
  const [authSource, authTarget] = MAP_BLOCKS[0] as readonly [string, string];
  const auth = readBlock(lines, at, authSource, authTarget, lastLine);
  const [only, extra] = auth.entries;
  if (only === undefined || extra !== undefined || only.pattern !== MAP_AUTH_PATTERN || only.value !== '$h') {
    refuseAt(extra?.line ?? only?.line, `the auth map takes exactly '"${MAP_AUTH_PATTERN}"  $h;'`, lastLine);
  }
  if (auth.fallback !== MAP_AUTH_INVALID) refuseAt(lines[at.i - 2], `the auth map's default is "${MAP_AUTH_INVALID}"`, lastLine);

  const [dispSource, dispTarget] = MAP_BLOCKS[1] as readonly [string, string];
  const disposition = readBlock(lines, at, dispSource, dispTarget, lastLine);
  const quarantine = disposition.entries.at(-1);
  const envelopes = disposition.entries.slice(0, -1);
  if (quarantine === undefined || envelopes.length === 0) {
    refuseAt(quarantine?.line ?? lines[at.i - 1], 'the SVG maps take one or more envelope entries, then the quarantine entry', lastLine);
  }
  const pins = pinsFor(quarantine.pattern.replace(/^~/, ''), quarantine.value);
  if (!quarantine.pattern.startsWith('~') || pins === null) {
    refuseAt(quarantine.line, 'the quarantine entry is not an admitted pin set (NGINX_MAP_PINS)', lastLine);
  }
  const seen = new Set<string>();
  for (const entry of envelopes) {
    const problem = entry.pattern.startsWith('~') ? envelopeProblem(entry.pattern.slice(1)) : 'not a ~regex';
    if (problem !== null) refuseAt(entry.line, `envelope entry: ${problem}`, lastLine);
    if (entry.value !== '') refuseAt(entry.line, 'an envelope entry\'s disposition value is ""', lastLine);
    if (seen.has(entry.pattern)) refuseAt(entry.line, 'a duplicate envelope entry', lastLine);
    seen.add(entry.pattern);
  }
  if (disposition.fallback !== '') refuseAt(lines[at.i - 2], 'the disposition default is ""', lastLine);

  const [cspSource, cspTarget] = MAP_BLOCKS[2] as readonly [string, string];
  const csp = readBlock(lines, at, cspSource, cspTarget, lastLine);
  if (csp.entries.length !== disposition.entries.length) {
    refuseAt(csp.entries[0]?.line ?? lines[at.i - 1], 'the CSP map must carry the same entries as the disposition map', lastLine);
  }
  for (let index = 0; index < csp.entries.length; index++) {
    const entry = csp.entries[index] as (typeof csp.entries)[number];
    const twin = disposition.entries[index] as (typeof csp.entries)[number];
    if (entry.pattern !== twin.pattern) {
      refuseAt(entry.line, 'the CSP map must list the same patterns in the same order as the disposition map', lastLine);
    }
    const want = index === csp.entries.length - 1 ? pins.quarantineCsp : pins.envelopeCsp;
    if (entry.value !== want) refuseAt(entry.line, `an unpinned CSP value (pin set ${pins.id})`, lastLine);
  }
  if (csp.fallback !== '') refuseAt(lines[at.i - 2], 'the CSP default is ""', lastLine);
  const trailing = lines[at.i];
  if (trailing !== undefined) refuseAt(trailing, 'nothing may follow the three map blocks', lastLine);
  return Object.freeze({ hash, envelopes: Object.freeze(envelopes.map(entry => entry.pattern.slice(1))), pinsId: pins.id });
}

/** The map, or the first line it may not carry. Imports nothing (root's renderer re-validates with it). */
export function parseNginxMap(text: string): ParsedNginxMap | DirectiveRefusal {
  if (text.includes('\0')) return { line: 1, directive: '(NUL)', why: 'the map contains a NUL byte' };
  if (text.includes('\r')) return { line: 1, directive: '(CR)', why: 'the map contains a carriage return (the engine writes LF only)' };
  try {
    return parseMapBody(text);
  } catch (error) {
    if (error instanceof MapRefused) return error.refusal;
    throw error;
  }
}

export function isMapRefusal(value: ParsedNginxMap | DirectiveRefusal): value is DirectiveRefusal {
  return 'why' in value;
}

/* ── the contribution (spec §13.3) ─────────────────────────────────────────────────── */

/** What an agent writes to `contrib/<instance>.json` and root re-validates: EXACTLY one envelope. */
export interface MapContribution {
  readonly v: 1;
  readonly grammar: number;
  readonly instance: string;
  readonly hash: string;
  readonly envelope: string;
  readonly pinsId: string;
}

export const CONTRIBUTION_INSTANCE = /^[a-z][a-z0-9_]{1,31}$/;
/** The root-seeded contribution (init's nginx_map_seed, §5.10): root-owned, used only while no real one exists. */
export const SEED_CONTRIBUTION = '_seed';
const HEX64 = /^[0-9a-f]{64}$/;

export function pinsById(id: string): NginxMapPins | null {
  return NGINX_MAP_PINS.find(pins => pins.id === id) ?? null;
}

/** The contribution a parsed push makes, or why it is none (a push carries exactly one envelope). */
export function contributionOf(parsed: ParsedNginxMap, instance: string): MapContribution | string {
  if (parsed.envelopes.length !== 1) return 'a contribution carries one envelope';
  const pins = pinsById(parsed.pinsId);
  if (pins === null) return 'an unknown pin set';
  return Object.freeze({
    v: 1,
    grammar: pins.grammar,
    instance,
    hash: parsed.hash,
    envelope: parsed.envelopes[0] as string,
    pinsId: pins.id,
  });
}

export type ContributionVerdict =
  | { readonly ok: true; readonly contribution: MapContribution }
  /** A grammar or pin set this code does not know: the WHOLE render is refused (never skipped). */
  | { readonly ok: false; readonly newer: true; readonly grammar: number; readonly pinsId: string }
  | { readonly ok: false; readonly newer: false; readonly why: string };

const CONTRIBUTION_KEYS = ['envelope', 'grammar', 'hash', 'instance', 'pinsId', 'v'];

/**
 * Root's re-validation of one contribution file's JSON, named `<name>.json`. A newer grammar
 * is judged BEFORE the shape (a newer grammar may carry a shape this code cannot read).
 */
export function judgeContribution(value: unknown, name: string): ContributionVerdict {
  const bad = (why: string): ContributionVerdict => ({ ok: false, newer: false, why });
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return bad('not a JSON object');
  const record = value as Record<string, unknown>;
  const { grammar, pinsId } = record;
  if (!Number.isSafeInteger(grammar) || (grammar as number) < 1) return bad('grammar is not a positive integer');
  if (typeof pinsId !== 'string' || !/^[a-z0-9-]{1,32}$/.test(pinsId)) return bad('pinsId is malformed');
  const pins = pinsById(pinsId);
  if ((grammar as number) > MAP_GRAMMAR || pins === null) {
    return { ok: false, newer: true, grammar: grammar as number, pinsId };
  }
  if (Object.keys(record).sort().join(',') !== CONTRIBUTION_KEYS.join(',')) return bad('unexpected or missing keys');
  if (record.v !== 1) return bad('v is not 1');
  if (record.instance !== name) return bad('instance does not name its own file');
  if (pins.grammar !== grammar) return bad('grammar does not match its pin set');
  if (typeof record.hash !== 'string' || !HEX64.test(record.hash)) return bad('hash is not 64 lowercase hex');
  if (typeof record.envelope !== 'string') return bad('envelope is not a string');
  const problem = envelopeProblem(record.envelope);
  if (problem !== null) return bad(`envelope: ${problem}`);
  return {
    ok: true,
    contribution: Object.freeze({
      v: 1,
      grammar: grammar as number,
      instance: name,
      hash: record.hash,
      envelope: record.envelope,
      pinsId,
    }),
  };
}
