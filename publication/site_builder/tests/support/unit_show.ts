/**
 * A RENDERED UNIT FILE, AS `systemctl show` WOULD PRINT IT ONCE PID 1 LOADED IT — the bridge
 * that lets a gate hand the RENDERER's output to the COMPARATOR (`conformance()`).
 *
 * WHY IT EXISTS. G9 proves every drift is refused against `conformingShow`, a fixture written
 * from the comparator's own expectations; G3 asserts the rendered files key by key. Neither
 * puts the two sides in one room: a renderer that writes a key the comparator refuses (a
 * `BindPaths=` on the git door, M33) stayed green in both, and every git run on a real host
 * would have been refused `unit_nonconformant`. This module is the room.
 *
 * WHAT IT MODELS — systemd's LOAD and SHOW, for exactly the directives the renderer writes,
 * from systemd.unit(5)/.service(5)/.socket(5)/.exec(5)/.kill(5)/.resource-control(5), NOT from
 * `conformance()`:
 *
 *   - list-valued directives ACCUMULATE across lines (an empty assignment resets them);
 *     scalars: the last assignment wins;
 *   - the `…Sec=` time settings are shown as `…USec=` in `format_timespan` spelling;
 *     `CPUQuota=N%` as `CPUQuotaPerSecUSec`; `MemoryMax=` in bytes (1024-based);
 *     `ListenStream=` as `Listen=<path> (Stream)`; a signal NAME as its number;
 *   - `ExecStart=` as the `{ path=… ; argv[]=… ; … }` record, with its prefix characters
 *     (`@ - : + ! !!`) decoded into `path=` / `ExecStartEx`'s `flags=`;
 *   - `BindPaths=src[:dst[:opts]]` as `src:dst:rbind` (`norbind` stays), `-` kept;
 *   - `IPAddress*=any|localhost` resolved to their prefixes;
 *   - [Install] is not a loaded property (`WantedBy=` shows only once enabled) and is dropped;
 *   - the DEFAULTS PID 1 prints for keys the file does not state (`PID1_DEFAULTS`), and the
 *     implicit dependencies it adds (`IMPLICIT_AFTER`).
 *
 * HONEST LIMIT. A model, written by hand — the same limit as `conformingShow`, stated as
 * residual 9 (engineering/SITE_BUILDER_INSTANCES.md §10): the probe's P7 capture of a real
 * 255/257 `systemctl show` is what closes it. What this model adds is INDEPENDENCE: it is
 * derived from the unit-file semantics, so a renderer/comparator disagreement on any key both
 * sides spell the same way is now red.
 */

import { unitDirectives } from './lead1b_contract';

/** Directives systemd accumulates across assignments (an empty one resets). */
const LIST_KEYS = new Set([
  'After',
  'Before',
  'BindsTo',
  'PartOf',
  'Conflicts',
  'Wants',
  'Requires',
  'ReadWritePaths',
  'TemporaryFileSystem',
  'InaccessiblePaths',
  'BindPaths',
  'BindReadOnlyPaths',
  'IPAddressDeny',
  'IPAddressAllow',
  'RestrictAddressFamilies',
  'Environment',
  'SupplementaryGroups',
]);

/** What PID 1 prints for a service key the file does not state (systemd 248–257). */
const PID1_DEFAULTS: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({
  service: Object.freeze({
    DynamicUser: 'no',
    KillMode: 'control-group',
    KillSignal: '15',
    SendSIGKILL: 'yes',
    FinalKillSignal: '9',
    PrivateUsers: 'no',
    UMask: '0022',
    CollectMode: 'inactive',
    TimeoutStopUSec: '1min 30s',
  }),
  socket: Object.freeze({ Accept: 'no', SocketMode: '0666', DirectoryMode: '0755' }),
  target: Object.freeze({ StopWhenUnneeded: 'no' }),
});

/** The implicit `After=` PID 1 adds (DefaultDependencies=yes) — the comparator reads ⊇. */
const IMPLICIT_AFTER: Readonly<Record<string, readonly string[]>> = Object.freeze({
  service: Object.freeze(['sysinit.target', 'basic.target', 'system.slice', 'systemd-journald.socket']),
  socket: Object.freeze(['sysinit.target']),
  target: Object.freeze([]),
});

const SIGNALS: Readonly<Record<string, number>> = Object.freeze({
  SIGHUP: 1,
  SIGINT: 2,
  SIGQUIT: 3,
  SIGKILL: 9,
  SIGUSR1: 10,
  SIGUSR2: 12,
  SIGTERM: 15,
  SIGCONT: 18,
  SIGSTOP: 19,
});

/** systemd's `format_timespan` for a whole number of seconds (accuracy 1 s). */
export function formatTimespan(totalSeconds: number): string {
  if (totalSeconds === 0) return '0';
  const parts: string[] = [];
  let rest = totalSeconds;
  for (const [unit, size] of [
    ['d', 86_400],
    ['h', 3_600],
    ['min', 60],
    ['s', 1],
  ] as const) {
    const n = Math.floor(rest / size);
    if (n > 0) parts.push(`${n}${unit}`);
    rest -= n * size;
  }
  return parts.join(' ');
}

/** A unit-file time value (`10`, `2s`, `5min`) → seconds. */
function seconds(value: string): number {
  const match = /^(\d+)(s|sec|min|h)?$/.exec(value.trim());
  if (!match) throw new Error(`unit_show: time value '${value}' is not one this model reads`);
  const n = Number(match[1]);
  return match[2] === 'min' ? n * 60 : match[2] === 'h' ? n * 3600 : n;
}

/** `ExecStart=` with its prefixes → the `{ … }` record (`ExecStart`) and its `flags=` (`ExecStartEx`). */
function execRecords(value: string): { start: string; ex: string } {
  let rest = value.trim();
  const flags: string[] = [];
  let at = false;
  for (;;) {
    if (rest.startsWith('!!')) {
      flags.push('ambient');
      rest = rest.slice(2);
    } else if (rest.startsWith('!')) {
      flags.push('no-setuid');
      rest = rest.slice(1);
    } else if (rest.startsWith('+')) {
      flags.push('privileged');
      rest = rest.slice(1);
    } else if (rest.startsWith('-')) {
      flags.push('ignore-failure');
      rest = rest.slice(1);
    } else if (rest.startsWith(':')) {
      flags.push('no-env-expand');
      rest = rest.slice(1);
    } else if (rest.startsWith('@')) {
      at = true;
      rest = rest.slice(1);
    } else break;
  }
  const words = rest.split(/\s+/).filter(Boolean);
  const path = words[0] as string;
  const argv = at ? words.slice(1) : words;
  const tail = 'start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0';
  return {
    start: `{ path=${path} ; argv[]=${argv.join(' ')} ; ignore_errors=${flags.includes('ignore-failure') ? 'yes' : 'no'} ; ${tail} }`,
    ex: `{ path=${path} ; argv[]=${argv.join(' ')} ; flags=${flags.join(' ')} ; ${tail} }`,
  };
}

function bindEntry(token: string): string {
  const optional = token.startsWith('-');
  const bare = optional ? token.slice(1) : token;
  const [src, dst, opts] = bare.split(':');
  return `${optional ? '-' : ''}${src}:${dst || src}:${opts === 'norbind' ? 'norbind' : 'rbind'}`;
}

function ipTokens(token: string): string[] {
  if (token === 'any') return ['0.0.0.0/0', '::/0'];
  if (token === 'localhost') return ['127.0.0.0/8', '::1/128'];
  return [token];
}

function sizeBytes(value: string): string {
  const match = /^(\d+)([KMGT]?)$/.exec(value.trim());
  if (!match) throw new Error(`unit_show: size '${value}' is not one this model reads`);
  const scale: Record<string, number> = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };
  return String(Number(match[1]) * (scale[match[2] as string] as number));
}

export type UnitKind = 'service' | 'socket' | 'target';

/** One rendered unit FILE → the `systemctl show` text PID 1 would answer for it. */
export function showOfRendered(body: string, kind: UnitKind): string {
  const props = new Map<string, string[]>();
  const set = (key: string, value: string) => props.set(key, [value]);
  const add = (key: string, values: readonly string[]) => {
    if (values.length === 0) props.set(key, []);
    else props.set(key, [...(props.get(key) ?? []), ...values]);
  };
  for (const { section, key, value } of unitDirectives(body)) {
    if (section === 'Install') continue;
    if (LIST_KEYS.has(key)) {
      const tokens = value.split(/\s+/).filter(Boolean);
      if (key === 'BindPaths' || key === 'BindReadOnlyPaths') add(key, tokens.map(bindEntry));
      else if (key === 'IPAddressDeny' || key === 'IPAddressAllow') add(key, tokens.flatMap(ipTokens));
      else add(key, tokens);
      continue;
    }
    switch (key) {
      case 'RuntimeMaxSec':
        set('RuntimeMaxUSec', formatTimespan(seconds(value)));
        break;
      case 'TimeoutStopSec':
        set('TimeoutStopUSec', formatTimespan(seconds(value)));
        break;
      case 'TriggerLimitIntervalSec':
        set('TriggerLimitIntervalUSec', formatTimespan(seconds(value)));
        break;
      case 'CPUQuota': {
        const percent = /^(\d+)%$/.exec(value.trim());
        if (!percent) throw new Error(`unit_show: CPUQuota '${value}' is not a percentage`);
        const usec = Number(percent[1]) * 10_000;
        set('CPUQuotaPerSecUSec', usec % 1_000_000 === 0 ? formatTimespan(usec / 1_000_000) : `${usec / 1000}ms`);
        break;
      }
      case 'MemoryMax':
        set('MemoryMax', sizeBytes(value));
        break;
      case 'ListenStream':
        set('Listen', `${value} (Stream)`);
        break;
      case 'KillSignal':
      case 'FinalKillSignal':
        set(key, String(SIGNALS[value] ?? Number(value)));
        break;
      case 'ExecStart': {
        const records = execRecords(value);
        set('ExecStart', records.start);
        set('ExecStartEx', records.ex);
        break;
      }
      default:
        set(key, value);
    }
  }
  for (const [key, value] of Object.entries(PID1_DEFAULTS[kind] ?? {})) if (!props.has(key)) set(key, value);
  const implicit = IMPLICIT_AFTER[kind] ?? [];
  if (implicit.length > 0) add('After', implicit);
  return [...props.entries()].map(([key, values]) => `${key}=${values.join(' ')}`).join('\n');
}
