/**
 * THE SHIM — every agent unit's ExecStart, and a FRAMED RELAY (LEAD-1b, spec §2.3).
 *
 * Root renders one unit template per (site, door) (`provision/render/agent_units.ts`);
 * PID 1 starts an instance of it for each connection the daemon makes to the site's socket,
 * with that connection as this process's stdin and stdout (`StandardInput=socket`,
 * `StandardOutput=socket`). The run's argv, its environment and the daemon's network
 * namespace arrive OVER THE CONNECTION (`unit_frames.ts`), never in a file or a unit
 * property. This file holds NO policy (the policy is the unit's properties, root's) and does,
 * in this order:
 *
 *   1. HELLO. It says H — its door and the instance PID 1 started (read off
 *      `/proc/self/cgroup`) — then reads exactly one S. It REFUSES (exit 65, nothing spawned)
 *      an unknown frame, an over-cap length (at the header), a truncated frame, a spec that
 *      breaks the closed schema, a spec for another door than the unit's own
 *      (`DEDALO_DOOR`), and a spec that tries to set any key the UNIT fixes (HOME, DEDALO_*,
 *      the transpiler cache, git's configuration).
 *   2. PROVES THE NAMESPACE. `PrivateNetwork=yes` is a request, not a guarantee: unless this
 *      process is provably in a different network namespace from the daemon's (the identity
 *      the spec carries) AND every interface it can see is internal, it writes
 *      `[confinement] network namespace not in effect` and exits 78 (EX_CONFIG). Fail closed.
 *   3. FORWARDS the unit's loopback to the gate — `127.0.0.1:PROXY_PORT` → `proxy.sock` and
 *      `127.0.0.1:MCP_PORT` → `mcp.sock` — on a door with a bound socket directory.
 *   4. RUNS the argv in the workspace (`DEDALO_UNIT_WORKDIR`), with the spec's environment plus
 *      the unit's fixed keys (which win), stdio ['ignore', pipe, pipe] — the child NEVER holds
 *      the connection, so it cannot forge an exit frame: whatever it prints travels inside O/E.
 *      Output is relayed with backpressure (the child's pipe pauses while the socket drains).
 *   5. ENDS with one X {code, signal} and exits with the child's code. If the daemon goes away
 *      first (EOF: an interrupt, a timeout, the daemon's death), the child's process group gets
 *      SIGTERM, then SIGKILL after 5 s, and the shim exits.
 *
 * WHY THE UNIT'S OWN WORKING DIRECTORY IS `/`. Bun reads `bunfig.toml` (whose `preload`
 * EXECUTES CODE), `.env` and `tsconfig.json` from its cwd before it runs a line of this file,
 * and the workspace is the directory the agent writes. Started in `/`, the shim loads nothing
 * the agent authored; the CHILD then runs in the workspace.
 *
 * PID 1 OF ITS NAMESPACE only where PID 1 renders `PrivatePIDs=` (systemd >= 257): there, when
 * this process exits the kernel kills whatever the child left. Below 257 the unit's cgroup is
 * the cleanup — `systemctl stop` (and `RuntimeMaxSec=`) kill every process in it — and the
 * other runs are kept away by the uid, not by a namespace.
 *
 * Node builtins and the leaves' constants only: no config (it does not exist inside the unit).
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readlinkSync } from 'node:fs';
import { connect, createServer, type Server } from 'node:net';
import { networkInterfaces } from 'node:os';
import { Duplex } from 'node:stream';
import { join } from 'node:path';
import {
  DOOR_ENV,
  DOORS,
  EGRESS_MOUNT,
  MCP_PORT,
  MCP_SOCKET,
  PROXY_PORT,
  PROXY_SOCKET,
  WORKDIR_ENV,
} from './network_profile';
import {
  encodeFrame,
  encodeJsonFrame,
  FrameDecoder,
  isFixedEnvKey,
  MAX_CHUNK_BYTES,
  parseSpec,
  type RunSpec,
} from './unit_frames';

type Interfaces = Record<string, ReadonlyArray<{ readonly internal: boolean }> | undefined>;

/** EX_CONFIG: the unit is not configured the way this host was told it would be. */
export const EXIT_NO_NAMESPACE = 78;
/** EX_DATAERR: the daemon's side of the wire is not a spec this shim runs. */
export const EXIT_REFUSED_SPEC = 65;
/** EX_USAGE: the unit itself is not an agent unit (no door stated). */
export const EXIT_NO_DOOR = 64;

/** How long the child has after SIGTERM before SIGKILL, once the daemon has gone away. */
const KILL_GRACE_MS = 5_000;

/**
 * True when every interface this process can see is internal — i.e. only a netns's own `lo`.
 * An EMPTY answer is not "no host interface": a namespace always has its `lo`, and nothing
 * at all is what a failed enumeration looks like — so it is refused, never read as proof.
 */
export function checkNamespace(interfaces: Interfaces = networkInterfaces()): boolean {
  const lists = Object.values(interfaces).map(addresses => addresses ?? []);
  if (!lists.some(addresses => addresses.length > 0)) return false;
  return lists.every(addresses => addresses.every(address => address.internal));
}

/** This process's network namespace identity (`net:[<inode>]`) — Linux only. */
function ownNetns(): string {
  return readlinkSync('/proc/self/ns/net');
}

/** The unit PID 1 started this process in: the last segment of its cgroup path. */
function ownUnit(): string {
  const text = readFileSync('/proc/self/cgroup', 'utf8');
  const line = text.split('\n').find(entry => entry.startsWith('0::')) ?? text.split('\n')[0] ?? '';
  return line.split('/').pop()?.trim() ?? '';
}

export interface ShimSeams {
  /** The connection — the daemon's end is the peer. Default: fd 0/1 (the accepted socket). */
  readonly io?: Duplex;
  /** The unit's environment (the fixed keys). Default: process.env. */
  readonly env?: Record<string, string | undefined>;
  /** The instance name for H. Default: /proc/self/cgroup. */
  readonly unit?: () => string;
  readonly interfaces?: () => Interfaces;
  /** This process's namespace identity (default: /proc/self/ns/net). */
  readonly ownNetns?: () => string;
  readonly socketDir?: string;
  readonly ports?: { readonly proxy: number; readonly mcp: number };
  readonly stderr?: (text: string) => void;
}

/** A loopback TCP listener that pumps each connection to a unix socket, bytes only. */
function forward(port: number, socketPath: string): Promise<Server> {
  const server = createServer(client => {
    const upstream = connect(socketPath);
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
    client.pipe(upstream);
    upstream.pipe(client);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

/** The production connection: stdin reads the socket, stdout writes it. */
function stdioDuplex(): Duplex {
  const input = process.stdin;
  const output = process.stdout;
  const duplex = new Duplex({
    read() {
      input.resume();
    },
    write(chunk, _encoding, callback) {
      if (output.write(chunk)) callback();
      else output.once('drain', () => callback());
    },
    final(callback) {
      output.end(callback);
    },
  });
  input.on('data', chunk => {
    if (!duplex.push(chunk)) input.pause();
  });
  input.on('end', () => duplex.push(null));
  input.on('error', error => duplex.destroy(error));
  output.on('error', () => duplex.destroy());
  return duplex;
}

/**
 * END THE CONNECTION AND WAIT UNTIL IT HAS TAKEN EVERYTHING: resolves on 'finish' (the last
 * write and the end reached the socket), or on 'close' / 'error' (the peer is gone — nothing
 * more can be delivered, and waiting would hold the unit alive for nobody).
 */
function endFlushed(io: Duplex): Promise<void> {
  return new Promise(resolveFlushed => {
    let done = false;
    const settle = () => {
      if (done) return;
      done = true;
      resolveFlushed();
    };
    io.once('finish', settle);
    io.once('close', settle);
    io.once('error', settle);
    if (io.writableFinished || io.destroyed) {
      settle();
      return;
    }
    try {
      io.end();
    } catch {
      settle();
    }
  });
}

/** Read exactly one frame's worth of the spec, or a reason there is none. */
function readSpec(io: Duplex, decoder: FrameDecoder): Promise<RunSpec | string> {
  return new Promise(resolve => {
    let done = false;
    const finish = (value: RunSpec | string) => {
      if (done) return;
      done = true;
      io.off('data', onData);
      io.off('end', onEnd);
      io.off('close', onEnd);
      io.pause();
      resolve(value);
    };
    const onData = (chunk: Buffer) => {
      let frames;
      try {
        frames = decoder.push(chunk);
      } catch (error) {
        finish((error as Error).message);
        return;
      }
      if (frames.length === 0) return;
      const [first] = frames;
      if (frames.length > 1) {
        finish('the daemon sent more than the spec before the run started');
        return;
      }
      if (first?.type !== 'S') {
        finish(`the first frame from the daemon is '${String(first?.type)}', not the spec`);
        return;
      }
      try {
        finish(parseSpec(first.payload));
      } catch (error) {
        finish((error as Error).message);
      }
    };
    const onEnd = () => finish('the daemon went away before sending the spec');
    io.on('data', onData);
    io.once('end', onEnd);
    io.once('close', onEnd);
    io.resume();
  });
}

export async function main(_argv: readonly string[], seams: ShimSeams = {}): Promise<number> {
  const stderr = seams.stderr ?? ((text: string) => void process.stderr.write(text));
  const env = seams.env ?? (process.env as Record<string, string | undefined>);
  const door = env[DOOR_ENV] ?? '';
  const workdir = env[WORKDIR_ENV] ?? '';
  if (!(DOORS as readonly string[]).includes(door) || workdir === '') {
    stderr(`[confinement] shim: this unit states no door (${DOOR_ENV}) or no workspace (${WORKDIR_ENV}); nothing was run.\n`);
    return EXIT_NO_DOOR;
  }
  const io = seams.io ?? stdioDuplex();
  io.on('error', () => {});
  const send = (bytes: Uint8Array): boolean => {
    try {
      return io.write(bytes);
    } catch {
      return false;
    }
  };
  const refuse = (why: string): number => {
    stderr(`[confinement] shim: refused — ${why}. Nothing was run.\n`);
    io.destroy();
    return EXIT_REFUSED_SPEC;
  };

  // 1. HELLO, then exactly one spec.
  let unit = '';
  try {
    unit = (seams.unit ?? ownUnit)();
  } catch {
    unit = '';
  }
  send(encodeJsonFrame('H', { v: 1, door, unit }));
  const decoder = new FrameDecoder();
  const spec = await readSpec(io, decoder);
  if (typeof spec === 'string') return refuse(spec);
  if (spec.door !== door) return refuse(`the spec is for the '${spec.door}' door and this unit is the '${door}' door's`);
  const fixed = Object.keys(spec.env).filter(isFixedEnvKey);
  if (fixed.length > 0) return refuse(`the spec sets ${fixed.join(', ')}, which the unit fixes`);

  // 2. THE NAMESPACE — both proofs, and a proof that cannot be taken is a refusal.
  let identity: 'differs' | 'same' | 'unknown' = 'unknown';
  try {
    identity = (seams.ownNetns ?? ownNetns)() === spec.hostNetns ? 'same' : 'differs';
  } catch {
    identity = 'unknown';
  }
  let isolated = false;
  try {
    isolated = checkNamespace((seams.interfaces ?? networkInterfaces)());
  } catch {
    isolated = false;
  }
  if (identity !== 'differs' || !isolated) {
    const why =
      identity === 'same'
        ? 'shares the daemon’s network namespace'
        : identity === 'unknown'
          ? 'cannot read its own network namespace identity'
          : 'can see a host interface (or none at all)';
    stderr(
      `[confinement] network namespace not in effect: this unit ${why}, so PrivateNetwork= may ` +
        'not have been honoured and its loopback would be the HOST’s. Nothing was run.\n',
    );
    io.destroy();
    return EXIT_NO_NAMESPACE;
  }

  // 3. THE FORWARDS, on a door whose gate PID 1 bound in.
  const socketDir = seams.socketDir ?? EGRESS_MOUNT;
  const ports = seams.ports ?? { proxy: PROXY_PORT, mcp: MCP_PORT };
  const servers: Server[] = [];
  const stopForwards = () => {
    for (const server of servers) server.close();
  };
  if (existsSync(socketDir)) {
    const routes: Array<[number, string]> = [[ports.proxy, join(socketDir, PROXY_SOCKET)]];
    if (existsSync(join(socketDir, MCP_SOCKET))) routes.push([ports.mcp, join(socketDir, MCP_SOCKET)]);
    try {
      for (const [port, path] of routes) servers.push(await forward(port, path));
    } catch (error) {
      stopForwards();
      stderr(`[confinement] shim: cannot listen on the unit loopback (${String(error)}). Nothing was run.\n`);
      io.destroy();
      return 71;
    }
  }

  // 4. THE CHILD — the spec's environment, the unit's fixed keys winning; never the connection.
  const childEnv: Record<string, string> = { ...spec.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || key.startsWith('DEDALO_')) continue;
    if (isFixedEnvKey(key)) childEnv[key] = value;
  }

  return new Promise<number>(resolve => {
    let finished = false;
    let killTimer: ReturnType<typeof setTimeout> | null = null;
    const child = spawn(spec.argv[0] as string, spec.argv.slice(1), {
      cwd: workdir,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    const killGroup = (signal: NodeJS.Signals) => {
      try {
        if (child.pid !== undefined) process.kill(-child.pid, signal);
      } catch {
        try {
          child.kill(signal);
        } catch {
          // Already gone.
        }
      }
    };
    const finish = (code: number) => {
      if (finished) return;
      finished = true;
      if (killTimer) clearTimeout(killTimer);
      process.off('SIGTERM', onTerm);
      process.off('SIGINT', onInt);
      stopForwards();
      resolve(code);
    };
    // 9. THE DAEMON WENT AWAY: end the child's whole process group, then leave.
    const onPeerGone = () => {
      if (finished || child.exitCode !== null || child.signalCode !== null) return;
      killGroup('SIGTERM');
      killTimer = setTimeout(() => killGroup('SIGKILL'), KILL_GRACE_MS);
    };
    io.once('end', onPeerGone);
    io.once('close', onPeerGone);
    io.resume();
    const relaySignal = (signal: NodeJS.Signals) => () => killGroup(signal);
    const onTerm = relaySignal('SIGTERM');
    const onInt = relaySignal('SIGINT');
    process.on('SIGTERM', onTerm);
    process.on('SIGINT', onInt);

    // 7. THE OUTPUT, framed, with backpressure: the pipe pauses while the socket drains.
    const pump = (stream: NodeJS.ReadableStream, type: 'O' | 'E') => {
      stream.on('data', (chunk: Buffer) => {
        for (let at = 0; at < chunk.length; at += MAX_CHUNK_BYTES) {
          if (!send(encodeFrame(type, chunk.subarray(at, at + MAX_CHUNK_BYTES)))) {
            stream.pause();
            io.once('drain', () => stream.resume());
          }
        }
      });
    };
    if (child.stdout) pump(child.stdout, 'O');
    if (child.stderr) pump(child.stderr, 'E');

    child.once('error', error => {
      stderr(`[confinement] shim: cannot run '${spec.argv[0]}' (${error.message})\n`);
      send(encodeJsonFrame('X', { code: 127, signal: null }));
      void endFlushed(io).then(() => finish(127));
    });
    // 8. THE EXIT, after every byte of output: X — and only once the connection has TAKEN it
    // (every queued O/E and the X flushed to the socket) does this process return, because
    // the caller exits the process and an exit with bytes still queued loses the tail and the
    // exit record with it (the daemon would read a success as `unit_ended_without_exit_frame`).
    child.once('close', (code, signal) => {
      const status = code ?? 128 + (signal === 'SIGKILL' ? 9 : signal === 'SIGINT' ? 2 : 15);
      if (io.destroyed) {
        finish(status);
        return;
      }
      send(encodeJsonFrame('X', { code, signal: signal ?? null }));
      void endFlushed(io).then(() => finish(status));
    });
  });
}

/** THE UNIT'S ENTRY: run, then exit with the run's code. */
export async function entry(argv: readonly string[], seams: ShimSeams = {}): Promise<never> {
  process.exit(await main(argv, seams));
}

if (import.meta.main) {
  await entry(process.argv.slice(2));
}
