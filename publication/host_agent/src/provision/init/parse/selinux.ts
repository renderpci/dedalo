/**
 * DISCOVERY: SELinux (spec §3.2 rows SELinux mode/tools/root context/booleans/local rules/port
 * types/labels/store; S9). Every parser reads the text of ONE command or file; observe.ts runs
 * the command (provisionExec: selinuxMode, semanageLocal, semanagePortList, getsebool,
 * selinuxLabel, restorecon -n) and never stores the raw text.
 *
 * A malformed line THROWS (named): a half-read rule list would let compare call a port
 * "untyped" or a rule "missing" that is neither. An empty output is an empty list.
 *
 * PURE, ZERO-DEPENDENCY (tests/provision_zero_dep.test.ts): node: builtins, ../types and
 * ../../exec_contract (types) only.
 */
import type { ExecResult } from '../../exec_contract';
import type { SelinuxMode } from '../types';

function fail(what: string, line: string): never {
  throw new Error(`parse(selinux): ${what}: '${line.slice(0, 160)}'`);
}

function lines(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.replace(/\r$/, ''))
    .filter(line => line.trim() !== '');
}

/* ── mode, config, contexts ──────────────────────────────────────────────────────── */

/** `getenforce`: exit 127 = the tool is absent (no SELinux userland); else Enforcing|Permissive|Disabled. */
export function parseGetenforce(result: ExecResult): SelinuxMode {
  if (result.code === 127) return 'absent';
  const word = result.stdout.trim();
  if (result.code !== 0) fail(`getenforce exited ${result.code}`, result.stderr.trim() || word);
  if (word === 'Enforcing') return 'enforcing';
  if (word === 'Permissive') return 'permissive';
  if (word === 'Disabled') return 'disabled';
  return fail('getenforce printed an unknown mode', word);
}

export interface SelinuxConfig {
  /** `SELINUX=` as configured for the next boot (may differ from the running mode). */
  readonly selinux: 'enforcing' | 'permissive' | 'disabled' | null;
  /** `SELINUXTYPE=` (targeted, mls, minimum…). */
  readonly type: string | null;
}

/** /etc/selinux/config. A `SELINUXTYPE` that is not a plain name is refused (it names a directory). */
export function parseSelinuxConfig(text: string): SelinuxConfig {
  let selinux: SelinuxConfig['selinux'] = null;
  let type: string | null = null;
  for (const line of lines(text)) {
    const match = /^\s*(SELINUX|SELINUXTYPE)\s*=\s*"?([^"#\s]*)"?\s*(?:#.*)?$/.exec(line);
    if (!match) continue;
    const value = match[2] as string;
    if (match[1] === 'SELINUX') {
      const lowered = value.toLowerCase();
      selinux = lowered === 'enforcing' || lowered === 'permissive' || lowered === 'disabled' ? lowered : null;
    } else {
      if (!/^[A-Za-z0-9_-]+$/.test(value)) fail('SELINUXTYPE is not a policy name', line);
      type = value;
    }
  }
  return Object.freeze({ selinux, type });
}

export interface SelinuxContext {
  readonly user: string;
  readonly role: string;
  readonly type: string;
  /** The MLS/MCS part (`s0-s0:c0.c1023`), '' when absent. */
  readonly level: string;
}

/** `user:role:type[:level]` (/proc/self/attr/current, a mount's `context=`). null when malformed. */
export function parseSelinuxContext(text: string): SelinuxContext | null {
  // /proc/self/attr/current ends in a NUL (and sometimes a newline).
  const value = text.replace(/[\0\n\r]+$/g, '').trim().replace(/^"(.*)"$/, '$1');
  const match = /^([A-Za-z0-9_.]+):([A-Za-z0-9_.]+):([A-Za-z0-9_.]+)(?::(\S+))?$/.exec(value);
  if (!match) return null;
  return Object.freeze({ user: match[1] as string, role: match[2] as string, type: match[3] as string, level: match[4] ?? '' });
}

/* ── local file-context rules (`semanage fcontext -l -C -n`) ─────────────────────── */

/** semanage's file-type column → the `-f` letter of `semanage fcontext -a -f`. */
const FILE_TYPES: Readonly<Record<string, string>> = Object.freeze({
  'all files': 'a',
  'regular file': 'f',
  directory: 'd',
  'character device': 'c',
  'block device': 'b',
  socket: 's',
  'symbolic link': 'l',
  'named pipe': 'p',
});

export interface FcontextRule {
  /** The regex spec, exactly as registered. */
  readonly spec: string;
  /** The `-f` letter (`a` all files, `d` directory, `f` regular file, …). */
  readonly fileType: string;
  /** The context's type (`httpd_sys_content_t`), or `<<None>>` for a "no label" rule. */
  readonly type: string;
}

export interface FcontextEquivalence {
  /** `semanage fcontext -a -e <target> <path>`: path is labelled like target (Remi: /var/opt/remi/php82 = /var). */
  readonly path: string;
  readonly target: string;
}

export interface FcontextLocal {
  readonly rules: readonly FcontextRule[];
  readonly equivalences: readonly FcontextEquivalence[];
}

/**
 * `semanage fcontext -l -C -n`: the local customisations — rule lines
 * `<spec> <file type> <user:role:type:level | <<None>>>`, and equivalence lines
 * `<path> = <target>`. Section titles (printed without `-n`)
 * are skipped by name.
 */
export function parseSemanageFcontextLocal(text: string): FcontextLocal {
  const rules: FcontextRule[] = [];
  const equivalences: FcontextEquivalence[] = [];
  for (const line of lines(text)) {
    if (/^SELinux (?:Local )?fcontext/i.test(line.trim())) continue;
    const equivalence = /^\s*(\/\S*)\s+=\s+(\/\S*)\s*$/.exec(line);
    if (equivalence) {
      equivalences.push(Object.freeze({ path: equivalence[1] as string, target: equivalence[2] as string }));
      continue;
    }
    // semanage prints `%-50s %-18s %s`: a spec longer than 50 is followed by ONE space, so the
    // columns are found from the right — the context is the last token, the file type one of
    // the closed names before it, the spec the rest.
    const trimmed = line.trim();
    const cut = trimmed.lastIndexOf(' ');
    if (cut === -1) fail('fcontext rule is not <spec> <file type> <context>', line);
    const context = trimmed.slice(cut + 1);
    const head = trimmed.slice(0, cut).trimEnd();
    const fileTypeName = Object.keys(FILE_TYPES).find(name => head.endsWith(` ${name}`));
    if (fileTypeName === undefined) fail('fcontext rule has no known file type before its context', line);
    const spec = head.slice(0, -fileTypeName.length).trim();
    if (spec === '' || /\s/.test(spec)) fail('fcontext rule is not <spec> <file type> <context>', line);
    const fileType = FILE_TYPES[fileTypeName] as string;
    let type: string;
    if (context === '<<None>>') type = context;
    else {
      const parsed = parseSelinuxContext(context);
      if (parsed === null) fail('malformed context', line);
      type = parsed.type;
    }
    rules.push(Object.freeze({ spec, fileType, type }));
  }
  return Object.freeze({ rules: Object.freeze(rules), equivalences: Object.freeze(equivalences) });
}

/* ── port types (`semanage port -l [-C] -n`) ─────────────────────────────────────── */

export interface PortRange {
  readonly type: string;
  readonly proto: string;
  readonly from: number;
  readonly to: number;
}

function portNumber(text: string, line: string): number {
  if (!/^\d{1,5}$/.test(text)) fail(`port '${text}' is not a number`, line);
  const value = Number(text);
  if (value < 1 || value > 65535) fail(`port ${value} is outside 1-65535`, line);
  return value;
}

/** `<type>  <tcp|udp|sctp|dccp>  <port|from-to>, …` → one entry per port or range. */
export function parseSemanagePorts(text: string): PortRange[] {
  const out: PortRange[] = [];
  for (const line of lines(text)) {
    if (/^SELinux Port Type/i.test(line.trim())) continue;
    const match = /^\s*([A-Za-z0-9_]+)\s+(tcp|udp|sctp|dccp)\s+(\S.*?)\s*$/.exec(line);
    if (!match) fail('port line is not <type> <proto> <ports>', line);
    const [, type, proto, list] = match as unknown as [string, string, string, string];
    for (const item of list.split(',').map(part => part.trim())) {
      const range = /^(\d+)-(\d+)$/.exec(item);
      if (range) {
        const from = portNumber(range[1] as string, line);
        const to = portNumber(range[2] as string, line);
        if (to < from) fail(`range ${item} runs backwards`, line);
        out.push(Object.freeze({ type, proto, from, to }));
      } else {
        const port = portNumber(item, line);
        out.push(Object.freeze({ type, proto, from: port, to: port }));
      }
    }
  }
  return out;
}

/**
 * The tcp ports the policy types EXACTLY (single-port definitions) → type. A range does not
 * count: `semanage port -a` on a port inside another type's range adds a more specific
 * definition the policy prefers (8080 in `http_cache_port_t`'s list is exact, 3100 inside
 * `unreserved_port_t`'s 1024-32767 is not), so only an exact definition collides with ours.
 */
export function tcpPortTypes(rows: readonly PortRange[]): Map<number, string> {
  const out = new Map<number, string>();
  for (const entry of rows) if (entry.proto === 'tcp' && entry.from === entry.to) out.set(entry.from, entry.type);
  return out;
}

/** The single-port local definitions (`semanage port -l -C -n`), HostFacts.selinux.localPorts. */
export function singlePorts(rows: readonly PortRange[]): { readonly type: string; readonly proto: string; readonly port: number }[] {
  const out: { type: string; proto: string; port: number }[] = [];
  for (const entry of rows) {
    if (entry.from !== entry.to) fail('a local port rule is a range (ours are single ports)', `${entry.type} ${entry.proto} ${entry.from}-${entry.to}`);
    out.push(Object.freeze({ type: entry.type, proto: entry.proto, port: entry.from }));
  }
  return out;
}

/* ── booleans (`getsebool <name>`) ───────────────────────────────────────────────── */

/**
 * `<name> --> on|off` → the value; null when getsebool answers that the boolean is unknown
 * to the loaded policy (exit 1, "Error getting active value for <name>"). A line naming
 * another boolean throws.
 */
export function parseGetsebool(name: string, result: ExecResult): boolean | null {
  if (result.code !== 0) {
    if (/Error getting active value|not defined|Could not get/i.test(`${result.stderr}\n${result.stdout}`)) return null;
    fail(`getsebool ${name} exited ${result.code}`, result.stderr.trim() || result.stdout.trim());
  }
  const line = result.stdout.trim();
  const match = /^([A-Za-z0-9_]+)\s+-->\s+(on|off)$/.exec(line);
  if (!match) fail('getsebool line is not <name> --> on|off', line);
  if (match[1] !== name) fail(`getsebool answered for '${match[1]}', asked '${name}'`, line);
  return match[2] === 'on';
}

/* ── labels (`stat -c '%C %n'`) and pending relabels (`restorecon -n -v`) ────────── */

/** The type of a `%C` field; `?` (no label, SELinux off or an unlabelled fs) stays `?`. */
function typeOfContext(context: string, line: string): string {
  if (context === '?') return '?';
  const parsed = parseSelinuxContext(context);
  if (parsed === null) fail('malformed context', line);
  return parsed.type;
}

/** `stat -c '%C %n' -- <paths…>` → path → type. The paths are ours (no spaces: ABSOLUTE_PATH_PATTERN). */
export function parseStatContext(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of lines(text)) {
    const match = /^(\S+) (\/.*)$/.exec(line);
    if (!match) fail('stat line is not <context> <path>', line);
    out.set(match[2] as string, typeOfContext(match[1] as string, line));
  }
  return out;
}

export interface PendingRelabel {
  readonly path: string;
  /** The current type. */
  readonly from: string;
  /** The type the policy (with our local rules) wants. */
  readonly to: string;
}

/**
 * `restorecon -n -v`: `Would relabel <path> from <ctx> to <ctx>` (policycoreutils ≥ 2.8, EL 9
 * and 10) or the older `restorecon reset <path> context <ctx>-><ctx>`. Other lines (warnings
 * about missing paths are filtered upstream) throw.
 */
export function parseRestoreconDryRun(text: string): PendingRelabel[] {
  const out: PendingRelabel[] = [];
  for (const line of lines(text)) {
    const modern = /^Would relabel (\/\S*) from (\S+) to (\S+)$/.exec(line.trim());
    const legacy = /^restorecon reset (\/\S*) context (\S+)->(\S+)$/.exec(line.trim());
    const match = modern ?? legacy;
    if (!match) fail('restorecon line is not a pending relabel', line);
    out.push(
      Object.freeze({ path: match[1] as string, from: typeOfContext(match[2] as string, line), to: typeOfContext(match[3] as string, line) }),
    );
  }
  return out;
}

/* ── the policy modules (selinux_module.ts, spec §9.8) ───────────────────────────── */

export interface ListedPolicyModule {
  readonly priority: number;
  readonly name: string;
  readonly lang: string;
  readonly disabled: boolean;
}

/**
 * `semodule --list-modules=full`: `<priority> <name> <lang> [disabled]` per module (measured, RHEL
 * 9.8: `400 permissive_rhcd_t cil`, `100 abrt pp  disabled`). Every row of the host, every priority.
 */
export function parseSemoduleList(text: string): ListedPolicyModule[] {
  const out: ListedPolicyModule[] = [];
  for (const line of lines(text)) {
    const match = /^\s*(\d{1,3})\s+([A-Za-z0-9_.-]+)\s+([A-Za-z0-9_]+)(?:\s+(disabled))?\s*$/.exec(line);
    if (!match) fail('semodule --list-modules=full line is not <priority> <name> <lang> [disabled]', line);
    out.push(Object.freeze({ priority: Number(match[1]), name: match[2] as string, lang: match[3] as string, disabled: match[4] !== undefined }));
  }
  return out;
}
