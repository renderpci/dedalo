/**
 * DISCOVERY: systemd (spec §3.2 rows systemd, fapolicyd, Web, Web/FPM unit sandbox, Work
 * units). The texts are `systemctl --version`, `systemctl show <unit> -p …`
 * (UNIT_SHOW_PROPERTIES, exec_contract.ts) and `systemctl list-units --all --plain
 * --no-legend` (CANDIDATE_UNIT_PATTERNS).
 *
 * THE SANDBOX (§4.3 `host.unit_sandbox`, S6): a web or FPM unit whose ProtectHome= hides the
 * home trees, or whose InaccessiblePaths=/TemporaryFileSystem= cover a declared path, makes
 * that path unreachable to the web server or the v1 pool AFTER init acted. `sandboxHides`
 * names the reason, one sentence per directive; compare decides what it means for the layout.
 *
 * PURE, ZERO-DEPENDENCY (tests/provision_zero_dep.test.ts): ../types only.
 */
import type { UnitSandbox } from '../types';

/** `systemctl --version` → the number on its first line (`systemd 257 (257-23.el10_2.2)` → 257); null when unreadable. */
export function parseSystemdVersion(text: string): number | null {
  const match = /^systemd (\d+)\b/.exec(text.trimStart());
  return match ? Number(match[1]) : null;
}

/** `systemctl show -p …` → property → value. Repeated keys keep the last (systemctl prints each once). */
export function parseUnitShow(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.trim() === '') continue;
    const cut = line.indexOf('=');
    if (cut <= 0) throw new Error(`parse(systemd): show line is not <Property>=<value>: '${line.slice(0, 160)}'`);
    out.set(line.slice(0, cut), line.slice(cut + 1));
  }
  return out;
}

export interface ListedUnit {
  readonly unit: string;
  readonly load: string;
  readonly active: string;
  readonly sub: string;
}

/** `systemctl list-units --all --plain --no-legend` → `<unit> <load> <active> <sub> <description…>`. */
export function parseUnitList(text: string): ListedUnit[] {
  const out: ListedUnit[] = [];
  for (const raw of text.split('\n')) {
    // A leading status glyph (`●` for a not-found unit) appears even with --plain on some versions.
    const line = raw.replace(/^\s*[●*]\s*/, '').trim();
    if (line === '') continue;
    const fields = line.split(/\s+/);
    if (fields.length < 4) throw new Error(`parse(systemd): list-units line has fewer than 4 fields: '${line.slice(0, 160)}'`);
    const [unit, load, active, sub] = fields as [string, string, string, string];
    out.push(Object.freeze({ unit, load, active, sub }));
  }
  return out;
}

export interface ExecCommand {
  /** `path=` — the binary systemd executes. */
  readonly path: string;
  /** `argv[]=` split on spaces (systemd prints it unquoted). */
  readonly argv: readonly string[];
}

/**
 * The `ExecStart=` property: `{ path=/usr/bin/bun ; argv[]=/usr/bin/bun run src/index.ts ;
 * ignore_errors=no ; … }`, one braced record per command line. `[…]` blocks are dropped.
 */
export function parseExecStart(value: string): ExecCommand[] {
  const out: ExecCommand[] = [];
  for (const record of value.matchAll(/\{([^{}]*)\}/g)) {
    const fields = new Map<string, string>();
    for (const part of (record[1] as string).split(' ; ')) {
      const cut = part.indexOf('=');
      if (cut > 0) fields.set(part.slice(0, cut).trim(), part.slice(cut + 1).trim());
    }
    const path = fields.get('path');
    if (path === undefined) throw new Error(`parse(systemd): ExecStart record has no path=: '${(record[1] as string).slice(0, 160)}'`);
    out.push(Object.freeze({ path, argv: Object.freeze((fields.get('argv[]') ?? '').split(' ').filter(Boolean)) }));
  }
  return out;
}

/**
 * The `Environment=` property → name → value. systemctl prints the assignments separated by
 * spaces; an assignment holding a space is printed double-quoted (with `\"`, `\\` escapes).
 */
export function parseEnvironmentProp(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  const words: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < value.length; index++) {
    const char = value[index] as string;
    if (quoted && char === '\\' && index + 1 < value.length) {
      current += value[++index];
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ' ' && !quoted) {
      if (current !== '') words.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current !== '') words.push(current);
  for (const word of words) {
    const cut = word.indexOf('=');
    if (cut <= 0) throw new Error(`parse(systemd): Environment entry is not NAME=value: '${word.slice(0, 120)}'`);
    out[word.slice(0, cut)] = word.slice(cut + 1);
  }
  return out;
}

/** A path-list property (`InaccessiblePaths=-/home /srv`): the `-`/`+` prefixes and `:options` suffixes dropped. */
function pathList(value: string | undefined): string[] {
  return (value ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map(entry => entry.replace(/^[-+]+/, '').replace(/:.*$/, ''))
    .filter(entry => entry.startsWith('/'));
}

/** The sandbox properties of one `systemctl show` (the web unit's, an FPM unit's). */
export function unitSandbox(show: ReadonlyMap<string, string>): UnitSandbox {
  return Object.freeze({
    protectHome: show.get('ProtectHome') ?? 'no',
    protectSystem: show.get('ProtectSystem') ?? 'no',
    inaccessible: Object.freeze(pathList(show.get('InaccessiblePaths'))),
    readOnly: Object.freeze(pathList(show.get('ReadOnlyPaths'))),
    tmpfs: Object.freeze(pathList(show.get('TemporaryFileSystem'))),
  });
}

/** The trees ProtectHome= governs (systemd.exec(5)). */
const PROTECT_HOME_TREES = ['/home', '/root', '/run/user'];

function covers(dir: string, path: string): boolean {
  return dir === '/' || path === dir || path.startsWith(`${dir}/`);
}

/**
 * Why this unit cannot reach `path` (§4.3 `host.unit_sandbox`, S6): ProtectHome=yes|tmpfs
 * over a home tree; InaccessiblePaths= or TemporaryFileSystem= covering it; with `write`,
 * also ProtectHome=read-only, ReadOnlyPaths= and ProtectSystem=strict (everything but /dev,
 * /proc, /sys read-only) — unless a later ReadWritePaths= reopens it, which this does not
 * see (the reason then still names the directive the operator would check). Empty = reachable.
 */
export function sandboxHides(sandbox: UnitSandbox, path: string, write = false): string[] {
  const reasons: string[] = [];
  const inHome = PROTECT_HOME_TREES.some(tree => covers(tree, path));
  if (inHome && (sandbox.protectHome === 'yes' || sandbox.protectHome === 'tmpfs')) {
    reasons.push(`ProtectHome=${sandbox.protectHome} hides ${path}`);
  } else if (inHome && write && sandbox.protectHome === 'read-only') {
    reasons.push(`ProtectHome=read-only makes ${path} read-only`);
  }
  for (const dir of sandbox.inaccessible) if (covers(dir, path)) reasons.push(`InaccessiblePaths=${dir} hides ${path}`);
  for (const dir of sandbox.tmpfs) if (covers(dir, path)) reasons.push(`TemporaryFileSystem=${dir} empties ${path}`);
  if (write) {
    for (const dir of sandbox.readOnly) if (covers(dir, path)) reasons.push(`ReadOnlyPaths=${dir} makes ${path} read-only`);
    if (sandbox.protectSystem === 'strict') reasons.push(`ProtectSystem=strict makes ${path} read-only`);
  }
  return reasons;
}
