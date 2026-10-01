/**
 * A STAND-IN FOR PID 1 AND THE SHIM — the host the LEAD-1b daemon gates run their confined
 * runs against (spec §6 G7, G8, G10–G14, G17, G19).
 *
 * What it plays, and why each part is real rather than described:
 *
 *   - THE SOCKETS. For every declared (site k, door d) it LISTENS on the real unix path
 *     `<agentSocketDir>/s<k>-<d>.sock` the daemon connects to, with `Accept=yes,
 *     MaxConnections=1` semantics as PID 1 implements them (socket.c): a connection while an
 *     instance of that socket is still alive is accepted and DROPPED at once, and the slot
 *     frees only when the instance is dead (`service_release_socket_fd`, DEAD/FAILED only).
 *   - THE SHIM, speaking the frame protocol from the WIRE's side: H first, then read S, then
 *     O/E and one X. Its codec is written HERE, from the byte format in spec §2.3 (1 type
 *     byte, u32 BE length, payload) — never imported from the daemon — so a codec bug shared
 *     by both ends of the daemon cannot pass as agreement.
 *   - `systemctl`, as a recording fake over the same state: `show`, `list-units`, `stop`.
 *     Nothing it is asked is interpreted beyond what PID 1 would answer.
 *
 * THE POLICY BUILDER at the bottom is the ONE place the daemon's future ConfinementPolicy shape
 * is spelled (spec §3 confinement.ts "add"). It also carries the pre-LEAD-1b fields so that
 * today's code reaches the checks the gates ask about instead of crashing on a missing field.
 */

import { chmodSync, existsSync, lstatSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { connect as netConnect, createServer, type Server, type Socket } from 'node:net';
import { dirname, join } from 'node:path';
import { roots } from '../fixtures/instance';
import { type Door, DOORS, shortScratch } from './lead1b_contract';
import { TURN_SYSTEM_GITCONFIG_DIRECTIVES, turnGitconfigBind, turnSystemGitconfigPath } from '../../src/drivers/agent_identity';

/* ────────────────────────────────────────────────────────────────────────────────────
 * The wire format (spec §2.3), independently
 * ──────────────────────────────────────────────────────────────────────────────────── */

export const FRAME_TYPES = ['H', 'S', 'O', 'E', 'X'] as const;
export type FrameType = (typeof FRAME_TYPES)[number];
export interface WireFrame {
  readonly type: FrameType;
  readonly payload: Buffer;
}

/** Caps from spec §2.3: a spec ≤ 1 MiB, an output chunk ≤ 64 KiB. */
export const MAX_SPEC_BYTES = 1024 * 1024;
export const MAX_CHUNK_BYTES = 64 * 1024;

/** One frame: 1 type byte (ASCII), u32 big-endian payload length, the payload. */
export function frame(type: string, payload: Buffer | string | object): Buffer {
  const body = Buffer.isBuffer(payload)
    ? payload
    : Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload), 'utf8');
  const head = Buffer.alloc(5);
  head.write(type, 0, 1, 'latin1');
  head.writeUInt32BE(body.length, 1);
  return Buffer.concat([head, body]);
}

/** Incremental reader of the wire format. Throws on a type or a length it does not accept. */
export class WireReader {
  private buffer: Buffer = Buffer.alloc(0);

  push(chunk: Buffer): WireFrame[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const out: WireFrame[] = [];
    for (;;) {
      if (this.buffer.length < 5) return out;
      const type = this.buffer.toString('latin1', 0, 1);
      if (!(FRAME_TYPES as readonly string[]).includes(type)) {
        throw new Error(`wire: unknown frame type 0x${(this.buffer[0] ?? 0).toString(16)}`);
      }
      const length = this.buffer.readUInt32BE(1);
      if (length > MAX_SPEC_BYTES) throw new Error(`wire: frame length ${length} over the cap`);
      if (this.buffer.length < 5 + length) return out;
      out.push({ type: type as FrameType, payload: Buffer.from(this.buffer.subarray(5, 5 + length)) });
      this.buffer = this.buffer.subarray(5 + length);
    }
  }

  get pending(): number {
    return this.buffer.length;
  }
}

export function json(frameValue: WireFrame): any {
  return JSON.parse(frameValue.payload.toString('utf8'));
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * PID 1 + shim
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** What the stand-in shim does once it has read S. */
export type Script =
  | { readonly kind: 'exit'; readonly code?: number; readonly stdout?: string; readonly stderr?: string }
  /** Runs until the daemon closes the connection, or `release()`. */
  | { readonly kind: 'hang' }
  /** Writes output and ends the connection WITHOUT an X frame (a unit that died mid-run). */
  | { readonly kind: 'noExit'; readonly stdout?: string }
  /** EOF before H: the unit never started (ExecStart failed, conformance on the host side…). */
  | { readonly kind: 'refuse' }
  /**
   * EOF before H, but the INSTANCE is left to the host's flags (`lingering`/`stubborn`): a unit
   * that dropped the connection and did not die — the refusal-after-connect path's worst case.
   */
  | { readonly kind: 'mute' }
  /**
   * A shim whose HELLO LIES: H names `door` / `unit` instead of the real ones (either left out
   * = the truth), then behaves like `exit 0`. The daemon must refuse it before any S frame.
   */
  | { readonly kind: 'hello'; readonly door?: string; readonly unit?: string };

export type UnitState = 'active' | 'activating' | 'deactivating' | 'inactive' | 'failed';

export interface StandInInstance {
  readonly name: string;
  readonly k: number;
  readonly door: Door;
  state: UnitState;
  /** Survives its connection's end (a unit PID 1 has not reaped yet). */
  lingering: boolean;
  /** Ignores `systemctl stop`. */
  stubborn: boolean;
  connection: Socket | null;
  /**
   * Processes left in its cgroup once PID 1 has marked it dead — a stop that skipped SIGKILL
   * (`SendSIGKILL=no`): the unit is FAILED, MaxConnections is released, and `TasksCurrent`
   * still counts them. 0 = an empty cgroup (`[not set]` once PID 1 pruned it).
   */
  tasks: number;
  /** What `tasks` becomes when this instance dies (the host's `survivors` at its start). */
  readonly survivors: number;
}

export interface SystemctlAnswer {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** What the fault seam makes one `systemctl` call do instead of answering. */
export type SystemctlFault = 'throw' | { readonly code: number; readonly stderr: string } | { readonly drop: readonly string[] };

/** A bus that times out, as `systemctlVia` reports it (a non-numeric error code → 1). */
export const BUS_TIMEOUT: SystemctlFault = Object.freeze({ code: 1, stderr: 'Failed to connect to bus: Connection timed out' });

export interface StandInOptions {
  /** The museum's agent unit prefix (`dedalo-site-<inst>-agent-`). */
  readonly prefix: string;
  /** Where the per-(site, door) sockets are — the daemon's AGENT_SOCKET_DIR. */
  readonly agentSocketDir: string;
  /** Every declared ordinal k. */
  readonly ordinals: readonly number[];
  /** The service user's uid, for the `<nr>-<pid>-<uid>` instance name form. */
  readonly serviceUid: number;
}

export function socketPathFor(agentSocketDir: string, k: number, door: Door): string {
  return join(agentSocketDir, `s${k}-${door}.sock`);
}

export class StandInHost {
  /** Every `systemctl` argv, in order. */
  readonly systemctlCalls: string[][] = [];
  /** Every connect() the daemon made, by path, in order. */
  readonly connects: string[] = [];
  /** The S frames received, parsed, with where they arrived. */
  readonly specs: Array<{ readonly k: number; readonly door: Door; readonly spec: any }> = [];
  /** One ordered log over everything: `systemctl <argv>`, `connect <path>`, `drop <path>`, `spec <door>`. */
  readonly log: string[] = [];
  /** Instance name → state. */
  readonly instances = new Map<string, StandInInstance>();
  /** `systemctl show` fixtures for names this fake has no state for (conformance, G9). */
  readonly showFixtures = new Map<string, string>();
  /** What each (k, door) run does. Default: exit 0 with no output. */
  script: (k: number, door: Door) => Script = () => ({ kind: 'exit', code: 0 });
  /** New instances outlive their connection (PID 1 slow to reap / a unit that will not die). */
  lingering = false;
  /** New instances ignore `systemctl stop` (a unit PID 1 cannot kill — D-state, a stuck cgroup). */
  stubborn = false;
  /**
   * New instances leave this many processes behind when PID 1 marks them dead — the stop
   * skipped SIGKILL (a `SendSIGKILL=no` / catchable `FinalKillSignal=` drop-in): FAILED, the
   * socket's slot released, the cgroup still populated.
   */
  survivors = 0;
  /**
   * How PID 1 spells an instance's suffix. Default: the <= 257 form `<nr>-<pid>-<uid>`; a gate
   * sets a >= 258 form (`<nr>-<cookie>-<pid>_<pidfd id>-<uid>`) to play a newer host.
   */
  spelling: (nr: number, uid: number) => string = (nr, uid) => `${nr}-${4000 + nr}-${uid}`;
  /** PRE-LEAD-1b transient runs (`<prefix><uuid>.service`) still alive — not stoppable by the daemon. */
  readonly legacyLive = new Set<string>();
  /**
   * A socket's NConnections stated INDEPENDENTLY of the instance list (`'<k>:<door>'` → count).
   * Without it the stand-in derives NConnections from its live instances, so a busy socket and
   * a listed instance can never disagree — and the daemon's socket-count half of the death and
   * idle proofs (the backstop for an instance its list does not see) is never exercised.
   */
  readonly connectionsOverride = new Map<string, number>();
  /**
   * WHEN PID 1 (or the bus between) DOES NOT ANSWER — the fault seam. Asked per `systemctl`
   * call with its verb and units: `throw` (a D-Bus timeout the wrapper never resolved), a
   * non-zero `{ code, stderr }` (what `systemctlVia` makes of a timeout, a polkit denial, a
   * PID 1 busy reloading), or `{ drop }` — a `show` that answers WITHOUT the named properties.
   * null = answer normally. Without it every verb answered code 0 with every property present,
   * so no gate could put "PID 1 cannot say" in front of the lease (eight fail-open mutations
   * of the idle and death proofs survived the whole suite).
   */
  fault: (verb: string, units: readonly string[]) => SystemctlFault | null = () => null;

  private readonly servers: Server[] = [];
  private nr = 0;
  private readonly waiters = new Set<() => void>();

  constructor(readonly options: StandInOptions) {}

  async start(): Promise<void> {
    mkdirSync(this.options.agentSocketDir, { recursive: true });
    for (const k of this.options.ordinals) {
      for (const door of DOORS) {
        const path = socketPathFor(this.options.agentSocketDir, k, door);
        if (existsSync(path)) rmSync(path, { force: true });
        const server = createServer(socket => this.accept(k, door, socket));
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject);
          server.listen(path, () => {
            server.off('error', reject);
            resolve();
          });
        });
        this.servers.push(server);
      }
    }
  }

  async close(): Promise<void> {
    this.release();
    for (const instance of this.instances.values()) instance.connection?.destroy();
    await Promise.all(this.servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  }

  /** Let every hanging script finish with X {code: 0}. */
  release(): void {
    for (const waiter of [...this.waiters]) waiter();
    this.waiters.clear();
  }

  /** The daemon's `host.connect` seam: a real connect(2) to the real path, recorded. */
  readonly connect = (path: string): Promise<Socket> => {
    this.connects.push(path);
    this.log.push(`connect ${path}`);
    return new Promise((resolve, reject) => {
      const socket = netConnect(path);
      socket.once('connect', () => resolve(socket));
      socket.once('error', reject);
    });
  };

  /** Instances of (k, door) that PID 1 would still count against MaxConnections. */
  live(k: number, door: Door): StandInInstance[] {
    return [...this.instances.values()].filter(
      instance => instance.k === k && instance.door === door && instance.state !== 'inactive' && instance.state !== 'failed',
    );
  }

  /** Every live instance, any site, any door. */
  allLive(): StandInInstance[] {
    return [...this.instances.values()].filter(instance => instance.state !== 'inactive' && instance.state !== 'failed');
  }

  instanceName(k: number, door: Door): string {
    this.nr += 1;
    return `${this.options.prefix}s${k}-${door}@${this.spelling(this.nr, this.options.serviceUid)}.service`;
  }

  /** A run left alive by a previous daemon (crash), holding its socket's one connection. */
  plantLive(k: number, door: Door, opts: { stubborn?: boolean } = {}): StandInInstance {
    const name = this.instanceName(k, door);
    const instance: StandInInstance = {
      name,
      k,
      door,
      state: 'active',
      lingering: true,
      stubborn: opts.stubborn ?? false,
      connection: null,
      tasks: 0,
      survivors: 0,
    };
    this.instances.set(name, instance);
    return instance;
  }

  /**
   * A run a previous daemon left DEAD BUT POPULATED: PID 1 reports it failed (its socket's slot
   * free) while `tasks` processes still run in its cgroup — listed, because PID 1 never
   * garbage-collects a unit whose cgroup is not empty.
   */
  plantLeftover(k: number, door: Door, tasks: number): StandInInstance {
    const name = this.instanceName(k, door);
    const instance: StandInInstance = { name, k, door, state: 'failed', lingering: false, stubborn: false, connection: null, tasks, survivors: tasks };
    this.instances.set(name, instance);
    return instance;
  }

  /** PID 1 marks `instance` dead: failed with its survivors, or inactive with an empty cgroup. */
  private die(instance: StandInInstance): void {
    instance.lingering = false;
    instance.connection?.destroy();
    instance.connection = null;
    instance.tasks = instance.survivors;
    instance.state = instance.survivors > 0 ? 'failed' : 'inactive';
  }

  /** PID 1 reaps `instance` (or every instance): the unit is dead, its connection gone. */
  reap(instance?: StandInInstance): void {
    for (const each of instance ? [instance] : [...this.instances.values()]) {
      each.stubborn = false;
      each.lingering = false;
      each.connection?.destroy();
      each.connection = null;
      each.tasks = 0;
      each.state = 'inactive';
    }
  }

  private accept(k: number, door: Door, socket: Socket): void {
    const path = socketPathFor(this.options.agentSocketDir, k, door);
    if (this.live(k, door).length > 0) {
      // MaxConnections=1, and the slot is released only when the instance is dead.
      this.log.push(`drop ${path}`);
      socket.destroy();
      return;
    }
    const name = this.instanceName(k, door);
    const instance: StandInInstance = {
      name,
      k,
      door,
      state: 'active',
      lingering: this.lingering || this.stubborn,
      stubborn: this.stubborn,
      connection: socket,
      tasks: 0,
      survivors: this.survivors,
    };
    this.instances.set(name, instance);
    socket.on('error', () => {});
    socket.once('close', () => {
      instance.connection = null;
      if (!instance.lingering) this.die(instance);
    });
    const script = this.script(k, door);
    if (script.kind === 'refuse') {
      instance.state = 'failed';
      socket.destroy();
      return;
    }
    if (script.kind === 'mute') {
      socket.destroy();
      return;
    }
    socket.write(
      frame('H', script.kind === 'hello' ? { v: 1, door: script.door ?? door, unit: script.unit ?? name } : { v: 1, door, unit: name }),
    );
    const reader = new WireReader();
    let started = false;
    socket.on('data', chunk => {
      let frames: WireFrame[];
      try {
        frames = reader.push(chunk as Buffer);
      } catch {
        socket.destroy();
        return;
      }
      for (const received of frames) {
        if (received.type !== 'S' || started) {
          socket.destroy();
          return;
        }
        started = true;
        const spec = json(received);
        this.specs.push({ k, door, spec });
        this.log.push(`spec ${door} s${k}`);
        this.run(script, socket);
      }
    });
  }

  private run(script: Script, socket: Socket): void {
    if (script.kind === 'hello') {
      socket.end(frame('X', { code: 0, signal: null }));
      return;
    }
    if (script.kind === 'exit') {
      if (script.stdout) socket.write(frame('O', Buffer.from(script.stdout)));
      if (script.stderr) socket.write(frame('E', Buffer.from(script.stderr)));
      socket.end(frame('X', { code: script.code ?? 0, signal: null }));
      return;
    }
    if (script.kind === 'noExit') {
      if (script.stdout) socket.write(frame('O', Buffer.from(script.stdout)));
      socket.end();
      return;
    }
    // hang
    const finish = () => {
      if (!socket.destroyed) socket.end(frame('X', { code: 0, signal: null }));
    };
    this.waiters.add(finish);
    socket.once('close', () => this.waiters.delete(finish));
  }

  /* ── systemctl ─────────────────────────────────────────────────────────────── */

  /** The daemon's `host.systemctl` seam. */
  readonly systemctl = async (args: readonly string[]): Promise<SystemctlAnswer> => {
    this.systemctlCalls.push([...args]);
    this.log.push(`systemctl ${args.join(' ')}`);
    const positional: string[] = [];
    const properties: string[] = [];
    let valueOnly = false;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i] as string;
      if (arg === '-p' || arg === '--property') {
        properties.push(...String(args[++i] ?? '').split(','));
      } else if (arg.startsWith('--property=')) {
        properties.push(...arg.slice('--property='.length).split(','));
      } else if (arg.startsWith('-p') && arg.length > 2) {
        properties.push(...arg.slice(2).split(','));
      } else if (arg === '--value') {
        valueOnly = true;
      } else if (arg.startsWith('-')) {
        // --all --plain --no-legend --no-pager --state=… : formatting only
      } else {
        positional.push(arg);
      }
    }
    const [verb, ...units] = positional;
    const fault = this.fault(String(verb), units);
    if (fault === 'throw') throw new Error('stand-in systemctl: the bus never answered');
    if (fault && 'code' in fault) return { code: fault.code, stdout: '', stderr: fault.stderr };
    const dropped = fault && 'drop' in fault ? fault.drop : [];
    if (verb === 'show') {
      return { code: 0, stdout: units.map(unit => this.show(unit, properties, valueOnly, dropped)).join('\n\n'), stderr: '' };
    }
    if (verb === 'list-units') {
      const lines: string[] = [];
      // Every live instance — and every DEAD one whose cgroup still holds a process, which
      // PID 1 keeps loaded (a unit is never garbage-collected while its cgroup is populated).
      const listed = [...this.instances.values()].filter(
        instance => (instance.state !== 'inactive' && instance.state !== 'failed') || instance.tasks > 0,
      );
      for (const instance of listed) {
        if (units.length === 0 || units.some(pattern => globMatch(pattern, instance.name))) {
          lines.push(`${instance.name} loaded ${instance.state} ${instance.state === 'active' ? 'running' : 'dead'} agent run`);
        }
      }
      for (const legacy of this.legacyLive) {
        if (units.length === 0 || units.some(pattern => globMatch(pattern, legacy))) lines.push(`${legacy} loaded active running legacy agent run`);
      }
      return { code: 0, stdout: lines.join('\n'), stderr: '' };
    }
    if (verb === 'stop') {
      // The rule grants the daemon no pre-LEAD-1b name: polkit answers NOT_HANDLED, PID 1 denies.
      if (units.some(unit => this.legacyLive.has(unit))) {
        return { code: 4, stdout: '', stderr: 'Failed to stop unit: Access denied' };
      }
      for (const unit of units) {
        const instance = this.instances.get(unit);
        if (!instance) continue;
        if (instance.stubborn) continue;
        // A dead unit's stop is a no-op: PID 1 does not kill what a skipped SIGKILL left behind.
        if (instance.state === 'inactive' || instance.state === 'failed') continue;
        this.die(instance);
      }
      return { code: 0, stdout: '', stderr: '' };
    }
    return { code: 1, stdout: '', stderr: `stand-in systemctl: verb '${verb}' is not one the daemon may use` };
  };

  private show(unit: string, properties: readonly string[], valueOnly: boolean, dropped: readonly string[] = []): string {
    const all = this.propertiesOf(unit);
    const wanted = properties.length > 0 ? properties : Object.keys(all);
    return wanted
      .filter(key => key in all && !dropped.includes(key))
      .flatMap(key => {
        const value = all[key] as string;
        // As systemctl-show.c prints them: a struct-array property ONE LINE PER ENTRY.
        const entries = PER_ENTRY_PROPERTIES.has(key) ? value.split(/\s+/).filter(Boolean) : [value];
        return (entries.length > 0 ? entries : ['']).map(entry => (valueOnly ? entry : `${key}=${entry}`));
      })
      .join('\n');
  }

  private propertiesOf(unit: string): Record<string, string> {
    const fixture = this.showFixtures.get(unit);
    const base: Record<string, string> = fixture ? parseShow(fixture) : {};
    const socket = /s(\d+)-(turn|build|git)\.socket$/.exec(unit);
    if (socket && unit.startsWith(this.options.prefix)) {
      const k = Number(socket[1]);
      const door = socket[2] as Door;
      const count = this.connectionsOverride.get(`${k}:${door}`) ?? this.live(k, door).length;
      return { ...base, NConnections: String(count), ActiveState: 'active', LoadState: 'loaded' };
    }
    const instance = this.instances.get(unit);
    if (instance) {
      return {
        ...base,
        Id: unit,
        LoadState: 'loaded',
        ActiveState: instance.state,
        SubState: instance.state === 'active' ? 'running' : instance.state === 'failed' ? 'failed' : 'dead',
        Result: instance.state === 'failed' ? (instance.tasks > 0 ? 'timeout' : 'exit-code') : 'success',
        // systemd prints `[not set]` for a cgroup it no longer has (a dead unit, pruned).
        TasksCurrent: instance.state !== 'inactive' && instance.state !== 'failed' ? '1' : instance.tasks > 0 ? String(instance.tasks) : '[not set]',
      };
    }
    if (fixture) return base;
    return { Id: unit, LoadState: 'not-found', ActiveState: 'inactive', SubState: 'dead', Result: 'success' };
  }
}

/**
 * The properties `systemctl show` prints ONE LINE PER ENTRY (systemctl-show.c print_property:
 * the struct arrays `(ss)` / `(ssbt)`), where a string array is one space-joined line. The
 * stand-in and the unit model print them that way, so a comparator that kept only a repeated
 * key's last line is red here, as it would be on a real host.
 */
export const PER_ENTRY_PROPERTIES: ReadonlySet<string> = new Set(['TemporaryFileSystem', 'BindPaths', 'BindReadOnlyPaths']);

/** `systemctl show` text → map; a REPEATED key (one line per entry) accumulates, space-joined. */
export function parseShow(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq);
    const value = line.slice(eq + 1);
    const before = out[key];
    out[key] = before === undefined || before === '' ? value : value === '' ? before : `${before} ${value}`;
  }
  return out;
}

/** fnmatch(3) as `systemctl list-units PATTERN` applies it: `*`, `?` and `[...]` classes. */
export function globMatch(pattern: string, name: string): boolean {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i] as string;
    if (char === '*') source += '.*';
    else if (char === '?') source += '.';
    else if (char === '[') {
      const close = pattern.indexOf(']', i + 1);
      if (close < 0) {
        source += '\\[';
        continue;
      }
      const body = pattern.slice(i + 1, close);
      source += `[${body.startsWith('!') ? `^${body.slice(1)}` : body}]`;
      i = close;
    } else source += char.replace(/[.+^${}()|\\/]/g, '\\$&');
  }
  return new RegExp(`^${source}$`).test(name);
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * The policy
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** Principals of the gate host. Uids/gids no real file on this machine has. */
export const GATE_IDS = Object.freeze({
  serviceUid: 4_000_000_000,
  instanceGid: 4_000_000_100,
  identityUid: (k: number) => 4_000_001_000 + k,
  privateGid: (k: number) => 4_000_002_000 + k,
});

/**
 * `stat(2)` as THIS host answers it — except that every DIRECTORY is stated traversable (o+x) by
 * the gate's identities. They are fictional uids: on a developer's macOS checkout (`~/Desktop` is
 * 0700) no real directory grants them search, and a CI runner's home may not either. A gate that
 * asks about traversal states its own directory facts on top of this (G17).
 */
export function TRAVERSABLE_STAT(path: string): { uid: number; gid: number; mode: number } {
  const facts = HOST_STAT(path);
  return (facts.mode & 0o170000) === 0o040000 ? { ...facts, mode: facts.mode | 0o001 } : facts;
}

function HOST_STAT(path: string): { uid: number; gid: number; mode: number } {
  const facts = statSync(path);
  return { uid: facts.uid, gid: facts.gid, mode: facts.mode };
}

export interface GateHostFacts {
  readonly instance: string;
  readonly serviceUser: string;
  readonly identityName: (k: number) => string;
}

export interface GatePolicy {
  /** The policy object handed to the daemon (typed loosely: its shape is the contract). */
  readonly policy: any;
  readonly standIn: StandInHost;
  readonly runtimeDir: string;
  readonly agentSocketDir: string;
  readonly agentStateRoot: string;
  readonly facts: GateHostFacts;
  /** Every chown the egress gate was asked for (seam), in order. */
  readonly chowns: Array<{ readonly path: string; readonly uid: number; readonly gid: number }>;
  /** The gate's own ordered log: `chown <path> <gid>` and `serve <socket>` (seams). */
  readonly gateEvents: string[];
  /** Every identity name the host was asked to resolve. */
  readonly resolved: string[];
}

export interface GatePolicyOptions {
  /** slug → k. */
  readonly identities: ReadonlyMap<string, number>;
  /** PID 1's release. */
  readonly version?: number;
  readonly instance?: string;
  /** Overrides applied last, to the policy's top level. */
  readonly overrides?: Record<string, unknown>;
  /** Overrides applied to `policy.host`. */
  readonly hostOverrides?: Record<string, unknown>;
}

/**
 * THE POLICY SHAPE THE GATES ASSUME (spec §3 confinement.ts "add"):
 *
 *   identities (slug → k), instance, systemctlBin, agentSocketDir, agentStateRoot,
 *   identityEpoch, serviceUser, instanceGroup, doorTimeoutsMs {turn, build, git},
 *   timing {…small, for the gates},
 *   host.pid1Version(), host.systemctl(args), host.connect(path),
 *   host.resolveAgent(name) → {uid, gid, gids}, host.groupMembers(name), host.groupGid(name),
 *   host.ownGroups(), host.listAccounts() / host.listGroups() (the whole databases).
 *
 * `timing` is a gate seam: the spec's 15 s re-probe / 5 s quarantine poll / 30 s hello, which a
 * gate cannot wait for. Unhonoured, the gates still pass — slowly (their timeouts allow it).
 */
export async function lead1bPolicy(options: GatePolicyOptions): Promise<GatePolicy> {
  const instance = options.instance ?? 'test';
  const version = options.version ?? 255;
  const dir = shortScratch('host');
  const runtimeDir = join(dir, 'run');
  const agentSocketDir = join(dir, 'agents');
  const agentStateRoot = join(dir, 'state');
  mkdirSync(runtimeDir, { recursive: true, mode: 0o750 });
  mkdirSync(agentStateRoot, { recursive: true, mode: 0o755 });
  // THE TURN'S SYSTEM gitconfig, as root's renderer leaves it (root 0644 — here this uid's, which
  // the host states as the provisioner's below): a turn is refused without it.
  writeFileSync(
    turnSystemGitconfigPath(agentStateRoot),
    `# rendered\n${TURN_SYSTEM_GITCONFIG_DIRECTIVES.join('\n')}\n`,
    { mode: 0o644 },
  );
  chmodSync(turnSystemGitconfigPath(agentStateRoot), 0o644);
  const serviceUser = `dedalo-site-${instance}`;
  const identityName = (k: number) => `dedalo-a-${instance}_${k}`;
  const prefix = `dedalo-site-${instance}-agent-`;
  const ordinals = [...new Set(options.identities.values())];

  const standIn = new StandInHost({ prefix, agentSocketDir, ordinals, serviceUid: GATE_IDS.serviceUid });
  await standIn.start();
  // THE EGRESS DIRECTORIES, as root's tmpfiles.d line leaves them: `<agentSocketDir>/egress`
  // 0755 and one `s<k>` per site, 0770. This host cannot make them root's nor give them a
  // private group it is not in, so it states both (`provisionerUid`, the `lstat` seam below).
  const egressBase = join(agentSocketDir, 'egress');
  mkdirSync(egressBase, { recursive: true });
  chmodSync(egressBase, 0o755);
  for (const k of ordinals) {
    mkdirSync(join(egressBase, `s${k}`), { recursive: true });
    chmodSync(join(egressBase, `s${k}`), 0o770);
  }

  // A file that exists (the pre-LEAD-1b refusal asks only `existsSync`), executable.
  const systemctlBin = join(dir, 'systemctl');
  writeFileSync(systemctlBin, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const systemdRunBin = join(dir, 'systemd-run');
  writeFileSync(systemdRunBin, '#!/bin/sh\nexit 1\n', { mode: 0o755 });

  const chowns: Array<{ path: string; uid: number; gid: number }> = [];
  const gateEvents: string[] = [];
  const resolved: string[] = [];
  const ordinalOf = (name: string): number | null => {
    const match = /_(\d+)$/.exec(name);
    const k = match ? Number(match[1]) : NaN;
    return ordinals.includes(k) && name === identityName(k) ? k : null;
  };

  const { HOST_FACTS, SHIM_PATH } = await import('../../src/drivers/confinement');

  const host = {
    runtimePrefix: dir,
    readNetns: () => 'net:[4026531840]',
    stat: TRAVERSABLE_STAT,
    pid1Version: () => version,
    // pre-LEAD-1b spelling of the same fact (`systemd-run --version`)
    systemdVersion: () => version,
    systemctl: standIn.systemctl,
    connect: standIn.connect,
    resolveAgent: (name: string) => {
      resolved.push(name);
      const k = ordinalOf(name);
      if (k === null) return null;
      return Object.freeze({
        uid: GATE_IDS.identityUid(k),
        gid: GATE_IDS.instanceGid,
        gids: Object.freeze([GATE_IDS.instanceGid, GATE_IDS.privateGid(k)]),
      });
    },
    groupMembers: (name: string) => {
      const k = ordinalOf(name);
      return k === null ? null : [serviceUser, identityName(k)];
    },
    groupGid: (name: string) => {
      const k = ordinalOf(name);
      if (k !== null) return GATE_IDS.privateGid(k);
      return name === serviceUser ? GATE_IDS.instanceGid : null;
    },
    ownGroups: () => [GATE_IDS.instanceGid, ...ordinals.map(GATE_IDS.privateGid)],
    // The host's whole databases, as `getent passwd` / `group` enumerate them: root, nobody,
    // the service user and every identity with its own uid; every private group its own gid.
    // (`gid` = the PRIMARY gid, passwd field 4: every identity's is the instance group.)
    listAccounts: () => [
      { name: 'root', id: 0, gid: 0 },
      { name: 'nobody', id: 65534, gid: 65534 },
      { name: serviceUser, id: GATE_IDS.serviceUid, gid: GATE_IDS.instanceGid },
      ...ordinals.map(k => ({ name: identityName(k), id: GATE_IDS.identityUid(k), gid: GATE_IDS.instanceGid })),
    ],
    provisionerUid: process.getuid?.() ?? 0,
    listGroups: () => [
      { name: 'root', id: 0 },
      { name: 'nogroup', id: 65534 },
      { name: serviceUser, id: GATE_IDS.instanceGid },
      ...ordinals.map(k => ({ name: identityName(k), id: GATE_IDS.privateGid(k) })),
    ],
    ...(options.hostOverrides ?? {}),
  };

  const policy = {
    mode: 'systemd_scope',
    instance,
    identities: options.identities,
    unitPrefix: prefix,
    systemctlBin,
    agentSocketDir,
    agentStateRoot,
    identityEpoch: 1,
    // The service user and the instance group the sockets belong to (conformance compares
    // SocketUser/SocketGroup against them; production reads the daemon's own names).
    serviceUser,
    instanceGroup: serviceUser,
    listenSocket: join(runtimeDir, 'daemon.sock'),
    listenKind: 'unix',
    egressFacts: { driver: 'claude_code', providerHosts: [], registryHosts: ['registry.npmjs.org'] },
    unitExec: { runtime: process.execPath, shim: SHIM_PATH, maskedPrefixes: [] },
    doorTimeoutsMs: { turn: 600_000, build: 420_000, git: 30_000 },
    timing: { reprobeWindowMs: 300, pollMs: 20, helloTimeoutMs: 3_000, deathGraceMs: 150, quarantinePollMs: 50 },
    // CONTRACT (spec §2.7): the gate's chown is a seam — a gate cannot chgrp to a group it
    // is not in — recorded with the existing beforeServe hook in ONE ordered log.
    egressSeams: {
      // lstat(2) as root provisioned it: the real directory, with the site's private group.
      lstat: (path: string) => {
        let facts: ReturnType<typeof lstatSync>;
        try {
          facts = lstatSync(path);
        } catch {
          return null;
        }
        const k = /\/egress\/s(\d+)$/.exec(path) && dirname(path) === egressBase ? Number(/s(\d+)$/.exec(path)?.[1]) : null;
        return {
          kind: facts.isSymbolicLink() ? 'symlink' : facts.isDirectory() ? 'dir' : 'other',
          uid: facts.uid,
          gid: k !== null ? GATE_IDS.privateGid(k) : facts.gid,
          mode: facts.mode & 0o7777,
        } as const;
      },
      chown: (path: string, uid: number, gid: number) => {
        chowns.push({ path, uid, gid });
        gateEvents.push(`chown ${path} ${gid}`);
      },
      beforeServe: (socket: string) => {
        gateEvents.push(`serve ${socket}`);
      },
    },
    memoryMax: '2G',
    cpuQuota: '100%',
    tasksMax: 512,
    host,
    // PRE-LEAD-1b fields: today's code reads them. `transientStartAuthorized: true` lets it
    // reach the checks the gates ask about (F2's up-front refusal would otherwise answer first).
    transientStartAuthorized: true,
    agentUser: '',
    systemdRunBin,
    agentHome: join(dir, 'legacy_home'),
    ...(options.overrides ?? {}),
  };

  const built: GatePolicy = {
    policy,
    standIn,
    runtimeDir,
    agentSocketDir,
    agentStateRoot,
    facts: { instance, serviceUser, identityName },
    chowns,
    gateEvents,
    resolved,
  };
  // By default PID 1 has loaded exactly what this daemon expects (G9 plants its mismatches
  // over these): a conformance check is then a question every run passes, not a skip.
  for (const [slug, k] of options.identities) {
    for (const door of DOORS) plantShow(built, k, door, conformingShow(built, join(roots.sitesRoot, slug), k, door, version));
  }
  return built;
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * What PID 1 LOADED (spec §2.8 conformance, G9)
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** systemd's `format_timespan` for whole seconds: `45s`, `7min 15s`, `10min 15s`. */
export function timespan(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return [min > 0 ? `${min}min` : '', sec > 0 || min === 0 ? `${sec}s` : ''].filter(Boolean).join(' ');
}

export interface ShowFixtures {
  readonly service: string;
  readonly socket: string;
  readonly target: string;
}

/**
 * `systemctl show` of a CONFORMING (k, door) — the service (queried as `@probe`), its socket
 * and its target — as systemd 255/257 prints them, from the policy's own expectations.
 *
 * SYNTHETIC, and PROVISIONAL in its FORMATS (ExecStart's `{ path=… ; argv[]=… }`, time spans,
 * `BindPaths=src:dst:rbind`, byte-valued MemoryMax, CPUQuotaPerSecUSec, the resolved
 * IPAddressDeny). The probe's P7 capture (spec §7 → `tests/fixtures/systemd_show_255.txt`)
 * must be compared against these spellings; a format that differs is a fixture edit with
 * same-day ledger prose.
 *
 * HONEST LIMIT — G9 IS NOT CLOSED. C4 landed WITHOUT that capture: the file does not exist, so
 * every conforming row of G9 is driven by this hand-written fixture, derived from the same
 * expectations the comparator checks. It proves each DRIFT row is refused; it cannot prove real
 * systemd 255 prints what the comparator accepts (a mismatch is every confined run refused, or
 * a drift accepted by accident). Stated as residual 9 of engineering/SITE_BUILDER_INSTANCES.md
 * §10. Closed by running `deploy/probes/lead1b_pid1_probe.sh` (P7) on the 255 VM, committing its
 * capture and driving the conforming row from it — then this paragraph goes.
 */
export function conformingShow(
  host: Pick<GatePolicy, 'policy' | 'facts' | 'agentStateRoot' | 'runtimeDir' | 'agentSocketDir'>,
  workspace: string,
  k: number,
  door: Door,
  version: number,
): ShowFixtures {
  const prefix = `dedalo-site-${host.facts.instance}-agent-`;
  const ceilingMs = (host.policy.doorTimeoutsMs as Record<Door, number>)[door];
  const proxy = door !== 'git';
  const env =
    `DEDALO_DOOR=${door} DEDALO_UNIT_WORKDIR=${workspace} BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 ` +
    (proxy ? `HOME=${host.agentStateRoot}/s${k}/${door}` : 'HOME=/nonexistent GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1');
  const shim = host.policy.unitExec.shim as string;
  const runtime = host.policy.unitExec.runtime as string;
  const binds = proxy
    ? `${host.agentStateRoot}/s${k}/${door}:${host.agentStateRoot}/s${k}/${door}:rbind`
    : '';
  const readOnlyBinds = [
    ...(proxy ? [`${host.agentSocketDir}/egress/s${k}:/run/dedalo-egress:rbind`] : []),
    ...(door === 'turn' ? [`${turnGitconfigBind(host.agentStateRoot)}:rbind`] : []),
  ].join(' ');
  const service = [
    `Type=exec`,
    `User=${host.facts.identityName(k)}`,
    `DynamicUser=no`,
    `KillMode=control-group`,
    `KillSignal=15`,
    `SendSIGKILL=yes`,
    `FinalKillSignal=9`,
    `WorkingDirectory=/`,
    `StandardInput=socket`,
    `StandardOutput=socket`,
    `StandardError=journal`,
    `ExecStart={ path=${runtime} ; argv[]=${runtime} ${shim} ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }`,
    `ExecStartEx={ path=${runtime} ; argv[]=${runtime} ${shim} ; flags= ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }`,
    `Environment=${env}`,
    `NoNewPrivileges=yes`,
    `RestrictSUIDSGID=yes`,
    `LockPersonality=yes`,
    `PrivateTmp=yes`,
    `PrivateDevices=yes`,
    `ProtectSystem=strict`,
    `ProtectHome=yes`,
    `ProtectProc=invisible`,
    `UMask=0007`,
    `PrivateNetwork=yes`,
    `PrivateIPC=yes`,
    ...(version >= 257 ? ['PrivatePIDs=yes'] : []),
    `ReadWritePaths=${workspace}`,
    // One line per entry, as systemctl-show.c prints a struct array.
    `TemporaryFileSystem=/run:ro`,
    `TemporaryFileSystem=/dev/shm:mode=1777,nosuid,nodev`,
    `TemporaryFileSystem=${host.agentStateRoot}:ro`,
    `TemporaryFileSystem=/sys/fs/cgroup:ro`,
    `InaccessiblePaths=-/var/lib/mysql -/var/lib/mariadb -/var/lib/pgsql -/var/lib/postgresql${door === 'turn' ? ` ${workspace}/.git` : ''}`,
    `BindPaths=${binds}`,
    `BindReadOnlyPaths=${readOnlyBinds}`,
    `IPAddressDeny=0.0.0.0/0 ::/0`,
    `IPAddressAllow=${proxy ? '127.0.0.0/8 ::1/128' : ''}`,
    `RestrictAddressFamilies=${proxy ? 'AF_UNIX AF_INET AF_INET6 AF_NETLINK' : 'AF_UNIX AF_NETLINK'}`,
    `MemoryMax=2147483648`,
    `CPUQuotaPerSecUSec=1s`,
    `TasksMax=512`,
    `RuntimeMaxUSec=${timespan(Math.ceil(ceilingMs / 1000) + 15)}`,
    `TimeoutStopUSec=10s`,
    `BindsTo=${prefix}s${k}-${door}.target dedalo-site-builder@${host.facts.instance}.service`,
    `After=${prefix}s${k}-${door}.target dedalo-site-builder@${host.facts.instance}.service`,
    `CollectMode=inactive-or-failed`,
  ].join('\n');
  const socket = [
    `PartOf=dedalo-site-builder@${host.facts.instance}.service`,
    `Accept=yes`,
    `MaxConnections=1`,
    `SocketUser=${host.facts.serviceUser}`,
    `SocketGroup=${host.facts.serviceUser}`,
    `SocketMode=0600`,
    `DirectoryMode=0755`,
    `Listen=${socketPathFor(host.agentSocketDir, k, door)} (Stream)`,
    `TriggerLimitIntervalUSec=2s`,
    `TriggerLimitBurst=20`,
  ].join('\n');
  const others = DOORS.filter(other => other !== door).map(other => `${prefix}s${k}-${other}.target`);
  const after = door === 'turn' ? others : door === 'build' ? [`${prefix}s${k}-git.target`] : [];
  const target = [`Conflicts=${others.join(' ')}`, `After=${after.join(' ')}`, `StopWhenUnneeded=yes`].join('\n');
  return { service, socket, target };
}

/** Make the stand-in answer `show` for (k, door) with `fixtures`. */
export function plantShow(host: Pick<GatePolicy, 'standIn' | 'facts'>, k: number, door: Door, fixtures: ShowFixtures): void {
  const prefix = `dedalo-site-${host.facts.instance}-agent-`;
  host.standIn.showFixtures.set(`${prefix}s${k}-${door}@probe.service`, fixtures.service);
  host.standIn.showFixtures.set(`${prefix}s${k}-${door}.socket`, fixtures.socket);
  host.standIn.showFixtures.set(`${prefix}s${k}-${door}.target`, fixtures.target);
}

/** Poll until `predicate` holds, or throw after `timeoutMs`. */
export async function waitUntil(predicate: () => boolean, timeoutMs = 5_000, what = 'condition'): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`waitUntil: ${what} never held within ${timeoutMs} ms`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
